import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { test } from "node:test";
import { classifySong } from "../src/classifier/classify";
import { decodeToMono } from "../src/classifier/decode";
import { extractFeatures } from "../src/classifier/features";
import { afterReclassify, applyAdminEdit, selectLabelsToApprove } from "../src/classifier/review";
import { classifyFeatures, energyScore, LabelScore } from "../src/classifier/rules";

const SR = 11025;

/** A click/drum-like track: a short decaying noise burst on every beat (and optionally on off-beats). */
function drumTrack(bpm: number, seconds: number, level: number, offBeats = false): Float32Array {
  const out = new Float32Array(Math.floor(seconds * SR));
  const beat = (60 / bpm) * SR;
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const hit = (at: number, amp: number) => {
    for (let i = 0; i < 700 && at + i < out.length; i++) out[at + i] += amp * level * rand() * Math.exp(-i / 160);
  };
  for (let b = 0; b * beat < out.length; b++) {
    hit(Math.floor(b * beat), 1);
    if (offBeats) hit(Math.floor(b * beat + beat / 2), 0.6);
  }
  return out;
}

/** A soft, sustained chord: low energy, no drums. */
function softPad(seconds: number, level: number): Float32Array {
  const out = new Float32Array(Math.floor(seconds * SR));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = level * (Math.sin(2 * Math.PI * 220 * t) + 0.6 * Math.sin(2 * Math.PI * 277 * t) + 0.5 * Math.sin(2 * Math.PI * 330 * t)) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.2 * t));
  }
  return out;
}

test("tempo is estimated from the pulse of a drum track", () => {
  for (const bpm of [90, 120, 140]) {
    const f = extractFeatures(drumTrack(bpm, 30, 0.8), SR);
    assert.ok(Math.abs(f.tempoBpm - bpm) <= 4, `expected about ${bpm} BPM, got ${f.tempoBpm}`);
    assert.ok(f.beatStrength > 0.3, `beat strength ${f.beatStrength}`);
  }
});

test("silence has no energy and no tempo", () => {
  const f = extractFeatures(new Float32Array(SR * 20), SR);
  assert.equal(f.tempoBpm, 0);
  assert.ok(f.rmsDb <= -60);
  assert.ok(energyScore(f) < 0.1);
});

test("a loud, busy, fast track scores high energy and is suggested as Mass / High Energy", () => {
  const f = extractFeatures(drumTrack(140, 40, 0.9, true), SR);
  assert.ok(energyScore(f) > 0.5, `energy ${energyScore(f)}`);
  const out = classifyFeatures(f, { title: "Untitled" });
  const slugs = out.labels.map((l) => l.slug);
  assert.ok(slugs.includes("energetic") || slugs.includes("mass"), `labels: ${slugs.join(",")}`);
  assert.ok(!slugs.includes("melody"), "a loud drum track is not a melody");
});

test("a soft, sustained, drum-less track is suggested as Melody, never as Mass or DJ", () => {
  const f = extractFeatures(softPad(40, 0.03), SR);
  assert.ok(energyScore(f) < 0.5, `energy ${energyScore(f)}`);
  const slugs = classifyFeatures(f, { title: "Untitled" }).labels.map((l) => l.slug);
  assert.ok(slugs.includes("melody"), `labels: ${slugs.join(",")}`);
  assert.ok(!slugs.includes("mass") && !slugs.includes("dj-remix"));
});

test("the title does not decide a category when the audio says otherwise", () => {
  // A loud drum track titled "Melody": the audio evidence for Melody is absent, so it must not be suggested on the name alone
  // with high confidence, and it must still be flagged for review because the evidence conflicts with the strongest label.
  const f = extractFeatures(drumTrack(140, 40, 0.9, true), SR);
  const out = classifyFeatures(f, { title: "Melody" });
  const melody = out.labels.find((l) => l.slug === "melody");
  assert.ok(!melody || melody.confidence <= 0.55, "name-only evidence stays at or below 0.55");
  assert.notEqual(out.labels[0].slug, "melody");
});

