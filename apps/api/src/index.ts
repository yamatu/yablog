import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import multer from "multer";
import sharp from "sharp";
import tar from "tar";
import { z } from "zod";

import { authenticateUser, hashPassword, loginSchema, signToken, verifyPassword } from "./auth.js";
import { createCache } from "./cache.js";
import { config } from "./config.js";
import {
  defaultAiSettings,
  defaultSiteSettings,
  deleteIpBan,
  ensureAdminUser,
  getFirstUser,
  getAiSettings,
  getSiteSettings,
  getUserById,
  hasAnyUsers,
  initDb,
  listIpBans,
  migrateDb,
  openDb,
  setAiSettings,
  setSiteSettings,
  upsertIpBan,
  updateUserCredentials,
} from "./db.js";
import { requireAuth, type AuthedRequest } from "./middleware.js";
import { mountAdminRoutes } from "./routes/admin.js";
import { mountPublicRoutes } from "./routes/public.js";

const cache = await createCache();

const db = openDb();
initDb(db);
migrateDb(db);

const uploadsDir = path.join(path.dirname(config.databasePath), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
// Codex CLI needs a stable CODEX_HOME (it refuses to create helper binaries under /tmp).
const codexHomeDir = path.join(path.dirname(config.databasePath), "codex_home");
fs.mkdirSync(codexHomeDir, { recursive: true });

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

// Ensure a default AI settings row exists (admin-only secrets).
try {
  const current = getAiSettings(db);
  const exists = db.prepare("SELECT 1 as ok FROM settings WHERE key = ? LIMIT 1").get("ai_settings") as
    | { ok: 1 }
    | undefined;
  if (!exists) setAiSettings(db, current ?? defaultAiSettings());
} catch {
  setAiSettings(db, defaultAiSettings());
}

let isRestoring = false;
let isBackingUp = false;

let siteCache = getSiteSettings(db);
let aiCache = getAiSettings(db);

const ipKey = (ip: string | undefined | null) => (ip ?? "").replace("::ffff:", "") || "unknown";
let bannedIpSet = new Set<string>();
try {
  bannedIpSet = new Set(listIpBans(db).map((b) => b.ip));
} catch {
  bannedIpSet = new Set();
}

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

const normalizeApiBase = (raw: string) => {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const noSlash = s.replace(/\/+$/, "");
  // Common mis-config: .../v1/codex -> .../v1
  return noSlash.replace(/\/v1\/codex$/i, "/v1");
};

const isCodexOnlyHost = (apiBase: string) => {
  const s = apiBase.toLowerCase();
  return s.includes("codex-api.packycode.com");
};

const withTimeout = async <T,>(p: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> => {
  let t: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_r, rej) => {
    t = setTimeout(() => {
      try {
        onTimeout?.();
      } finally {
        rej(new Error("timeout"));
      }
    }, ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
};

const fetchJSON = async (url: string, args: { apiKey: string; body: any; timeoutMs: number }) => {
  const ctrl = new AbortController();
  const { apiKey, body, timeoutMs } = args;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const doFetch = async () => {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { res, text, json };
  };

  try {
    return await withTimeout(doFetch(), timeoutMs, () => ctrl.abort());
  } catch (e) {
    ctrl.abort();
    throw e;
  }
};

const messagesToPrompt = (messages: { role: string; content: string }[]) => {
  const guard =
    "You are a helpful assistant. Do not execute commands, do not read/write files, do not access network. Only answer the user's last question with plain text.";
  const lines = [guard, ""];
  for (const m of messages) {
    const role = String(m.role ?? "").toUpperCase();
    const content = String(m.content ?? "");
    lines.push(`${role}: ${content}`);
  }
  lines.push("", "ASSISTANT:");
  return lines.join("\n");
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
app.use((req, res, next) => {
  const ip = ipKey(req.ip);
  if (bannedIpSet.has(ip)) {
    res.setHeader("connection", "close");
    return res.status(403).json({ error: "ip_banned" });
  }
  return next();
});
app.use(
  helmet({
    // We allow users to configure remote images (Unsplash/DiceBear/any https URL), so the strict defaults
    // would break common usage in production.
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "object-src": ["'none'"],
        // Vite production bundles are same-origin.
        "script-src": ["'self'"],
        // We use inline styles heavily (e.g. backgroundImage).
        "style-src": ["'self'", "'unsafe-inline'"],
        // Allow remote images (https) + local uploads + data/blob for markdown/avatars.
        "img-src": ["'self'", "data:", "blob:", "https:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'self'"],
      },
    },
  }),
);
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

// Cloudflare "Cache Everything" can make new posts not visible immediately.
// This switch lets admin force `no-store` on HTML + public GET APIs.
const setNoStore = (res: express.Response) => {
  res.setHeader("cache-control", "no-store");
  res.setHeader("pragma", "no-cache");
  res.setHeader("expires", "0");
  // Hints for CDNs/reverse proxies.
  res.setHeader("cdn-cache-control", "no-store");
  res.setHeader("surrogate-control", "no-store");
};
const setShortCache = (res: express.Response, sec: number) => {
  const v = `public, max-age=${sec}`;
  res.setHeader("cache-control", v);
  res.setHeader("cdn-cache-control", v);
  res.setHeader("surrogate-control", v);
};
app.use((req, res, next) => {
  const p = req.path || "";
  if (p.startsWith("/assets/") || p.startsWith("/uploads/")) return next();
  // Never cache admin/auth.
  // Note: `/admin/*` is the SPA admin UI (HTML). Never cache it even if CDN cache is enabled.
  if (p === "/admin" || p.startsWith("/admin/")) {
    setNoStore(res);
    return next();
  }
  if (p.startsWith("/api/admin") || p.startsWith("/api/auth") || p.startsWith("/api/health")) {
    setNoStore(res);
    return next();
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    setNoStore(res);
    return next();
  }

  const enabled = Boolean(siteCache?.cdn?.cloudflare?.cacheEnabled);
  if (!enabled) {
    setNoStore(res);
    return next();
  }

  // Conservative defaults (still allows CDN caching, but reduces staleness).
  if (p.startsWith("/api/")) setShortCache(res, 10);
  else setShortCache(res, 30);
  return next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/site", (_req, res) => {
  res.json({ site: siteCache });
});

app.get("/api/about", (_req, res) => {
  res.json({ about: siteCache.about, heroImage: siteCache.images.aboutHero });
});

app.post("/api/chat", async (req, res) => {
  if (!aiCache.enabled) return res.status(503).json({ error: "ai_disabled" });

  const body = z
    .object({
      messages: z
        .array(
          z.object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string().min(1).max(4000),
          }),
        )
        .min(1)
        .max(40),
    })
    .parse(req.body);

  const messages = [...body.messages];
  if (messages[0]?.role !== "system") {
    messages.unshift({
      role: "system",
      content:
        "You are a helpful assistant. Do not execute commands, do not read/write files, do not access network. Only answer with plain text.",
    });
    if (messages.length > 40) messages.length = 40;
  }

  const ip = ipKey(req.ip);
  const [rlIp, rlGlobal] = await Promise.all([
    cache.rateLimit({ bucket: "chat", key: ip, limit: 20, windowSec: 60 }),
    cache.rateLimit({ bucket: "chat:g", key: "global", limit: 250, windowSec: 60 }),
  ]);

  if (!rlIp.allowed || !rlGlobal.allowed) {
    void cache.recordSuspicious({ ip, bucket: "chat", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "block" });
    res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
    return res.status(429).json({ error: "rate_limited" });
  }

  const defaults = defaultAiSettings();
  const settings = aiCache;

  const cfgToml = (settings.codex?.configToml ?? "").trim();
  const model = (settings.model || defaults.model).trim() || defaults.model;
  const apiBaseRaw = String(settings.apiBase ?? "").trim();
  const apiBase = normalizeApiBase(apiBaseRaw || (cfgToml ? "" : defaults.apiBase));
  const timeoutMs = Math.min(5 * 60_000, Math.max(5_000, settings.timeoutMs || defaults.timeoutMs));
  const envKey = (settings.codex?.envKey || defaults.codex.envKey).trim() || defaults.codex.envKey;
  const wireApi = (settings.codex?.wireApi ?? defaults.codex.wireApi) as "responses" | "chat";

  const mode = settings.mode || defaults.mode;
  const shouldCodex = mode === "codex" || (mode === "auto" && (isCodexOnlyHost(apiBase) || Boolean(cfgToml)));
  if (!apiBase && !shouldCodex) return res.status(400).json({ error: "ai_not_configured" });
  if (!apiBase && shouldCodex && !cfgToml) return res.status(400).json({ error: "ai_not_configured" });

  const tryHttp = async () => {
    const urlResponses = `${apiBase}/responses`;
    const payload = {
      model,
      input: messages,
      max_output_tokens: 800,
    };

    const r1 = await fetchJSON(urlResponses, { apiKey: settings.apiKey, body: payload, timeoutMs });
    if (r1.res.ok && r1.json) {
      const j = r1.json as any;
      const outputText =
        typeof j.output_text === "string"
          ? j.output_text
          : Array.isArray(j.output)
            ? j.output
                .flatMap((it: any) =>
                  Array.isArray(it?.content)
                    ? it.content.map((c: any) => (typeof c?.text === "string" ? c.text : "")).filter(Boolean)
                    : [],
                )
                .join("")
            : "";
      if (outputText) return outputText;
    }

    // Fallback for OpenAI-compatible servers without /responses
    if (r1.res.status === 404 || r1.res.status === 405) {
      const urlChat = `${apiBase}/chat/completions`;
      const r2 = await fetchJSON(urlChat, {
        apiKey: settings.apiKey,
        timeoutMs,
        body: { model, messages, max_tokens: 800 },
      });
      if (r2.res.ok && r2.json) {
        const content = (r2.json as any)?.choices?.[0]?.message?.content;
        if (typeof content === "string" && content.trim()) return content;
      }
      throw new Error(r2.json?.error?.message || r2.text || `HTTP ${r2.res.status}`);
    }

    // Some endpoints respond 400 with a "Codex CLI only" hint.
    const hint = (r1.json?.error?.message || r1.text || "").toLowerCase();
    if (hint.includes("official codex cli") || hint.includes("only accessible via the official codex cli")) {
      const e: any = new Error("codex_cli_only");
      e.code = "CODEX_CLI_ONLY";
      throw e;
    }

    throw new Error(r1.json?.error?.message || r1.text || `HTTP ${r1.res.status}`);
  };

  const runCodex = async () => {
    const prompt = messagesToPrompt(messages);

    const tmpWork = fs.mkdtempSync(path.join(os.tmpdir(), "yablog_codex_work_"));
    const tmpOut = path.join(tmpWork, "last_message.txt");

    // Codex loads config/auth from CODEX_HOME/config.toml and CODEX_HOME/auth.json.
    const cfgPath = path.join(codexHomeDir, "config.toml");
    const authPath = path.join(codexHomeDir, "auth.json");
    const cfgText =
      cfgToml ||
      [
        "[providers.openai]",
        'name="openai"',
        `base_url="${apiBase.replaceAll('"', '\\"')}"`,
        `env_key="${envKey.replaceAll('"', '\\"')}"`,
        `wire_api="${wireApi}"`,
        "",
      ].join("\n");
    fs.writeFileSync(cfgPath, cfgText, "utf8");
    if ((settings.codex?.authJson ?? "").trim()) fs.writeFileSync(authPath, settings.codex!.authJson, "utf8");

    const baseEnv = { ...process.env, CODEX_HOME: codexHomeDir } as Record<string, string>;
    if (settings.apiKey) {
      baseEnv.OPENAI_API_KEY = settings.apiKey;
      if (apiBase) {
        baseEnv.OPENAI_BASE_URL = apiBase;
        baseEnv.OPENAI_API_BASE = apiBase;
      }
      baseEnv.GPT_API_KEY = settings.apiKey;
      baseEnv[envKey] = settings.apiKey;
    } else if (apiBase) {
      // Keep base_url hints (some setups still use auth.json).
      baseEnv.OPENAI_BASE_URL = apiBase;
      baseEnv.OPENAI_API_BASE = apiBase;
    }

    const runOnce = async (args: string[], useStdin: boolean) => {
      return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
        const child = spawn("codex", args, {
          cwd: tmpWork,
          env: baseEnv,
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += String(d)));
        child.stderr.on("data", (d) => (stderr += String(d)));
        // If codex binary is missing inside the runtime (common in Docker), don't crash the whole server.
        child.on("error", (err) => {
          resolve({
            code: 127,
            stdout,
            stderr: `${stderr}\n${String((err as any)?.message ?? err)}`.trim(),
          });
        });
        if (useStdin) {
          child.stdin.write(prompt);
          child.stdin.end();
        } else {
          child.stdin.end();
        }
        const kill = () => child.kill("SIGKILL");
        withTimeout(
          new Promise<void>((r) => child.on("close", () => r())),
          timeoutMs,
          kill,
        )
          .then(() => resolve({ code: child.exitCode, stdout, stderr }))
          .catch(() => resolve({ code: child.exitCode, stdout, stderr: stderr + "\n(timeout)" }));
      });
    };

    try {
      // Global flags must go before `exec` (exec doesn't accept --ask-for-approval).
      // Prefer file output, with stdin prompt via "-" placeholder.
      let r = await runOnce(
        [
          "--ask-for-approval",
          "never",
          "--sandbox",
          "read-only",
          "exec",
          "-C",
          tmpWork,
          "--skip-git-repo-check",
          "--output-last-message",
          tmpOut,
          "-",
        ],
        true,
      );

      // Compatibility: older builds might not support --output-last-message.
      if (r.code !== 0 && /unknown option|unrecognized option/i.test(r.stderr)) {
        r = await runOnce(
          [
            "--ask-for-approval",
            "never",
            "--sandbox",
            "read-only",
            "exec",
            "-C",
            tmpWork,
            "--skip-git-repo-check",
            "-",
          ],
          true,
        );
      }

      if (fs.existsSync(tmpOut)) {
        const last = fs.readFileSync(tmpOut, "utf8").trim();
        if (last) return last;
      }

      if (/ENOENT|not found/i.test(r.stderr) || r.code === 127) {
        throw new Error("codex_not_found: codex CLI is not available in this server/runtime");
      }
      if ((r.code ?? 0) !== 0) {
        const detail = (r.stderr || r.stdout || "").trim().slice(0, 2000);
        throw new Error(`codex_failed: ${detail || "non_zero_exit"}`);
      }
      const out = (r.stdout || r.stderr || "").trim();
      if (!out) throw new Error("codex_no_output");
      return out;
    } finally {
      fs.rmSync(tmpWork, { recursive: true, force: true });
    }
  };

  try {
    let assistant = "";
    if (shouldCodex) {
      assistant = await runCodex();
    } else {
      try {
        assistant = await tryHttp();
      } catch (e: any) {
        if (mode === "auto" && (e?.code === "CODEX_CLI_ONLY" || String(e?.message ?? "").includes("codex_cli_only"))) {
          assistant = await runCodex();
        } else {
          throw e;
        }
      }
    }
    res.json({ assistant });
  } catch (e: any) {
    const raw = e?.message ?? String(e);
    // Avoid leaking upstream details in JSON; keep a short error.
    res.status(500).json({ error: "chat_failed", message: raw.slice(0, 300) });
  }
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
mountPublicRoutes(publicRouter, db, cache);
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

