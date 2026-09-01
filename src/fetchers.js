import { SOURCE_GROUPS } from "./constants.js";
import { calculateHeatScore, daysAgo, inferTopics, normalizeUrl, simpleHash, stripHtml, toIsoDate } from "./utils.js";

const FETCH_TIMEOUT = 15000;

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { "Accept": "application/json, application/rss+xml, application/xml, text/xml, text/html", ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractTag(block, tag) {
  const patterns = [
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i"),
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
  ];
  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match) return stripHtml(match[1]);
  }
  return "";
}

function extractLink(block) {
  const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1];
  return href || extractTag(block, "link") || extractTag(block, "guid");
}

export function parseRss(xml, source) {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  return blocks.slice(0, 30).map((block) => {
    const title = extractTag(block, "title");
    const url = normalizeUrl(extractLink(block));
    const summary = extractTag(block, "description") || extractTag(block, "summary") || extractTag(block, "content:encoded");
    const publishedAt = toIsoDate(extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated"));
    const topics = inferTopics(`${title} ${summary}`);
    const recencyDays = daysAgo(publishedAt);
    const importance = Math.max(1, Math.min(5, Math.round((source.reliability + (source.official ? 2 : 0) + (topics.includes("研究") ? 1 : 0)) / 2)));
    return normalizeItem({
      section: source.section,
      titleEn: title,
      summaryEn: summary.slice(0, 900),
      source: source.name,
      sourceId: source.id,
      sourceOfficial: source.official,
      reliability: source.reliability,
      url,
      publishedAt,
      topics,
      importance,
      popularity: Math.max(10, 90 - recencyDays * 7),
      courseFormat: source.section === "courses" ? inferCourseFormat(`${title} ${summary}`) : null,
      audience: source.section === "courses" ? inferAudience(`${title} ${summary}`) : []
    });
  }).filter((item) => item.titleEn && item.url && (source.section !== "courses" || isCourseContent(`${item.titleEn} ${item.summaryEn}`)));
}

function normalizeItem(input) {
  const canonical = normalizeUrl(input.url);
  const recency = daysAgo(input.publishedAt);
  const heatScore = input.heatScore ?? calculateHeatScore({
    popularity: input.popularity || 0,
    engagement: input.engagement || 0,
    rating: input.rating || 0,
    recencyDays: recency,
    reliability: input.reliability || 3
  });
  return {
    id: simpleHash(`${input.section}|${canonical || input.titleEn}`),
    section: input.section,
    titleEn: input.titleEn || "",
    titleZh: input.titleZh || "",
    summaryEn: input.summaryEn || "",
    summaryZh: input.summaryZh || "",
    source: input.source || "Unknown",
    sourceId: input.sourceId || "unknown",
    sourceOfficial: Boolean(input.sourceOfficial),
    reliability: input.reliability || 3,
    url: canonical,
    publishedAt: input.publishedAt || new Date().toISOString(),
    originalTimezone: input.originalTimezone || "来源时区",
    topics: input.topics || inferTopics(`${input.titleEn} ${input.summaryEn}`),
    importance: input.importance || 2,
    heatScore,
    engagement: input.engagement || 0,
    popularity: input.popularity || 0,
    rating: input.rating || 0,
    courseFormat: input.courseFormat || null,
    audience: input.audience || [],
    priceType: input.priceType || null,
    analysisStatus: input.analysisStatus || "pending",
    credibility: input.sourceOfficial ? "confirmed" : "pending",
    createdAt: new Date().toISOString()
  };
}

async function fetchRssSource(source) {
  const xml = await fetchText(source.url);
  return parseRss(xml, source);
}

async function fetchGitHubSource(source) {
  const query = encodeURIComponent(`${source.query} pushed:>${new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)}`);
  const text = await fetchText(`https://api.github.com/search/repositories?q=${query}&sort=updated&order=desc&per_page=20`, {
    headers: { "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
  });
  const payload = JSON.parse(text);
  return (payload.items || []).map((repo) => normalizeItem({
    section: "updates",
    titleEn: `${repo.full_name} · ${repo.name}`,
    summaryEn: repo.description || "Open-source AI repository update.",
    source: "GitHub",
    sourceId: source.id,
    sourceOfficial: true,
    reliability: 4,
    url: repo.html_url,
    publishedAt: repo.pushed_at || repo.updated_at,
    topics: ["开源", ...inferTopics(`${repo.name} ${repo.description || ""}`)].slice(0, 4),
    importance: repo.stargazers_count > 10000 ? 5 : repo.stargazers_count > 2000 ? 4 : 3,
    popularity: Math.min(100, Math.log10(Math.max(10, repo.stargazers_count)) * 22),
    engagement: Math.min(100, Math.log10(Math.max(10, repo.forks_count)) * 25)
  }));
}

async function fetchHackerNewsSource(source) {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(source.query)}&tags=story&hitsPerPage=30`;
  const payload = JSON.parse(await fetchText(url));
  return (payload.hits || []).map((hit) => normalizeItem({
    section: source.section,
    titleEn: hit.title || hit.story_title,
    summaryEn: stripHtml(hit.story_text || `Hacker News discussion with ${hit.num_comments || 0} comments.`),
    source: source.name,
    sourceId: source.id,
    sourceOfficial: false,
    reliability: 3,
    url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
    publishedAt: hit.created_at,
    importance: hit.points > 300 ? 4 : hit.points > 80 ? 3 : 2,
    popularity: Math.min(100, hit.points || 0),
    engagement: Math.min(100, (hit.num_comments || 0) * 2),
    courseFormat: source.section === "courses" ? inferCourseFormat(`${hit.title} ${hit.story_text || ""}`) : null,
    audience: source.section === "courses" ? inferAudience(`${hit.title} ${hit.story_text || ""}`) : []
  })).filter((item) => item.titleEn && item.url && (source.section !== "courses" || isCourseContent(`${item.titleEn} ${item.summaryEn}`)));
}

async function fetchRedditSource(source) {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(source.query)}&sort=new&t=month&limit=30&raw_json=1`;
  const payload = JSON.parse(await fetchText(url, { headers: { "User-Agent": "EimileAIRadar/0.1" } }));
  return (payload.data?.children || []).map(({ data }) => normalizeItem({
    section: "courses",
    titleEn: data.title,
    summaryEn: stripHtml(data.selftext || `Reddit discussion in r/${data.subreddit}.`),
    source: `Reddit · r/${data.subreddit}`,
    sourceId: source.id,
    sourceOfficial: false,
    reliability: 2,
    url: `https://www.reddit.com${data.permalink}`,
    publishedAt: new Date(data.created_utc * 1000).toISOString(),
    importance: data.score > 500 ? 4 : data.score > 100 ? 3 : 2,
    popularity: Math.min(100, data.score || 0),
    engagement: Math.min(100, (data.num_comments || 0) * 2),
    courseFormat: inferCourseFormat(`${data.title} ${data.selftext || ""}`),
    audience: inferAudience(`${data.title} ${data.selftext || ""}`)
  })).filter((item) => isCourseContent(`${item.titleEn} ${item.summaryEn}`));
}

async function fetchArxivSource(source) {
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(source.query)}&start=0&max_results=25&sortBy=submittedDate&sortOrder=descending`;
  const xml = await fetchText(url);
  const blocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((block) => {
    const title = extractTag(block, "title");
    const summary = extractTag(block, "summary");
    const urlMatch = block.match(/<id>([\s\S]*?)<\/id>/i)?.[1]?.trim();
    const publishedAt = toIsoDate(extractTag(block, "published"));
    return normalizeItem({
      section: "news",
      titleEn: title,
      summaryEn: summary,
      source: source.name,
      sourceId: source.id,
      sourceOfficial: true,
      reliability: 5,
      url: urlMatch,
      publishedAt,
      topics: ["研究", ...inferTopics(`${title} ${summary}`)].slice(0, 4),
      importance: 3,
      popularity: Math.max(20, 80 - daysAgo(publishedAt) * 7)
    });
  }).filter((item) => item.titleEn && item.url);
}

export function inferCourseFormat(text = "") {
  const lower = text.toLowerCase();
  const liveSignal = /live class|live course|直播|scheduled class|instructor-led/.test(lower);
  const formalSignal = /schedule|weekly|session|register|enroll|报名|课表|固定/.test(lower);
  if (liveSignal && formalSignal && !isExcludedCourse(lower)) return "直播课";
  return "录播课";
}

export function isExcludedCourse(text = "") {
  return /bootcamp|webinar|workshop|cohort-based|cohort course|训练营|工作坊|同期班/i.test(text);
}

export function isCourseContent(text = "") {
  const lower = text.toLowerCase();
  if (isExcludedCourse(lower)) return false;
  const aiSignal = /\bai\b|artificial intelligence|generative ai|machine learning|\bllm\b|chatgpt|claude|gemini|prompt engineering|智能体|人工智能|大模型/.test(lower);
  const courseSignal = /ai course|online course|self-paced|instructor-led|course (?:for|on|in|about|teaching)|(?:this|the|my) course|learn(?:ing)? (?:ai|artificial intelligence|machine learning|chatgpt|claude)|class(?:es)? (?:for|on|in|about)|training program|tutorial|curriculum|syllabus|lesson|certificate|specialization|\bmooc\b|课程|录播课|直播课/.test(lower);
  return aiSignal && courseSignal;
}

export function inferAudience(text = "") {
  const lower = text.toLowerCase();
  const audiences = [];
  if (/beginner|no code|zero to|入门|零基础/.test(lower)) audiences.push("零基础个人");
  if (/office|productivity|work|excel|ppt|职场|办公/.test(lower)) audiences.push("职场办公人群");
  if (/creator|content|video|design|marketing|创作|内容/.test(lower)) audiences.push("内容创作者");
  if (/manager|leader|executive|strategy|管理|领导/.test(lower)) audiences.push("企业管理者");
  return audiences.length ? audiences : ["零基础个人"];
}

export async function fetchAllSources(settings, onProgress = () => {}) {
  const jobs = [
    ...SOURCE_GROUPS.rss.map((source) => ({ source, run: () => fetchRssSource(source) })),
    ...SOURCE_GROUPS.github.map((source) => ({ source, run: () => fetchGitHubSource(source) })),
    ...SOURCE_GROUPS.hackerNews.map((source) => ({ source, run: () => fetchHackerNewsSource(source) })),
    ...SOURCE_GROUPS.reddit.map((source) => ({ source, run: () => fetchRedditSource(source) })),
    ...SOURCE_GROUPS.arxiv.map((source) => ({ source, run: () => fetchArxivSource(source) }))
  ].filter(({ source }) => settings.sourceEnabled[source.id] !== false);

  const results = [];
  const items = [];
  for (const job of jobs) {
    try {
      const sourceItems = await job.run();
      items.push(...sourceItems);
      results.push({ sourceId: job.source.id, ok: true, count: sourceItems.length });
    } catch (error) {
      results.push({ sourceId: job.source.id, ok: false, count: 0, error: error.message });
    }
    onProgress(results.at(-1));
  }
  return { items, results };
}
