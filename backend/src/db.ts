import "dotenv/config";
import { Pool } from "pg";

// Hosted providers (Aiven, Neon) append ?sslmode=require to the URL. Newer pg versions turn that into a
// strict certificate check that managed-database certificates fail, so drop it and configure SSL here.
function connectionString(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return raw;
  }
}

const sslRequired = process.env.DATABASE_SSL === "true" || /sslmode=require/.test(process.env.DATABASE_URL ?? "");

export const pool = new Pool({
  connectionString: connectionString(),
  ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
});

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
