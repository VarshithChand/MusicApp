import { spawn } from "child_process";

export const ANALYSIS_RATE = 11025;

/** Path of the ffmpeg binary shipped by @ffmpeg-installer (no system install needed), or null if unavailable. */
function ffmpegPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@ffmpeg-installer/ffmpeg").path as string;
  } catch {
    return process.env.FFMPEG_PATH ?? null;
  }
}

/**
 * Decodes up to `seconds` of an audio file (a path or an http(s) URL) to mono 32-bit float samples at 11 kHz.
 * Streams from ffmpeg, so memory stays small (90 s ≈ 4 MB). Rejects if ffmpeg is missing or cannot read the file.
 */
export function decodeToMono(source: string, seconds = 90, startSeconds = 0, timeoutMs = 45_000): Promise<Float32Array> {
  const bin = ffmpegPath();
  if (!bin) return Promise.reject(new Error("ffmpeg is not available"));
  const args = ["-v", "error", ...(startSeconds > 0 ? ["-ss", String(startSeconds)] : []), "-i", source, "-t", String(seconds), "-ac", "1", "-ar", String(ANALYSIS_RATE), "-f", "f32le", "pipe:1"];

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let errorText = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Audio decoding timed out"));
    }, timeoutMs);

    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => (errorText += c.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const data = Buffer.concat(chunks);
      if (code !== 0 || data.length < 4 * ANALYSIS_RATE) {
        return reject(new Error(`Could not decode audio${errorText ? `: ${errorText.trim().slice(0, 160)}` : ""}`));
      }
      // Copy into an aligned buffer so it can be viewed as Float32.
      const copy = new Uint8Array(data.length - (data.length % 4));
      copy.set(data.subarray(0, copy.length));
      resolve(new Float32Array(copy.buffer));
    });
  });
}
