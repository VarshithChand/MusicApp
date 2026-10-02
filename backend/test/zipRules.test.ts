import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyEntry, detectAudioFormat, formatMatches, isUnsafeName, MAX_FILE_BYTES, titleFromFileName } from "../src/zipRules";

test("accepts supported audio files", () => {
  for (const [name, format] of [["01 - Song.mp3", "mp3"], ["a/b/Song.M4A", "m4a"], ["x.aac", "aac"], ["x.flac", "flac"]] as const) {
    const v = classifyEntry(name, 1000);
    assert.equal(v.kind, "audio", name);
    if (v.kind === "audio") assert.equal(v.format, format);
  }
});

test("rejects executables, unsupported types, empty and oversized files", () => {
  assert.equal(classifyEntry("run.exe", 10).kind, "reject");
  assert.equal(classifyEntry("script.sh", 10).kind, "reject");
  assert.equal(classifyEntry("lyrics.txt", 10).kind, "reject");
  assert.equal(classifyEntry("noextension", 10).kind, "reject");
  assert.equal(classifyEntry("empty.mp3", 0).kind, "reject");
  assert.equal(classifyEntry("huge.mp3", MAX_FILE_BYTES + 1).kind, "reject");
});

test("rejects symbolic links", () => {
  const symlinkAttributes = (0o120777 << 16) >>> 0;
  assert.equal(classifyEntry("link.mp3", 10, symlinkAttributes).kind, "reject");
});

test("silently ignores folders and operating-system junk", () => {
  assert.equal(classifyEntry("album/", 0).kind, "ignore");
  assert.equal(classifyEntry("__MACOSX/._song.mp3", 10).kind, "ignore");
  assert.equal(classifyEntry("album/.DS_Store", 10).kind, "ignore");
  assert.equal(classifyEntry("Thumbs.db", 10).kind, "ignore");
});

test("recognises audio formats by their first bytes", () => {
  assert.equal(detectAudioFormat(Buffer.from("fLaC....", "latin1")), "flac");
  assert.equal(detectAudioFormat(Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4])), "m4a");
  assert.equal(detectAudioFormat(Buffer.from("ID3\x04\x00\x00....", "latin1")), "mp3");
  assert.equal(detectAudioFormat(Buffer.from([0xff, 0xfb, 0x90, 0x00])), "mp3"); // MPEG layer III frame
  assert.equal(detectAudioFormat(Buffer.from([0xff, 0xf1, 0x50, 0x80])), "aac"); // ADTS
  assert.equal(detectAudioFormat(Buffer.from("MZ\x90\x00 an exe", "latin1")), null);
  assert.equal(detectAudioFormat(Buffer.from("hi")), null);
});

test("the extension must match the real content", () => {
  assert.equal(formatMatches("mp3", "mp3"), true);
  assert.equal(formatMatches("mp3", null), false);
  assert.equal(formatMatches("mp3", "flac"), false);
  assert.equal(formatMatches("m4a", "aac"), true);
});

test("derives title and track number from file names", () => {
  assert.deepEqual(titleFromFileName("01 - Song_Name.mp3"), { title: "Song Name", track: 1 });
  assert.deepEqual(titleFromFileName("12. Another One.flac"), { title: "Another One", track: 12 });
  assert.deepEqual(titleFromFileName("Plain title.mp3"), { title: "Plain title", track: null });
  assert.deepEqual(titleFromFileName(".mp3"), { title: "Untitled", track: null });
});

test("unsafe names are rejected by our own check, whatever the ZIP library does", () => {
  const BS = String.fromCharCode(92); // a backslash
  const NUL = String.fromCharCode(0);
  const hostile = ["../evil.mp3", "ok/../../evil.mp3", "/etc/passwd.mp3", `..${BS}evil.mp3`, `C:${BS}evil.mp3`, "C:/evil.mp3", `a${NUL}b.mp3`];
  for (const name of hostile) {
    assert.equal(isUnsafeName(name), true, JSON.stringify(name));
    assert.equal(classifyEntry(name, 100).kind, "reject", JSON.stringify(name));
  }
  for (const name of ["ok/01.mp3", "Movie Name/Song..Title.mp3", "a/b/c.flac"]) assert.equal(isUnsafeName(name), false, name);
});