adminRouter.get("/security/suspicious", async (req, res) => {
  const q = z.object({ limit: z.string().optional() }).parse(req.query);
  const limit = Math.min(1000, Math.max(1, Number.parseInt(q.limit ?? "200", 10) || 200));
  const items = cache.enabled ? await cache.listSuspiciousIps({ limit }) : [];
  res.json({ redisEnabled: cache.enabled, items });
});

adminRouter.get("/security/suspicious.csv", async (req, res) => {
  const q = z.object({ limit: z.string().optional() }).parse(req.query);
  const limit = Math.min(5000, Math.max(1, Number.parseInt(q.limit ?? "2000", 10) || 2000));
  const items = cache.enabled ? await cache.listSuspiciousIps({ limit }) : [];

  const esc = (v: string) => `"${String(v).replaceAll('"', '""')}"`;
  const lines = ["ip,score,lastSeen,counts_json"];
  for (const it of items) {
    lines.push([esc(it.ip), String(it.score), esc(it.lastSeen || ""), esc(JSON.stringify(it.counts ?? {}))].join(","));
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `yablog-suspicious-ips-${ts}.csv`;
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="${filename}"`);
  res.setHeader("cache-control", "no-store");
  // UTF-8 BOM for Excel compatibility
  res.send(`\uFEFF${lines.join("\n")}\n`);
});

adminRouter.get("/security/bans", (_req, res) => {
  res.json({ items: listIpBans(db) });
});

adminRouter.post("/security/bans", (req, res) => {
  const body = z
    .object({
      ips: z.array(z.string().min(1)).min(1).max(500),
      reason: z.string().max(200).optional().default(""),
    })
    .parse(req.body);

  const normalized: string[] = [];
  const invalid: string[] = [];
  for (const raw of body.ips) {
    const ip = ipKey(raw);
    if (!net.isIP(ip)) {
      invalid.push(raw);
      continue;
    }
    normalized.push(ip);
  }

  for (const ip of normalized) {
    upsertIpBan(db, { ip, reason: body.reason ?? "" });
    bannedIpSet.add(ip);
  }

  res.json({ ok: true, added: normalized.length, invalid });
});

adminRouter.post("/security/bans/unban", (req, res) => {
  const body = z.object({ ips: z.array(z.string().min(1)).min(1).max(500) }).parse(req.body);
  const normalized: string[] = [];
  const invalid: string[] = [];
  for (const raw of body.ips) {
    const ip = ipKey(raw);
    if (!net.isIP(ip)) {
      invalid.push(raw);
      continue;
    }
    normalized.push(ip);
  }
  for (const ip of normalized) {
    deleteIpBan(db, ip);
    bannedIpSet.delete(ip);
  }
  res.json({ ok: true, removed: normalized.length, invalid });
});

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
    tab: z.object({
      title: z.string().min(1).max(60),
      awayTitle: z.string().min(1).max(80),
      faviconUrl: z.string().max(2000).default(""),
    }),
    footer: z.object({
      text: z.string().min(1).max(300),
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
    cdn: z.object({
      cloudflare: z.object({
        cacheEnabled: z.boolean().default(false),
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

adminRouter.get("/ai", (_req, res) => {
  res.json({ ai: aiCache });
});

adminRouter.put("/ai", (req: AuthedRequest, res) => {
  const aiSchema = z.object({
    enabled: z.boolean().default(false),
    mode: z.enum(["auto", "http", "codex"]).default("auto"),
    // Allow blanks; server will fall back to defaults at runtime (esp. for codex-only setups).
    model: z.string().max(80).default(""),
    apiBase: z.string().max(2000).default(""),
    apiKey: z.string().max(8000).default(""),
    timeoutMs: z.number().int().min(5000).max(300000).default(60000),
    codex: z
      .object({
        configToml: z.string().max(200000).default(""),
        authJson: z.string().max(200000).default(""),
        envKey: z.string().max(60).default(""),
        wireApi: z.enum(["responses", "chat"]).default("responses"),
      })
      .default({}),
  });

  const body = z.object({ ai: aiSchema }).parse(req.body);
  setAiSettings(db, body.ai);
  aiCache = body.ai;
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

mountAdminRoutes(adminRouter, db, cache);
app.use("/api/admin", adminRouter);

if (config.webDistPath && fs.existsSync(config.webDistPath)) {
  const indexHtml = path.join(config.webDistPath, "index.html");
  app.use(express.static(config.webDistPath));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).json({ error: "not_found" });
    return res.sendFile(indexHtml);
  });
}

// Zod validation errors should be 400 JSON (avoid Express default HTML 500).
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.name === "ZodError" && Array.isArray(err?.issues)) {
    return res.status(400).json({ error: "invalid_request", issues: err.issues });
  }
  return next(err);
});

server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[yablog-api] listening on :${config.port}`);
  if (config.jwtSecret === "dev-only-change-me") {
    console.warn("[yablog-api] WARNING: JWT_SECRET is using the default dev value.");
  }
});
