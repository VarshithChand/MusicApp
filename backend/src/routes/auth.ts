import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth, signTokens, verifyRefresh } from "../auth";
import { query } from "../db";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.length) return res.status(409).json({ error: "Email already registered" });

  const hash = await bcrypt.hash(password, 10);
  const [user] = await query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, is_admin",
    [name, email, hash],
  );
  res.status(201).json({ user, ...signTokens(user.id, user.is_admin) });
});

authRouter.post("/login", async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const [row] = await query("SELECT * FROM users WHERE email = $1", [parsed.data.email.toLowerCase()]);
  const ok = row && (await bcrypt.compare(parsed.data.password, row.password_hash));
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const user = { id: row.id, name: row.name, email: row.email, is_admin: row.is_admin };
  res.json({ user, ...signTokens(row.id, row.is_admin) });
});

authRouter.post("/refresh", async (req, res) => {
  const token = req.body?.refreshToken;
  if (typeof token !== "string") return res.status(400).json({ error: "refreshToken required" });
  try {
    const decoded = verifyRefresh(token);
    const [user] = await query("SELECT id, is_admin FROM users WHERE id = $1", [decoded.sub]);
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json(signTokens(user.id, user.is_admin));
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const [user] = await query(
    "SELECT id, name, email, profile_image, is_admin, created_at FROM users WHERE id = $1",
    [req.userId],
  );
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});
