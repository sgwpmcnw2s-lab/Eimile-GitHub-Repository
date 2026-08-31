import { analyzeItem } from "./analyzer.js";
import { getState, saveReport } from "./storage.js";
import { simpleHash } from "./utils.js";

function groupByTopic(items) {
  const groups = new Map();
  for (const item of items) {
    for (const topic of item.topics?.length ? item.topics : ["其他AI课程"]) {
      const entries = groups.get(topic) || [];
      entries.push(item);
      groups.set(topic, entries);
    }
  }
  return [...groups.entries()].map(([topic, entries]) => ({
    topic,
    count: entries.length,
    averageHeat: Math.round(entries.reduce((sum, item) => sum + (item.heatScore || 0), 0) / entries.length),
    entries: entries.sort((a, b) => b.heatScore - a.heatScore).slice(0, 5)
  })).sort((a, b) => b.averageHeat - a.averageHeat || b.count - a.count);
}

export async function generateWeeklyReport({ forceAnalyze = true } = {}) {
  let state = await getState();
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 86400000);
  let courses = state.items.filter((item) => item.section === "courses" && new Date(item.publishedAt) >= periodStart);
  if (forceAnalyze && state.settings.apiKey) {
    for (const item of courses.filter((entry) => entry.analysisStatus !== "complete").slice(0, 5)) {
      try { await analyzeItem(item.id); } catch { /* Budget and API failures do not block rule report. */ }
    }
    state = await getState();
    courses = state.items.filter((item) => item.section === "courses" && new Date(item.publishedAt) >= periodStart);
  }
  const topicGroups = groupByTopic(courses);
  const opportunities = topicGroups.slice(0, 5).map((group, index) => ({
    rank: index + 1,
    topic: group.topic,
    heatScore: group.averageHeat,
    evidenceCount: group.count,
    audience: group.entries.flatMap((entry) => entry.audience || [])[0] || "零基础个人",
    format: group.entries.filter((entry) => entry.courseFormat === "直播课").length > group.entries.length / 2 ? "直播课" : "录播课",
    reason: group.entries.find((entry) => entry.opportunity)?.opportunity || `本周期出现${group.count}条相关课程或讨论，平均热度${group.averageHeat}分。建议先以小型内容验证需求。`,
    painPoints: [...new Set(group.entries.flatMap((entry) => entry.painPoints || []))].slice(0, 3),
    sources: group.entries.map((entry) => ({ title: entry.titleZh || entry.titleEn, url: entry.url, source: entry.source })).slice(0, 5)
  }));
  const report = {
    id: simpleHash(`weekly|${periodEnd.toISOString().slice(0, 10)}`),
    type: "weekly-course-opportunity",
    title: `海外AI课程机会周报 · ${periodEnd.toISOString().slice(0, 10)}`,
    generatedAt: periodEnd.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    sampleSize: courses.length,
    summary: courses.length ? `本期分析${courses.length}条海外课程与用户讨论，识别${opportunities.length}个优先机会方向。` : "本期尚未抓取到足够课程数据，请检查数据源后重新生成。",
    opportunities,
    caveats: ["热度分基于公开可获得指标，不等同于真实销量。", "因平台公开字段不同，跨平台结果仅用于方向判断。", "原因判断属于分析推断，课程立项前需要进一步访谈或小规模验证。"]
  };
  return saveReport(report);
}

