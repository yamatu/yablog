import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import multer from "multer";
import sharp from "sharp";
import tar from "tar";
import { z } from "zod";

import { authenticateUser, hashPassword, loginSchema, signToken, verifyPassword } from "./auth.js";
import { config } from "./config.js";
import {
  defaultSiteSettings,
  ensureAdminUser,
  getFirstUser,
  getSiteSettings,
  getUserById,
  hasAnyUsers,
  initDb,
  migrateDb,
  openDb,
  setSiteSettings,
  updateUserCredentials,
} from "./db.js";
import { requireAuth, type AuthedRequest } from "./middleware.js";
import { mountAdminRoutes } from "./routes/admin.js";
import { mountPublicRoutes } from "./routes/public.js";

const db = openDb();
initDb(db);
migrateDb(db);

const uploadsDir = path.join(path.dirname(config.databasePath), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

// Ensure a default site settings row exists
try {
  const current = getSiteSettings(db);
  // If it comes from default (missing row), persist it.
  const exists = db.prepare("SELECT 1 as ok FROM settings WHERE key = ? LIMIT 1").get("site_settings") as
    | { ok: 1 }
    | undefined;
  if (!exists) setSiteSettings(db, current ?? defaultSiteSettings());
} catch {
  setSiteSettings(db, defaultSiteSettings());
}

let isRestoring = false;
let isBackingUp = false;

let siteCache = getSiteSettings(db);

type BackupManifest = {
  version: 1;
  createdAt: string;
  files: { path: string; size: number; sha256: string }[];
};

const sha256File = async (filePath: string) => {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
};

const listFilesRecursive = (rootDir: string) => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  if (fs.existsSync(rootDir)) walk(rootDir);
  return out;
};

const isValidSqliteFile = (filePath: string) => {
  const fd = fs.openSync(filePath, "r");
  const header = Buffer.alloc(16);
  fs.readSync(fd, header, 0, 16, 0);
  fs.closeSync(fd);
  return header.subarray(0, 15).toString("utf8").startsWith("SQLite format 3");
};

const safeUploadName = (value: string) => {
  const name = path.basename(value);
  if (!name || name !== value) return null;
  if (name.startsWith(".")) return null;
  if (name.includes("..")) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  if (name === "_thumbs") return null;
  if (name === "_tmp") return null;
  return name;
};

const thumbsDir = path.join(uploadsDir, "_thumbs");
fs.mkdirSync(thumbsDir, { recursive: true });
const thumbNameFor = (name: string) => `t_${name}.webp`;

