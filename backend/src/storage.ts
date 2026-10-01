import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL } = process.env;

const r2Configured = !!(R2_ACCOUNT_ID && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL);

const client = r2Configured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
    })
  : null;

const LOCAL_DIR = path.join(__dirname, "..", "uploads");

/**
 * Stores an uploaded file and returns the URL to save in the database.
 * Uses Cloudflare R2 when the R2_* variables are set; otherwise falls back to the local uploads folder
 * (fine for development, but lost on every redeploy on Render's free plan).
 */
export async function saveUpload(file: Express.Multer.File): Promise<string> {
  const name = `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`;

  if (client) {
    await client.send(
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: name, Body: file.buffer, ContentType: file.mimetype }),
    );
    return `${R2_PUBLIC_URL!.replace(/\/+$/, "")}/${name}`;
  }

  await fs.writeFile(path.join(LOCAL_DIR, name), file.buffer);
  return `/media/${name}`;
}
