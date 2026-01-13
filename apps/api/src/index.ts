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
  const site = getSiteSettings(db);
  res.json({ site });
});

app.get("/api/about", (_req, res) => {
  const site = getSiteSettings(db);
  res.json({ about: site.about, heroImage: site.images.aboutHero });
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

// Serve uploaded images from the DB directory volume
app.use("/uploads", express.static(uploadsDir));

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
      fs.cpSync(uploadsDir, tmpUploads, { recursive: true });
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
  res.json({ site: getSiteSettings(db) });
});

adminRouter.put("/site", (req: AuthedRequest, res) => {
  const siteSchema = z.object({
    home: z.object({
      title: z.string().min(1).max(80),
      subtitle: z.string().max(200),
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
  res.json({ ok: true });
});

const upload = multer({
  dest: path.join(os.tmpdir(), "yablog_uploads"),
  limits: { fileSize: 1024 * 1024 * 1024 },
});

const uploadImage = multer({
  dest: uploadsDir,
  limits: { fileSize: 25 * 1024 * 1024 },
});

adminRouter.post("/upload", uploadImage.single("file"), (req: AuthedRequest & { file?: any }, res) => {
  const file = req.file as
    | { filename: string; originalname: string; mimetype: string; path: string }
    | undefined;
  if (!file) return res.status(400).json({ error: "file_required" });
  if (!file.mimetype.startsWith("image/")) {
    fs.rmSync(file.path, { force: true });
    return res.status(400).json({ error: "image_only" });
  }
  const ext = path.extname(file.originalname).toLowerCase() || ".img";
  const finalName = `${file.filename}${ext}`;
  fs.renameSync(file.path, path.join(uploadsDir, finalName));
  const url = `/uploads/${encodeURIComponent(finalName)}`;
  res.json({ ok: true, url });
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
