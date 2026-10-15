import bcrypt from "bcryptjs";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth, signTokens, verifyRefresh } from "../auth";
import { query } from "../db";

export const authRouter = Router();

const TASTES = ["mass", "class", "riding", "traveling", "alone", "sad", "romantic", "party"] as const;
const GENRES = ["pop", "rock", "classical", "hip-hop", "folk", "jazz", "devotional", "film", "melody", "dj"] as const;
// Keys match the YouTube language codes the discover routes already understand.
const LANGUAGES = ["te", "hi", "ta", "kn", "ml", "en"] as const;
const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  gender: z.enum(["male", "female"]),
  songTastes: z.array(z.enum(TASTES)).max(TASTES.length).optional(),
  genres: z.array(z.enum(GENRES)).max(GENRES.length).optional(),
  languages: z.array(z.enum(LANGUAGES)).max(LANGUAGES.length).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// A real calendar date, and an age between 5 and 120.
const validBirthDate = (value: string): boolean => {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  if (now < new Date(Date.UTC(now.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))) age -= 1;
  return age >= 5 && age <= 120;
};

// After two changes the saved song types stop applying, and the search uses the normal default.
const MAX_TASTE_CHANGES = 2;
const effectiveTastes = (row: any): string[] => (row.taste_changes >= MAX_TASTE_CHANGES ? [] : row.song_tastes ?? []);
// node-postgres returns DATE columns as local-midnight Date objects; read the calendar day back out of them.
const birthDateString = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  return String(v).slice(0, 10);
};
const publicUser = (row: any) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  is_admin: row.is_admin,
  gender: row.gender ?? null,
  song_tastes: effectiveTastes(row),
  taste_changes: row.taste_changes ?? 0,
  date_of_birth: birthDateString(row.date_of_birth),
  genres: row.genres ?? [],
  languages: row.languages ?? [],
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, password, gender, songTastes, dateOfBirth, genres, languages } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  if (!validBirthDate(dateOfBirth)) return res.status(400).json({ error: "Enter a valid date of birth (YYYY-MM-DD)." });

  const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.length) return res.status(409).json({ error: "Email already registered" });

  const hash = await bcrypt.hash(password, 10);
  // The check above answers the usual case early, but two sign-ups a moment apart can both pass it. Letting
  // the insert itself decide makes the second one a plain "already registered" instead of a server error.
  const [row] = await query(
    "INSERT INTO users (name, email, password_hash, gender, song_tastes, date_of_birth, genres, languages) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (email) DO NOTHING RETURNING *",
    [name, email, hash, gender, songTastes ?? [], dateOfBirth, genres ?? [], languages ?? []],
  );
  if (!row) return res.status(409).json({ error: "Email already registered" });
  res.status(201).json({ user: publicUser(row), ...signTokens(row.id, row.is_admin) });
});

authRouter.post("/login", async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const [row] = await query("SELECT * FROM users WHERE email = $1", [parsed.data.email.toLowerCase()]);
  const ok = row && (await bcrypt.compare(parsed.data.password, row.password_hash));
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const user = publicUser(row);
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
    "SELECT id, name, email, profile_image, is_admin, gender, song_tastes, taste_changes, date_of_birth, genres, languages, created_at FROM users WHERE id = $1",
    [req.userId],
  );
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ ...user, ...publicUser(user) });
});

// Gender can change freely. Song types count as a change only when the set actually differs.
authRouter.put("/me/preferences", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      gender: z.enum(["male", "female"]).optional(),
      songTastes: z.array(z.enum(TASTES)).max(TASTES.length).optional(),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      genres: z.array(z.enum(GENRES)).max(GENRES.length).optional(),
  languages: z.array(z.enum(LANGUAGES)).max(LANGUAGES.length).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid preferences." });
  if (parsed.data.dateOfBirth && !validBirthDate(parsed.data.dateOfBirth)) {
    return res.status(400).json({ error: "Enter a valid date of birth." });
  }
  const [row] = await query("SELECT * FROM users WHERE id = $1", [req.userId]);
  if (!row) return res.status(404).json({ error: "User not found" });

  const { gender, songTastes, dateOfBirth, genres, languages } = parsed.data;
  let tastes: string[] = row.song_tastes ?? [];
  let changes: number = row.taste_changes ?? 0;
  if (songTastes !== undefined) {
    if (changes >= MAX_TASTE_CHANGES) return res.status(409).json({ error: "Your song preferences are now the default." });
    const same = songTastes.length === tastes.length && songTastes.every((t) => tastes.includes(t));
    if (!same) {
      tastes = songTastes;
      changes += 1;
    }
  }
  const [updated] = await query(
    "UPDATE users SET gender = $1, song_tastes = $2, taste_changes = $3, date_of_birth = COALESCE($4::date, date_of_birth), genres = COALESCE($5::text[], genres), languages = COALESCE($6::text[], languages) WHERE id = $7 RETURNING *",
    [gender ?? row.gender, tastes, changes, dateOfBirth ?? null, genres ?? null, languages ?? null, req.userId],
  );
  res.json(publicUser(updated));
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

  const user = publicUser(row);
  res.json({ user, ...signTokens(row.id, row.is_admin) });
});
