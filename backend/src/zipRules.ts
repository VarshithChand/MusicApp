import path from "path";

/** Safety rules for ZIP uploads. Pure functions so they can be tested without a real archive. */

export const MAX_ZIP_BYTES = 300 * 1024 * 1024; // the uploaded archive itself
export const MAX_FILE_BYTES = 80 * 1024 * 1024; // any single extracted file
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024; // everything extracted together
export const MAX_ENTRIES = 100;

export type AudioFormat = "mp3" | "m4a" | "aac" | "flac";

const AUDIO_EXTENSIONS: Record<string, AudioFormat> = { ".mp3": "mp3", ".m4a": "m4a", ".aac": "aac", ".flac": "flac" };

export const AUDIO_MIME: Record<AudioFormat, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
};

const EXECUTABLE_EXTENSIONS = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".sh", ".bash", ".ps1", ".vbs", ".js", ".jar", ".apk", ".app", ".scr", ".py", ".php", ".pl",
]);

export type EntryVerdict =
  | { kind: "ignore" } // folders and OS junk: skipped silently
  | { kind: "reject"; reason: string }
  | { kind: "audio"; format: AudioFormat; baseName: string };

/** Decides what to do with one ZIP entry from its name and attributes alone (before reading any data). */
/** True for names that could point outside the extraction folder (second line of defence after the ZIP library). */
export function isUnsafeName(fileName: string): boolean {
  return (
    fileName.includes("\\") ||
    fileName.includes(String.fromCharCode(0)) ||
    fileName.startsWith("/") ||
    /^[a-zA-Z]:/.test(fileName) ||
    fileName.split("/").includes("..")
  );
}

export function classifyEntry(fileName: string, uncompressedSize: number, externalAttributes = 0): EntryVerdict {
  if (isUnsafeName(fileName)) return { kind: "reject", reason: "The file name isn't allowed (unsafe path)" };
  if (fileName.endsWith("/")) return { kind: "ignore" };

  const parts = fileName.split("/");
  const base = parts[parts.length - 1];
  if (parts.includes("__MACOSX") || base.startsWith(".") || base.toLowerCase() === "thumbs.db") return { kind: "ignore" };

  // Unix symlink bit in the high 16 bits of the external attributes.
  const unixMode = (externalAttributes >>> 16) & 0xffff;
  if ((unixMode & 0xf000) === 0xa000) return { kind: "reject", reason: "Symbolic links aren't allowed" };

  const ext = path.posix.extname(base).toLowerCase();
  if (EXECUTABLE_EXTENSIONS.has(ext)) return { kind: "reject", reason: "Executable files aren't allowed" };

  const format = AUDIO_EXTENSIONS[ext];
  if (!format) return { kind: "reject", reason: `Unsupported file type "${ext || "(none)"}" — only MP3, M4A, AAC and FLAC` };
  if (uncompressedSize <= 0) return { kind: "reject", reason: "The file is empty" };
  if (uncompressedSize > MAX_FILE_BYTES) return { kind: "reject", reason: "The file is larger than 80 MB" };

  return { kind: "audio", format, baseName: base };
}

/** Looks at a file's first bytes to confirm it really is the audio format its extension claims. */
export function detectAudioFormat(header: Buffer): AudioFormat | null {
  if (header.length < 4) return null;
  if (header.toString("latin1", 0, 4) === "fLaC") return "flac";
  if (header.length >= 8 && header.toString("latin1", 4, 8) === "ftyp") return "m4a";
  if (header.toString("latin1", 0, 3) === "ID3") return "mp3";
  if (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) {
    // Frame sync. The 2-bit "layer" field is 0 for AAC (ADTS) and non-zero for MPEG audio (MP3).
    return (header[1] & 0x06) === 0 ? "aac" : "mp3";
  }
  return null;
}

/** An .m4a/.aac file may carry either container; MP3 and FLAC must match exactly. */
export function formatMatches(claimed: AudioFormat, detected: AudioFormat | null): boolean {
  if (!detected) return false;
  if (claimed === detected) return true;
  return (claimed === "aac" && detected === "m4a") || (claimed === "m4a" && detected === "aac");
}

/** "01 - Song_Name.mp3" -> { title: "Song Name", track: 1 } */
export function titleFromFileName(baseName: string): { title: string; track: number | null } {
  let name = baseName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  let track: number | null = null;
  const m = name.match(/^(\d{1,3})\s*[-._)]\s*(.+)$/);
  if (m) {
    track = parseInt(m[1], 10);
    name = m[2].trim();
  }
  return { title: name || "Untitled", track };
}
