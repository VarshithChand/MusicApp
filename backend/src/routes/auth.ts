import bcrypt from "bcryptjs";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
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

// --- Continue with Google ------------------------------------------------------

// Client IDs (public values) of the Google OAuth clients allowed to sign people in: the website, and optionally the Android app.
const googleClientIds = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_ANDROID_CLIENT_ID].filter((v): v is string => !!v);
const googleClient = new OAuth2Client();

/** Lets the apps know whether to show the "Continue with Google" button, and with which client. */
authRouter.get("/config", (_req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID ?? null });
});

authRouter.post("/google", async (req, res) => {
  if (!googleClientIds.length) return res.status(503).json({ error: "Google sign-in isn't set up yet." });
  const parsed = z.object({ idToken: z.string().min(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "idToken required" });

  let payload;
  try {
    // Checks Google's signature, that the token is for one of our clients, and that it hasn't expired.
    const ticket = await googleClient.verifyIdToken({ idToken: parsed.data.idToken, audience: googleClientIds });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: "Google sign-in failed. Please try again." });
  }
  if (!payload?.sub || !payload.email || !payload.email_verified) {
    return res.status(401).json({ error: "Your Google account's email isn't verified." });
  }

  const email = payload.email.toLowerCase();
  const [byGoogle] = await query("SELECT * FROM users WHERE google_id = $1", [payload.sub]);
  const [byEmail] = byGoogle ? [] : await query("SELECT * FROM users WHERE email = $1", [email]);
  let row = byGoogle ?? byEmail;

  if (row && !row.google_id) {
    // An existing email/password account: link it to this Google account.
    await query("UPDATE users SET google_id = $1 WHERE id = $2", [payload.sub, row.id]);
  } else if (!row) {
    // New person: Google accounts get a random password nobody knows, so only Google can log them in.
    const unusable = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    [row] = await query(
      "INSERT INTO users (name, email, password_hash, profile_image, google_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [payload.name || email.split("@")[0], email, unusable, payload.picture ?? null, payload.sub],
    );
  }

  const user = { id: row.id, name: row.name, email: row.email, is_admin: row.is_admin };
  res.json({ user, ...signTokens(row.id, row.is_admin) });
});
