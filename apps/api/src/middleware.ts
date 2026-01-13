import type { NextFunction, Request, Response } from "express";

import { config } from "./config.js";
import { verifyToken } from "./auth.js";

export type AuthedRequest = Request & {
  user?: { userId: number; username: string };
};

export const requireAuth = (req: AuthedRequest, res: Response, next: NextFunction) => {
  const tokenFromCookie = req.cookies?.[config.cookieName] as string | undefined;
  const bearer = req.header("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const token = tokenFromCookie ?? bearer;

  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    req.user = verifyToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
};

