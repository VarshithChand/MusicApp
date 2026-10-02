import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseMovieName, findMovieMatches, movieKey, suggestMovieName } from "../src/movieName";

test("suggests names from typical ZIP file names", () => {
  assert.deepEqual(suggestMovieName("Pushpa_2_Songs.zip"), { name: "Pushpa 2", ambiguous: false, releaseYear: null, reason: null });
  assert.equal(suggestMovieName("RRR.zip").name, "RRR");
  assert.equal(suggestMovieName("RRR.zip").ambiguous, false);
  assert.equal(suggestMovieName("Arjun_Reddy_OST.zip").name, "Arjun Reddy");
  assert.equal(suggestMovieName("Arjun-Reddy--Songs.ZIP").name, "Arjun Reddy");
});

test("pulls a year and a bitrate tag out of the name without touching the title", () => {
  const s = suggestMovieName("The Paradise (2026) - 320 Kbps.zip");
  assert.equal(s.name, "The Paradise");
  assert.equal(s.releaseYear, 2026);
  assert.equal(suggestMovieName("Some Film 128kbps.zip").name, "Some Film");
});

test("keeps numbers and meaningful words that belong to the title", () => {
  assert.equal(suggestMovieName("Pushpa_2.zip").name, "Pushpa 2");
  assert.equal(suggestMovieName("Songs_of_Paradise.zip").name, "Songs of Paradise"); // "Songs" is only removed at the END
  assert.equal(suggestMovieName("Original_Sin.zip").name, "Original Sin");
  assert.equal(suggestMovieName("2012.zip").name, "2012");
  assert.equal(suggestMovieName("Spider-Man_Songs.zip").name, "Spider Man");
});

test("vague file names must be confirmed by the admin", () => {
  for (const file of ["Movie_Songs_2025.zip", "songs.zip", "New Folder.zip", "Telugu Songs.zip", "Latest_Hits.zip", "2025.zip", ".zip"]) {
    assert.equal(suggestMovieName(file).ambiguous, true, file);
  }
  assert.equal(suggestMovieName("Movie_Songs_2025.zip").releaseYear, 2025);
});

test("lower-case names are tidied, other casing is left alone", () => {
  assert.equal(suggestMovieName("jersey_songs.zip").name, "Jersey");
  assert.equal(suggestMovieName("iPhone_Story.zip").name, "iPhone Story");
});

test("a typed movie name always beats the file name", () => {
  const r = chooseMovieName("  Real   Name ", "Other_Songs.zip", false);
  assert.deepEqual(r, { ok: true, name: "Real Name", source: "manual", releaseYear: null });
});

test("the file name is used when no name is typed", () => {
  assert.deepEqual(chooseMovieName("", "Pushpa_2_Songs.zip", false), { ok: true, name: "Pushpa 2", source: "filename", releaseYear: null });
  assert.deepEqual(chooseMovieName(undefined, "RRR.zip", false), { ok: true, name: "RRR", source: "filename", releaseYear: null });
});

test("an ambiguous file name is refused until the admin confirms or types a name", () => {
  const refused = chooseMovieName("", "Movie_Songs_2025.zip", false);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.suggestion.ambiguous, true);
  assert.equal(chooseMovieName("", "Movie_Songs_2025.zip", true).ok, true);
  assert.equal(chooseMovieName("My Real Movie", "Movie_Songs_2025.zip", false).ok, true);
  assert.equal(chooseMovieName("", ".zip", true).ok, false); // nothing usable even when confirmed
});

test("finds existing movies the new one could duplicate", () => {
  const existing = [
    { id: 1, title: "The Paradise" },
    { id: 2, title: "Pushpa" },
    { id: 3, title: "Pushpa 2" },
    { id: 4, title: "Arjun Reddy" },
  ];
  assert.deepEqual(findMovieMatches("paradise", existing).map((m) => [m.id, m.kind]), [[1, "same"]]);
  assert.deepEqual(findMovieMatches("Pushpa 2", existing).map((m) => m.id), [3]); // not "Pushpa"
  assert.deepEqual(findMovieMatches("Pushpa", existing).map((m) => m.id), [2]); // not "Pushpa 2"
  assert.deepEqual(findMovieMatches("Arjun Reddi", existing).map((m) => [m.id, m.kind]), [[4, "similar"]]);
  assert.deepEqual(findMovieMatches("Something Else", existing), []);
});

test("movie keys ignore case, punctuation and a leading The", () => {
  assert.equal(movieKey("The Paradise!"), movieKey("paradise"));
  assert.equal(movieKey("Tom & Jerry"), movieKey("Tom and Jerry"));
});
