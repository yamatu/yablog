import path from "node:path";

import dotenv from "dotenv";
dotenv.config();

const toInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: toInt(process.env.PORT, 8787),
  databasePath:
    process.env.DATABASE_PATH ?? path.resolve(process.cwd(), "data", "yablog.db"),
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin",
  cookieName: process.env.COOKIE_NAME ?? "yablog_token",
  cookieSecure: (process.env.COOKIE_SECURE ?? "0") === "1",
  webDistPath: process.env.WEB_DIST_PATH,
};
