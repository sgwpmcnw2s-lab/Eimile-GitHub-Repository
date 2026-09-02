import test from "node:test";
import assert from "node:assert/strict";
import { inferAudience, inferCourseFormat, isCourseContent, isExcludedCourse, parseRss } from "../src/fetchers.js";

test("parseRss normalizes an RSS item", () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[New AI agent course]]></title><link>https://example.com/course?utm_source=test</link><description><![CDATA[Beginner live course for creators with weekly sessions and formal enrollment]]></description><pubDate>Fri, 28 Aug 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
  const items = parseRss(xml, { id: "test", name: "Test", section: "courses", official: false, reliability: 4 });
  assert.equal(items.length, 1);
  assert.equal(items[0].courseFormat, "直播课");
  assert.ok(items[0].audience.includes("零基础个人"));
  assert.ok(items[0].topics.includes("Agent"));
  assert.equal(items[0].url, "https://example.com/course");
});

test("course helpers classify formats and audiences", () => {
  assert.equal(inferCourseFormat("Instructor-led live class with a weekly schedule and enrollment"), "直播课");
  assert.equal(inferCourseFormat("Self-paced recorded lessons"), "录播课");
  assert.equal(inferCourseFormat("Live AI webinar with registration"), "录播课");
  assert.equal(isExcludedCourse("Live AI webinar with registration"), true);
  assert.deepEqual(inferAudience("AI productivity for office work and creators"), ["职场办公人群", "内容创作者"]);
});

test("course validation rejects incidental words and unrelated product discussions", () => {
  assert.equal(isCourseContent("Of course, you are the harness when using AI."), false);
  assert.equal(isCourseContent("I am an ML engineer showing a new customer research tool."), false);
  assert.equal(isCourseContent("A self-paced generative AI course for office workers."), true);
  assert.equal(isCourseContent("Live AI webinar with registration"), false);
  assert.equal(isCourseContent("I built a SaaS for hosting online courses. Later I added unrelated AI features.", true), false);
  assert.equal(isCourseContent("AI engineer course where every lesson is a runnable project", true), true);
  assert.equal(isCourseContent("Show HN: I built a SaaS without knowing how to code", true), false);
  assert.equal(isCourseContent("Show HN: I built an LPU that can run AI inference", true), false);
});