const uploadsTmpDir = path.join(uploadsDir, "_tmp");
fs.mkdirSync(uploadsTmpDir, { recursive: true });
try {
  for (const entry of fs.readdirSync(uploadsTmpDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    fs.rmSync(path.join(uploadsTmpDir, entry.name), { force: true });
  }
} catch {
  // ignore
}

const optimizeAndWriteImage = async (inputPath: string, outPath: string, outExt: string) => {
  const img = sharp(inputPath).rotate().resize({ width: 2400, withoutEnlargement: true });
  if (outExt === ".jpg" || outExt === ".jpeg") return img.jpeg({ quality: 82, mozjpeg: true }).toFile(outPath);
  if (outExt === ".png") return img.png({ compressionLevel: 9 }).toFile(outPath);
  if (outExt === ".avif") return img.avif({ quality: 50 }).toFile(outPath);
  return img.webp({ quality: 82 }).toFile(outPath);
};

const writeThumb = async (inputPath: string, outPath: string) => {
  await sharp(inputPath)
    .rotate()
    .resize({ width: 640, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(outPath);
};

if (!hasAnyUsers(db)) {
  if (!config.adminUsername || !config.adminPassword) {
    // eslint-disable-next-line no-console
    console.error(
      "[yablog-api] First run requires ADMIN_USERNAME and ADMIN_PASSWORD (used to create the initial admin).",
    );
    process.exit(1);
  }
  ensureAdminUser(db, {
    username: config.adminUsername,
    passwordHash: await hashPassword(config.adminPassword),
  });
} else if (config.resetAdminOnStart) {
  if (!config.adminUsername || !config.adminPassword) {
    // eslint-disable-next-line no-console
    console.error("[yablog-api] RESET_ADMIN_ON_START=1 requires ADMIN_USERNAME and ADMIN_PASSWORD.");
    process.exit(1);
  }
  const first = getFirstUser(db);
  if (!first) {
    // should not happen since hasAnyUsers(db) is true
    // eslint-disable-next-line no-console
    console.error("[yablog-api] No user found to reset.");
    process.exit(1);
  }
  updateUserCredentials(db, {
    id: first.id,
    username: config.adminUsername,
    passwordHash: await hashPassword(config.adminPassword),
  });
  // eslint-disable-next-line no-console
  console.warn("[yablog-api] Admin credentials reset via RESET_ADMIN_ON_START=1.");
}

const app = express();
app.set("trust proxy", true);
app.use(helmet());
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

let server: ReturnType<typeof app.listen> | undefined;

app.use((req, res, next) => {
  if (
    isRestoring &&
    !req.path.startsWith("/api/health") &&
    !req.path.startsWith("/api/admin/restore")
  ) {
    res.setHeader("connection", "close");
    return res.status(503).json({ error: "restarting" });
  }
  return next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/site", (_req, res) => {
  res.json({ site: siteCache });
});

app.get("/api/about", (_req, res) => {
  res.json({ about: siteCache.about, heroImage: siteCache.images.aboutHero });
});

app.post("/api/auth/login", async (req, res) => {
  const creds = loginSchema.parse(req.body);
  const user = await authenticateUser(db, creds);
  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  const token = signToken({ userId: user.id, username: user.username });
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
  res.json({ ok: true, user });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(config.cookieName, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

const publicRouter = express.Router();
mountPublicRoutes(publicRouter, db);
app.use("/api", publicRouter);

// Serve uploaded images from the DB directory volume (with optional hotlink protection)
app.use("/uploads", (req, res, next) => {
  const hotlink = siteCache.security?.hotlink;
  if (!hotlink?.enabled) return next();

  const raw = req.get("referer") ?? req.get("origin") ?? "";
  if (!raw) return next(); // allow no-referer requests (apps, RSS readers, etc.)

  try {
    const ref = new URL(raw);
    const origin = `${ref.protocol}//${ref.host}`;
    const self = `${req.protocol}://${req.get("host")}`;
    const allowed = new Set([self, ...(hotlink.allowedOrigins ?? [])]);
    if (allowed.has(origin)) return next();
    res.setHeader("connection", "close");
    return res.status(403).send("forbidden");
  } catch {
    return next();
  }
});
app.use(
  "/uploads",
  express.static(uploadsDir, {
    maxAge: "1h",
    setHeaders: (res) => {
      res.setHeader("cache-control", "public, max-age=3600");
    },
  }),
);

const adminRouter = express.Router();
adminRouter.use(requireAuth);

adminRouter.get("/backup", async (_req, res) => {
  if (isRestoring) return res.status(503).json({ error: "restarting" });
  if (isBackingUp) return res.status(429).json({ error: "busy" });
  isBackingUp = true;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `yablog-backup-${ts}.db.gz`;
  const dir = path.dirname(config.databasePath);
  const tmpDbPath = path.join(dir, `yablog.backup.${Date.now()}.db`);

  try {
    await db.backup(tmpDbPath);
    res.setHeader("content-type", "application/gzip");
    res.setHeader("content-disposition", `attachment; filename="${filename}"`);
    res.setHeader("cache-control", "no-store");

    await pipeline(fs.createReadStream(tmpDbPath), zlib.createGzip({ level: 9 }), res);
  } finally {
    isBackingUp = false;
    fs.rmSync(tmpDbPath, { force: true });
  }
});

adminRouter.get("/backup/full", async (_req, res) => {
  if (isRestoring) return res.status(503).json({ error: "restarting" });
  if (isBackingUp) return res.status(429).json({ error: "busy" });
  isBackingUp = true;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `yablog-full-backup-${ts}.tar.gz`;
  const dir = path.dirname(config.databasePath);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yablog_full_backup_"));
  const tmpDb = path.join(tmpDir, "db.sqlite");
  const tmpUploads = path.join(tmpDir, "uploads");
  const tmpManifest = path.join(tmpDir, "manifest.json");
  const tmpTar = path.join(os.tmpdir(), `yablog-full-backup-${Date.now()}.tar.gz`);

  try {
    await db.backup(tmpDb);
    fs.mkdirSync(tmpUploads, { recursive: true });
    if (fs.existsSync(uploadsDir)) {
      fs.cpSync(uploadsDir, tmpUploads, {
        recursive: true,
        filter: (src) => {
          const rel = path.relative(uploadsDir, src);
          if (!rel) return true;
          return !rel.split(path.sep).includes("_tmp");
        },
      });
    }

    const files: BackupManifest["files"] = [];
    const all = [tmpDb, ...listFilesRecursive(tmpUploads)];
    for (const full of all) {
      const stat = fs.statSync(full);
      const rel = path.relative(tmpDir, full).replaceAll(path.sep, "/");
      files.push({ path: rel, size: stat.size, sha256: await sha256File(full) });
    }

    const manifest: BackupManifest = { version: 1, createdAt: new Date().toISOString(), files };
    fs.writeFileSync(tmpManifest, JSON.stringify(manifest, null, 2), "utf8");

    await tar.c(
      {
        gzip: { level: 9 },
        cwd: tmpDir,
        file: tmpTar,
        portable: true,
      },
      ["manifest.json", "db.sqlite", "uploads"],
    );

    res.setHeader("content-type", "application/gzip");
    res.setHeader("content-disposition", `attachment; filename="${filename}"`);
    res.setHeader("cache-control", "no-store");
    await pipeline(fs.createReadStream(tmpTar), res);
  } finally {
    isBackingUp = false;
    fs.rmSync(tmpTar, { force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

adminRouter.get("/site", (_req, res) => {
  res.json({ site: siteCache });
});

adminRouter.put("/site", (req: AuthedRequest, res) => {
  const siteSchema = z.object({
    nav: z.object({
      brandText: z.string().min(1).max(32),
      links: z
        .array(
          z.object({
            label: z.string().min(1).max(24),
            path: z.string().min(1).max(200),
            icon: z.string().min(1).max(40),
          }),
        )
        .default([]),
    }),
    home: z.object({
      title: z.string().min(1).max(80),
      subtitle: z.string().max(200),
    }),
    security: z.object({
      hotlink: z.object({
        enabled: z.boolean().default(false),
        allowedOrigins: z.array(z.string().min(1)).default([]),
      }),
    }),
    images: z.object({
      homeHero: z.string(),
      archiveHero: z.string(),
      tagsHero: z.string(),
      aboutHero: z.string(),
      defaultPostCover: z.string(),
    }),
    sidebar: z.object({
      avatarUrl: z.string(),
      name: z.string(),
      bio: z.string(),
      noticeMd: z.string().default(""),
      followButtons: z.array(z.object({ label: z.string().min(1), url: z.string().min(1) })).default([]),
      socials: z
        .array(z.object({ type: z.string().min(1), url: z.string().min(1), label: z.string().optional() }))
        .default([]),
    }),
    about: z.object({
      title: z.string(),
      contentMd: z.string().default(""),
    }),
  });

  const body = z.object({ site: siteSchema }).parse(req.body);
  setSiteSettings(db, body.site);
  siteCache = body.site;
  res.json({ ok: true });
});

const upload = multer({
  dest: path.join(os.tmpdir(), "yablog_uploads"),
  limits: { fileSize: 1024 * 1024 * 1024 },
});

const uploadImage = multer({
  // Keep temp uploads on the same filesystem as /data/uploads to avoid EXDEV rename errors in Docker volumes.
  dest: uploadsTmpDir,
  limits: { fileSize: 25 * 1024 * 1024 },
});

adminRouter.post("/upload", uploadImage.single("file"), async (req: AuthedRequest & { file?: any }, res) => {
  const query = z.object({ replace: z.string().optional() }).parse(req.query);

  const file = req.file as
    | { filename: string; originalname: string; mimetype: string; path: string }
    | undefined;
  if (!file) return res.status(400).json({ error: "file_required" });
  if (!file.mimetype.startsWith("image/")) {
    fs.rmSync(file.path, { force: true });
    return res.status(400).json({ error: "image_only" });
  }

  const rawExt = path.extname(file.originalname).toLowerCase() || ".img";
  const passthrough = rawExt === ".gif" || rawExt === ".svg";
  const outExt = passthrough ? rawExt : ".webp";

  const replaceName = query.replace ? safeUploadName(String(query.replace)) : null;
  const targetName = replaceName ?? `${file.filename}${outExt}`;
  const targetPath = path.join(uploadsDir, targetName);

  if (replaceName) {
    if (!fs.existsSync(targetPath)) {
      fs.rmSync(file.path, { force: true });
      return res.status(404).json({ error: "not_found" });
    }
  }

  const targetExt = path.extname(targetName).toLowerCase();
  const tmpOut = path.join(
    uploadsTmpDir,
    `opt_${Date.now()}_${Math.random().toString(16).slice(2)}${targetExt || ".img"}`,
  );

  try {
    if (targetExt === ".gif" || targetExt === ".svg") {
      fs.rmSync(targetPath, { force: true });
      fs.renameSync(file.path, targetPath);
    } else {
      try {
        await optimizeAndWriteImage(file.path, tmpOut, targetExt);
        fs.rmSync(targetPath, { force: true });
        fs.renameSync(tmpOut, targetPath);
        fs.rmSync(file.path, { force: true });
      } catch {
        // If optimization fails (e.g. HEIC), fall back to keeping the original file/ext for NEW uploads.
        if (replaceName) throw new Error("replace_optimize_failed");
        const fallbackName = `${file.filename}${rawExt}`;
        const fallbackPath = path.join(uploadsDir, fallbackName);
        fs.rmSync(fallbackPath, { force: true });
        fs.renameSync(file.path, fallbackPath);

        try {
          await writeThumb(fallbackPath, path.join(thumbsDir, thumbNameFor(fallbackName)));
        } catch {
          // ignore thumb errors
        }

        const url = `/uploads/${encodeURIComponent(fallbackName)}`;
        return res.json({ ok: true, url });
      }
    }

    // Best-effort thumb generation (skip svg/gif)
    if (targetExt !== ".svg" && targetExt !== ".gif") {
      const tpath = path.join(thumbsDir, thumbNameFor(targetName));
      try {
        await writeThumb(targetPath, tpath);
      } catch {
        // ignore thumb errors
      }
    }

    const url = `/uploads/${encodeURIComponent(targetName)}`;
    res.json({ ok: true, url });
  } catch (e) {
    fs.rmSync(file.path, { force: true });
    fs.rmSync(tmpOut, { force: true });
    // eslint-disable-next-line no-console
    console.error("[yablog-api] upload failed", e);
    res.status(500).json({ error: "upload_failed" });
  }
});

adminRouter.get("/uploads", (_req: AuthedRequest, res) => {
  const items: { name: string; url: string; thumbUrl: string | null; size: number; updatedAt: string }[] = [];
  for (const entry of fs.readdirSync(uploadsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (name === "db.sqlite") continue;
    if (name.startsWith(".")) continue;
    if (name === "README") continue;
    if (name === "db.sqlite-wal" || name === "db.sqlite-shm") continue;
    if (name === "_thumbs") continue;
    if (name.startsWith("t_") && name.endsWith(".webp")) continue;
    // ignore thumbs (stored in _thumbs anyway)

    const full = path.join(uploadsDir, name);
    const stat = fs.statSync(full);
    const thumbPath = path.join(thumbsDir, thumbNameFor(name));
    const thumbUrl = fs.existsSync(thumbPath)
      ? `/uploads/_thumbs/${encodeURIComponent(thumbNameFor(name))}`
      : null;
    items.push({
      name,
      url: `/uploads/${encodeURIComponent(name)}`,
      thumbUrl,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    });
  }
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json({ items });
});

adminRouter.delete("/uploads/:name", (req: AuthedRequest, res) => {
  const { name: raw } = z.object({ name: z.string().min(1) }).parse(req.params);
  const name = safeUploadName(raw);
  if (!name) return res.status(400).json({ error: "invalid_name" });

  const target = path.join(uploadsDir, name);
  if (!fs.existsSync(target)) return res.status(404).json({ error: "not_found" });

  fs.rmSync(target, { force: true });
  fs.rmSync(path.join(thumbsDir, thumbNameFor(name)), { force: true });
  res.json({ ok: true });
});

adminRouter.post("/restore", upload.single("file"), async (req: AuthedRequest & { file?: any }, res) => {
  if (isRestoring) return res.status(429).json({ error: "busy" });
  const file = req.file as { path: string; originalname: string } | undefined;
  if (!file) return res.status(400).json({ error: "file_required" });

  isRestoring = true;

  const dir = path.dirname(config.databasePath);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const restoredDbPath = path.join(dir, `yablog.restored.${Date.now()}.db`);
  const preRestorePath = path.join(dir, `yablog.pre-restore.${ts}.db`);
  let dbClosed = false;

  try {
    const isGz = file.originalname.toLowerCase().endsWith(".gz");
    if (isGz) {
      await pipeline(
        fs.createReadStream(file.path),
        zlib.createGunzip(),
        fs.createWriteStream(restoredDbPath),
      );
    } else {
      fs.copyFileSync(file.path, restoredDbPath);
    }

    {
      const fd = fs.openSync(restoredDbPath, "r");
      const header = Buffer.alloc(16);
      fs.readSync(fd, header, 0, 16, 0);
      fs.closeSync(fd);
      if (!header.subarray(0, 15).toString("utf8").startsWith("SQLite format 3")) {
        isRestoring = false;
        return res.status(400).json({ error: "invalid_sqlite_file" });
      }
    }

    await db.backup(preRestorePath);

    // Stop accepting new connections; active requests are already gated to 503 via isRestoring.
    server?.close();

    try {
      db.close();
      dbClosed = true;
    } catch {
      dbClosed = true;
    }

    fs.rmSync(`${config.databasePath}-wal`, { force: true });
    fs.rmSync(`${config.databasePath}-shm`, { force: true });

    if (fs.existsSync(config.databasePath)) {
      fs.renameSync(config.databasePath, path.join(dir, `yablog.replaced.${ts}.db`));
    }
    fs.renameSync(restoredDbPath, config.databasePath);

    res.json({ ok: true, restarting: true });

    setTimeout(() => process.exit(0), 150);
  } catch (e) {
    // After we start restore, failing "half-way" should restart the process to avoid a stuck closed DB.
    // eslint-disable-next-line no-console
    console.error("[yablog-api] restore failed", e);
    if (!res.headersSent) {
      res.status(500).json({ error: "restore_failed", restarting: dbClosed });
    }
    if (dbClosed) setTimeout(() => process.exit(1), 150);
    if (!dbClosed) isRestoring = false;
  } finally {
    fs.rmSync(file.path, { force: true });
    fs.rmSync(restoredDbPath, { force: true });
  }
});

adminRouter.post(
  "/restore/full",
  upload.single("file"),
  async (req: AuthedRequest & { file?: any }, res) => {
    if (isRestoring) return res.status(429).json({ error: "busy" });
    const file = req.file as { path: string; originalname: string } | undefined;
    if (!file) return res.status(400).json({ error: "file_required" });

    isRestoring = true;
    const dir = path.dirname(config.databasePath);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");

    const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "yablog_restore_"));
    const restoredDbPath = path.join(dir, `yablog.restored.${Date.now()}.db`);
    const stagedUploads = path.join(dir, `uploads.restored.${Date.now()}`);
    const preRestorePath = path.join(dir, `yablog.pre-restore.${ts}.db`);
    let dbClosed = false;

    try {
      await tar.x({ file: file.path, cwd: extractDir, strict: true });
      const manifestPath = path.join(extractDir, "manifest.json");
      const dbPath = path.join(extractDir, "db.sqlite");
      const uploadsPath = path.join(extractDir, "uploads");

      if (!fs.existsSync(manifestPath) || !fs.existsSync(dbPath)) {
        isRestoring = false;
        return res.status(400).json({ error: "invalid_backup" });
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BackupManifest;
      if (manifest.version !== 1) {
        isRestoring = false;
        return res.status(400).json({ error: "unsupported_backup_version" });
      }

      for (const entry of manifest.files) {
        const full = path.join(extractDir, entry.path);
        if (!fs.existsSync(full)) {
          isRestoring = false;
          return res.status(400).json({ error: "backup_missing_file" });
        }
        const stat = fs.statSync(full);
        if (stat.size !== entry.size) {
          isRestoring = false;
          return res.status(400).json({ error: "backup_size_mismatch" });
        }
        const hash = await sha256File(full);
        if (hash !== entry.sha256) {
          isRestoring = false;
          return res.status(400).json({ error: "backup_hash_mismatch" });
        }
      }

      if (!isValidSqliteFile(dbPath)) {
        isRestoring = false;
        return res.status(400).json({ error: "invalid_sqlite_file" });
      }

      await db.backup(preRestorePath);

      // Stage DB + uploads inside the mounted data directory for atomic renames.
      fs.copyFileSync(dbPath, restoredDbPath);
      fs.rmSync(stagedUploads, { recursive: true, force: true });
      fs.mkdirSync(stagedUploads, { recursive: true });
      if (fs.existsSync(uploadsPath)) {
        fs.cpSync(uploadsPath, stagedUploads, { recursive: true });
      }

      server?.close();
      try {
        db.close();
        dbClosed = true;
      } catch {
        dbClosed = true;
      }

      fs.rmSync(`${config.databasePath}-wal`, { force: true });
      fs.rmSync(`${config.databasePath}-shm`, { force: true });

      if (fs.existsSync(config.databasePath)) {
        fs.renameSync(config.databasePath, path.join(dir, `yablog.replaced.${ts}.db`));
      }
      fs.renameSync(restoredDbPath, config.databasePath);

      const replacedUploads = path.join(dir, `uploads.replaced.${ts}`);
      if (fs.existsSync(uploadsDir)) {
        fs.rmSync(replacedUploads, { recursive: true, force: true });
        fs.renameSync(uploadsDir, replacedUploads);
      }
      fs.renameSync(stagedUploads, uploadsDir);

      res.json({ ok: true, restarting: true });
      setTimeout(() => process.exit(0), 150);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[yablog-api] full restore failed", e);
      if (!res.headersSent) res.status(500).json({ error: "restore_failed", restarting: dbClosed });
      if (dbClosed) setTimeout(() => process.exit(1), 150);
      if (!dbClosed) isRestoring = false;
    } finally {
      fs.rmSync(file.path, { force: true });
      fs.rmSync(extractDir, { recursive: true, force: true });
      fs.rmSync(restoredDbPath, { force: true });
      fs.rmSync(stagedUploads, { recursive: true, force: true });
    }
  },
);

adminRouter.put("/account", async (req: AuthedRequest, res) => {
  const body = z
    .object({
      currentPassword: z.string().min(1).max(200),
      newUsername: z.string().min(1).max(64).optional(),
      newPassword: z.string().min(8).max(200).optional(),
    })
    .refine((v) => Boolean(v.newUsername || v.newPassword), {
      message: "newUsername or newPassword required",
    })
    .parse(req.body);

  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const row = getUserById(db, userId);
  if (!row) return res.status(401).json({ error: "unauthorized" });

  const ok = await verifyPassword(body.currentPassword, row.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  const nextUsername = body.newUsername?.trim() || row.username;
  const nextPasswordHash = body.newPassword ? await hashPassword(body.newPassword) : row.passwordHash;

  try {
    db.prepare("UPDATE users SET username = ?, password_hash = ? WHERE id = ?").run(
      nextUsername,
      nextPasswordHash,
      userId,
    );
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      return res.status(409).json({ error: "username_taken" });
    }
    throw e;
  }

  const token = signToken({ userId, username: nextUsername });
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  res.json({ ok: true, user: { userId, username: nextUsername } });
});

mountAdminRoutes(adminRouter, db);
app.use("/api/admin", adminRouter);

if (config.webDistPath && fs.existsSync(config.webDistPath)) {
  const indexHtml = path.join(config.webDistPath, "index.html");
  app.use(express.static(config.webDistPath));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).json({ error: "not_found" });
    return res.sendFile(indexHtml);
  });
}

server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[yablog-api] listening on :${config.port}`);
  if (config.jwtSecret === "dev-only-change-me") {
    console.warn("[yablog-api] WARNING: JWT_SECRET is using the default dev value.");
  }
});
