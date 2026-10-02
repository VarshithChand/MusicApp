import assert from "node:assert/strict";
import { test } from "node:test";
import { suggest, suggestDescription, suggestMoods } from "../src/moodRules";

test("suggests moods from words in the title and movie", () => {
  const moods = suggestMoods({ title: "Prema Geetham", movie: "Love Story" });
  assert.equal(moods[0].slug, "romantic");
  assert.equal(moods[0].primary, true);
  assert.ok(moods.length <= 3);
});

test("falls back to the genre, and to nothing when there is no hint", () => {
  assert.deepEqual(suggestMoods({ title: "Untitled 4", genre: "Ambient" }), [{ slug: "relaxing", primary: true }]);
  assert.deepEqual(suggestMoods({ title: "Xq Zv" }), []);
});

test("only one mood is primary", () => {
  const moods = suggestMoods({ title: "Mass Dance Party Night" });
  assert.equal(moods.filter((m) => m.primary).length, 1);
});

test("the description uses only the facts provided", () => {
  const text = suggestDescription({ title: "Song A", movie: "Film B", language: "Telugu", releaseYear: 2024, singers: "Singer C", musicDirector: "Director D" });
  assert.equal(text, '"Song A" is a Telugu song from the film Film B (2024), sung by Singer C, with music by Director D.');
  assert.equal(suggestDescription({ title: "Solo" }), '"Solo" is a song.');
});

test("suggestions contain no invented singers or lyrics when none were given", () => {
  const s = suggest({ title: "Plain" });
  assert.ok(!/sung by|lyrics/i.test(s.description));
});
