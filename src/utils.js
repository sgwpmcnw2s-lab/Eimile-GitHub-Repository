export function simpleHash(input = "") {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function stripHtml(value = "") {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesSearchQuery(text = "", query = "") {
  const normalizedText = String(text).toLowerCase();
  const normalizedQuery = String(query).trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (/[^\x00-\x7F]/.test(normalizedQuery)) return normalizedText.includes(normalizedQuery);
  return normalizedQuery.split(/\s+/).every((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(normalizedText);
  });
}

export function normalizeUrl(value = "") {
  try {
    const url = new URL(value);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref"].forEach((key) => url.searchParams.delete(key));
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
}

export function toIsoDate(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

export function daysAgo(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, diff / 86400000);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function calculateHeatScore({ popularity = 0, engagement = 0, rating = 0, recencyDays = 0, reliability = 3 }) {
  const recency = Math.max(0, 100 - recencyDays * 8);
  const raw = popularity * 0.32 + engagement * 0.24 + rating * 0.18 + recency * 0.16 + reliability * 2;
  return Math.round(clamp(raw, 0, 100));
}

export function inferTopics(text = "") {
  const lower = text.toLowerCase();
  const dictionary = [
    ["Agent", ["agent", "agentic", "智能体"]],
    ["大模型", ["llm", "large language model", "大模型"]],
    ["图像生成", ["image generation", "midjourney", "stable diffusion", "图像生成"]],
    ["视频生成", ["video generation", "sora", "runway", "视频生成"]],
    ["AI办公", ["copilot", "productivity", "office", "办公"]],
    ["AI编程", ["coding", "developer", "github", "代码", "编程"]],
    ["AI课程", ["course", "learn", "training", "课程", "学习"]],
    ["研究", ["research", "paper", "benchmark", "研究", "论文"]],
    ["开源", ["open source", "github", "开源"]],
    ["企业应用", ["enterprise", "business", "workflow", "企业"]]
  ];
  return dictionary.filter(([, terms]) => terms.some((term) => lower.includes(term))).map(([topic]) => topic).slice(0, 4);
}

export function isQuietHours(date = new Date(), start = 21, end = 9) {
  const hour = date.getHours();
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

export function isSyncStale(sync = {}, maxAgeMs = 2 * 60 * 1000, now = Date.now()) {
  if (!sync.running) return false;
  const startedAt = new Date(sync.lastStartedAt || 0).getTime();
  return !Number.isFinite(startedAt) || now - startedAt >= maxAgeMs;
}

export function formatBeijingTime(value, options = {}) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...options
  }).format(new Date(value));
}

export function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadText(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
