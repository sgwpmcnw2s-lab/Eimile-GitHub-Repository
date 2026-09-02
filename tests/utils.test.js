import test from "node:test";
import assert from "node:assert/strict";
import { calculateHeatScore, inferTopics, isQuietHours, isSyncStale, matchesSearchQuery, normalizeUrl, simpleHash, stripHtml } from "../src/utils.js";

test("simpleHash is deterministic", () => {
  assert.equal(simpleHash("AI radar"), simpleHash("AI radar"));
  assert.notEqual(simpleHash("AI radar"), simpleHash("AI course"));
});

test("normalizeUrl removes tracking parameters and fragments", () => {
  assert.equal(normalizeUrl("https://example.com/a/?utm_source=x&id=2#top"), "https://example.com/a?id=2");
});

test("stripHtml returns readable text", () => {
  assert.equal(stripHtml("<p>AI &amp; work</p><script>bad()</script>"), "AI & work");
});

test("English search matches complete terms instead of fragments inside other words", () => {
  assert.equal(matchesSearchQuery("dust-tt/dust custom AI agent", "Dust"), true);
  assert.equal(matchesSearchQuery("industry-leading AI inference", "Dust"), false);
  assert.equal(matchesSearchQuery("AI 行业更新", "行业"), true);
});

test("inferTopics identifies common AI themes", () => {
  const topics = inferTopics("An open source agent framework for enterprise workflows");
  assert.ok(topics.includes("Agent"));
  assert.ok(topics.includes("开源"));
});

test("heat score remains within 0 to 100", () => {
  assert.equal(calculateHeatScore({ popularity: 1000, engagement: 1000, rating: 1000, recencyDays: 0, reliability: 5 }), 100);
  assert.equal(calculateHeatScore({ popularity: 0, engagement: 0, rating: 0, recencyDays: 999, reliability: 0 }), 0);
});

test("quiet hours span midnight", () => {
  assert.equal(isQuietHours(new Date(2026, 0, 1, 22), 21, 9), true);
  assert.equal(isQuietHours(new Date(2026, 0, 1, 8), 21, 9), true);
  assert.equal(isQuietHours(new Date(2026, 0, 1, 12), 21, 9), false);
});

test("interrupted sync locks become stale after two minutes", () => {
  const now = new Date("2026-09-02T10:10:00.000Z").getTime();
  assert.equal(isSyncStale({ running: true, lastStartedAt: "2026-09-02T10:07:59.000Z" }, 120000, now), true);
  assert.equal(isSyncStale({ running: true, lastStartedAt: "2026-09-02T10:09:30.000Z" }, 120000, now), false);
  assert.equal(isSyncStale({ running: false, lastStartedAt: "2026-09-02T10:00:00.000Z" }, 120000, now), false);
});
