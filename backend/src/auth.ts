import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthedRequest extends Request {
  userId?: number;
  isAdmin?: boolean;
}

function secret(name: "JWT_SECRET" | "JWT_REFRESH_SECRET"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function signTokens(userId: number, isAdmin: boolean) {
  const payload = { sub: userId, admin: isAdmin };
  return {
    accessToken: jwt.sign(payload, secret("JWT_SECRET"), { expiresIn: "15m" }),
    refreshToken: jwt.sign(payload, secret("JWT_REFRESH_SECRET"), { expiresIn: "30d" }),
  };
}

export function verifyRefresh(token: string): { sub: number; admin: boolean } {
  return jwt.verify(token, secret("JWT_REFRESH_SECRET")) as any;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
  try {
    const decoded = jwt.verify(header.slice(7), secret("JWT_SECRET")) as any;
    req.userId = decoded.sub;
    req.isAdmin = !!decoded.admin;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
  next();
}
