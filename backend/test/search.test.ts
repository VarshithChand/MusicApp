import assert from "node:assert/strict";
import { test } from "node:test";
import { groupsFromSlugs, parseSearchQuery } from "../src/labels";
import { buildSongFilter } from "../src/songFilter";

test("a category word is a label search, not a text search", () => {
  assert.deepEqual(parseSearchQuery("Melody"), { groups: [["melody"]], languages: [], text: "" });
  assert.deepEqual(parseSearchQuery("Sad Songs"), { groups: [["sad"]], languages: [], text: "" });
  assert.deepEqual(parseSearchQuery("DJ Songs"), { groups: [["dj-remix"]], languages: [], text: "" });
  assert.deepEqual(parseSearchQuery("remix"), { groups: [["dj-remix"]], languages: [], text: "" });
});

test("Mass Songs and High Energy mean the same thing", () => {
  assert.deepEqual(parseSearchQuery("Mass Songs").groups, [["mass", "energetic"]]);
  assert.deepEqual(parseSearchQuery("high energy").groups, [["mass", "energetic"]]);
});

test("combined searches keep every part", () => {
  assert.deepEqual(parseSearchQuery("Melody + Romantic"), { groups: [["melody"], ["romantic"]], languages: [], text: "" });
  assert.deepEqual(parseSearchQuery("DJ Telugu"), { groups: [["dj-remix"]], languages: ["telugu"], text: "" });
  assert.deepEqual(parseSearchQuery("mass telugu songs"), { groups: [["mass", "energetic"]], languages: ["telugu"], text: "" });
  assert.deepEqual(parseSearchQuery("Happy Dance").groups, [["happy"], ["dance"]]);
  assert.equal(parseSearchQuery("sad sad songs").groups.length, 1); // no duplicate groups
});

test("movie and song names that contain a category word stay text searches", () => {
  for (const q of ["Love Story", "Dance Dance Revolution", "Sad Movie Songs Collection", "Mass Maharaja", "Paradise"]) {
    const p = parseSearchQuery(q);
    assert.deepEqual(p.groups, [], q);
    assert.equal(p.text, q, q);
  }
});

test("a label search has no title condition, so a title containing the word cannot match", () => {
  const f = buildSongFilter(parseSearchQuery("Melody"));
  const sql = f.conditions.join(" AND ");
  assert.ok(sql.includes("sm.source = 'manual'"), "only approved labels count");
  assert.ok(sql.includes("m.slug = ANY($1)"));
  assert.ok(!/title ILIKE/i.test(sql), "no title matching for a category search");
  assert.deepEqual(f.params, [["melody"]]);
  assert.ok(f.orderBy.includes("MAX(COALESCE(sm.confidence, 1))"), "ranked by label confidence");
});

test("multiple filters are combined with AND", () => {
  const f = buildSongFilter(parseSearchQuery("Melody + Romantic Telugu"));
  assert.equal(f.conditions.length, 3);
  assert.deepEqual(f.params, [["melody"], ["romantic"], ["telugu"]]);
  assert.ok(f.conditions[0].includes("ANY($1)") && f.conditions[1].includes("ANY($2)") && f.conditions[2].includes("ANY($3)"));
});

test("parameters can start at any number so they combine with other conditions", () => {
  const f = buildSongFilter(parseSearchQuery("Sad"), 4);
  assert.ok(f.conditions[0].includes("ANY($4)"));
});

test("a text search covers titles, singers, artists, movies and exact approved label names, and ranks label matches first", () => {
  const f = buildSongFilter(parseSearchQuery("Love Story"));
  const sql = f.conditions.join(" ");
  for (const col of ["s.title", "s.singers", "ar.name", "al.title"]) assert.ok(sql.includes(col), col);
  assert.ok(sql.includes("lower(m.name) = $2"));
  assert.ok(f.orderBy.startsWith("(CASE WHEN EXISTS"), "exact label match ranks first");
  assert.deepEqual(f.params, ["%Love Story%", "love story"]);
});

test("search text is escaped so % and _ are not wildcards", () => {
  const f = buildSongFilter(parseSearchQuery("100%_sure"));
  assert.equal(f.params[0], "%100\\%\\_sure%");
});

test("labels chosen in the interface become AND groups; unknown names are ignored", () => {
  assert.deepEqual(groupsFromSlugs(["melody", "romantic", "melody"]), [["melody"], ["romantic"]]);
  assert.deepEqual(groupsFromSlugs(["mass"]), [["mass", "energetic"]]);
  assert.deepEqual(groupsFromSlugs(["nonsense", "SAD"]), [["sad"]]);
});