test("without audio, only keyword hints are available and the song needs review", () => {
  const out = classifyFeatures(null, { title: "Prema Geetham", movie: "Love Story" });
  assert.equal(out.needsReview, true);
  assert.ok(out.labels.length > 0 && out.labels.every((l) => l.confidence <= 0.6));
});

test("low confidence is flagged instead of trusted", () => {
  const out = classifyFeatures(extractFeatures(softPad(10, 0.001), SR), { title: "Xq" });
  assert.equal(out.needsReview, true);
});

test("every suggested label carries evidence and a confidence between 0 and 1", () => {
  const out = classifyFeatures(extractFeatures(drumTrack(128, 30, 0.8, true), SR), { title: "Dj Night" });
  for (const l of out.labels) {
    assert.ok(l.confidence >= 0 && l.confidence <= 0.95);
    assert.ok(l.evidence.length > 0);
  }
  assert.ok(out.labels.some((l) => l.slug === "dj-remix"), "a 'DJ' title adds evidence for DJ / Remix");
});

test("approving suggestions only takes the confident ones", () => {
  const predicted: LabelScore[] = [
    { slug: "melody", confidence: 0.7, evidence: [] },
    { slug: "sad", confidence: 0.4, evidence: [] },
  ];
  assert.deepEqual(selectLabelsToApprove(predicted, 0.5).map((l) => l.slug), ["melody"]);
  assert.deepEqual(selectLabelsToApprove(predicted, 0.3).map((l) => l.slug), ["melody", "sad"]);
});

test("re-running classification never changes approved labels", () => {
  const result = afterReclassify(["melody", "romantic"], [{ slug: "mass", confidence: 0.8, evidence: [] }, { slug: "melody", confidence: 0.6, evidence: [] }]);
  assert.deepEqual(result.approved, ["melody", "romantic"]);
  assert.deepEqual(result.newSuggestions, ["mass"]);
});

test("an admin's edit overrides the model's predictions completely", () => {
  assert.deepEqual(applyAdminEdit([{ slug: "mass", confidence: 0.9, evidence: [] }], ["sad", "melody", "sad"]), ["sad", "melody"]);
});

test("if the classifier service and ffmpeg both fail, the metadata fallback still answers", async () => {
  const saved = { url: process.env.CLASSIFIER_URL, ffmpeg: process.env.FFMPEG_PATH };
  process.env.CLASSIFIER_URL = "http://127.0.0.1:9"; // nothing listens here
  try {
    const result = await classifySong(path.join(os.tmpdir(), "does-not-exist.mp3"), { title: "Sad Song", movie: "Test" }, "http://example.invalid/a.mp3");
    assert.equal(result.method, "metadata");
    assert.equal(result.needsReview, true);
    assert.ok(result.error && /External classifier unavailable/.test(result.error));
    assert.ok(result.labels.some((l) => l.slug === "sad"));
  } finally {
    if (saved.url === undefined) delete process.env.CLASSIFIER_URL;
    else process.env.CLASSIFIER_URL = saved.url;
  }
});

test("a real audio file goes through ffmpeg and gives the right tempo", async (t) => {
  // Build a 16-bit mono WAV of a 120 BPM drum track and decode it exactly like an uploaded song.
  const pcm = drumTrack(120, 30, 0.8);
  const data = Buffer.alloc(pcm.length * 2);
  pcm.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  const file = path.join(os.tmpdir(), `clicks-${Date.now()}.wav`);
  fs.writeFileSync(file, Buffer.concat([header, data]));
  try {
    let samples: Float32Array;
    try {
      samples = await decodeToMono(file, 30);
    } catch (err) {
      if (/not available/.test((err as Error).message)) return t.skip("ffmpeg is not available here");
      throw err;
    }
    const f = extractFeatures(samples, SR);
    assert.ok(Math.abs(f.tempoBpm - 120) <= 4, `expected about 120 BPM, got ${f.tempoBpm}`);
    const result = await classifySong(file, { title: "Untitled" });
    assert.equal(result.method, "audio-features");
    assert.ok(result.features && result.features.tempoBpm > 0);
  } finally {
    fs.rmSync(file, { force: true });
  }
});
