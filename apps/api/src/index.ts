import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";

import { authenticateUser, hashPassword, loginSchema, signToken } from "./auth.js";
import { config } from "./config.js";
import { ensureAdminUser, hasAnyUsers, initDb, openDb } from "./db.js";
import { requireAuth, type AuthedRequest } from "./middleware.js";
import { mountAdminRoutes } from "./routes/admin.js";
import { mountPublicRoutes } from "./routes/public.js";

const db = openDb();
initDb(db);

if (!config.adminUsername || !config.adminPassword) {
  // eslint-disable-next-line no-console
  console.error("[yablog-api] ADMIN_USERNAME and ADMIN_PASSWORD must be set.");
  process.exit(1);
}

if (!hasAnyUsers(db)) {
  ensureAdminUser(db, {
    username: config.adminUsername,
    passwordHash: await hashPassword(config.adminPassword),
  });
}

const app = express();
app.set("trust proxy", true);
app.use(helmet());
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

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

const adminRouter = express.Router();
adminRouter.use(requireAuth);
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

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[yablog-api] listening on :${config.port}`);
  if (config.jwtSecret === "dev-only-change-me") {
    console.warn("[yablog-api] WARNING: JWT_SECRET is using the default dev value.");
  }
});
