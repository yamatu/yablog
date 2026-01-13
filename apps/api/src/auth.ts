import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { config } from "./config.js";
import type { Db, User } from "./db.js";
import { getUserByUsername } from "./db.js";

export type JwtUser = { userId: number; username: string };

export const signToken = (user: JwtUser) => {
  return jwt.sign(user, config.jwtSecret, { expiresIn: "7d" });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, config.jwtSecret) as JwtUser;
};

export const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

export const verifyPassword = async (password: string, passwordHash: string) => {
  return bcrypt.compare(password, passwordHash);
};

export const hashPassword = async (password: string) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const authenticateUser = async (
  db: Db,
  creds: z.infer<typeof loginSchema>,
): Promise<User | null> => {
  const row = getUserByUsername(db, creds.username);
  if (!row) return null;
  const ok = await verifyPassword(creds.password, row.passwordHash);
  if (!ok) return null;
  return { id: row.id, username: row.username, createdAt: row.createdAt };
};

