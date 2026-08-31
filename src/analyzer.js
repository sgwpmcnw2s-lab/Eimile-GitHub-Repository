import { DEEPSEEK_BASE_URL } from "./constants.js";
import { currentUsageMonth, getState, patchItem, recordUsage } from "./storage.js";

const USD_TO_CNY_ASSUMPTION = 7.2;
const PRICE_PER_MILLION = {
  input: 0.44,
  output: 1.32
};

export function estimateCostUsd(usage = {}) {
  const input = usage.prompt_tokens || usage.input_tokens || 0;
  const output = usage.completion_tokens || usage.output_tokens || 0;
  return input / 1_000_000 * PRICE_PER_MILLION.input + output / 1_000_000 * PRICE_PER_MILLION.output;
}

export async function getBudgetStatus() {
  const state = await getState();
  const usage = state.usage[currentUsageMonth()] || { estimatedUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
  const spentCny = usage.estimatedUsd * USD_TO_CNY_ASSUMPTION;
  const limitCny = Number(state.settings.monthlyBudgetCny) || 10;
  return { ...usage, spentCny, limitCny, percent: limitCny ? spentCny / limitCny * 100 : 0, allowed: spentCny < limitCny };
}

function parseJsonResponse(content) {
  const cleaned = content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

export async function analyzeItem(id) {
  const state = await getState();
  const item = state.items.find((entry) => entry.id === id);
  if (!item) throw new Error("内容不存在");
  if (!state.settings.apiKey) throw new Error("请先在设置中填写 DeepSeek API Key");
  const budget = await getBudgetStatus();
  if (!budget.allowed) throw new Error("本月 AI 预算已用完，请确认是否追加预算");

  const prompt = `你是全球AI情报分析员。请对下列公开信息进行中英文整理，不要虚构数据。\n\n板块：${item.section}\n来源：${item.source}\n英文标题：${item.titleEn}\n原始内容：${item.summaryEn.slice(0, 6000)}\n\n只返回JSON：{"titleZh":"中文标题","summaryZh":"120字以内中文摘要","summaryEn":"120 words以内英文摘要","importance":1到5整数,"topics":["最多4个中文主题"],"courseFormat":"录播课或直播课或null","audience":["零基础个人/职场办公人群/内容创作者/企业管理者"],"reviewInsights":["最多3条用户评价洞察"],"painPoints":["最多3条用户痛点"],"opportunity":"若是课程则给出课程机会建议，否则为空字符串"}`;

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${state.settings.apiKey}` },
    body: JSON.stringify({
      model: state.settings.model,
      messages: [
        { role: "system", content: "输出严格JSON。明确区分事实和推断，无法确认时说明证据不足。" },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: 0.2,
      max_tokens: 900
    })
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`DeepSeek API ${response.status}: ${message.slice(0, 180)}`);
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 未返回分析结果");
  const analysis = parseJsonResponse(content);
  const estimatedUsd = estimateCostUsd(payload.usage);
  await recordUsage(payload.usage, estimatedUsd);
  await maybeNotifyBudget();
  return patchItem(id, {
    ...analysis,
    importance: Math.max(1, Math.min(5, Number(analysis.importance) || item.importance)),
    analysisStatus: "complete",
    analyzedAt: new Date().toISOString(),
    aiProvider: "DeepSeek"
  });
}

async function maybeNotifyBudget() {
  if (!globalThis.chrome?.notifications) return;
  const state = await getState();
  const month = currentUsageMonth();
  const status = await getBudgetStatus();
  if (status.percent < state.settings.notifyAtPercent || state.budgetAlerts?.[month]) return;
  await chrome.notifications.create(`budget-${month}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon.png"),
    title: "DeepSeek API预算提醒",
    message: `本月估算已使用 ¥${status.spentCny.toFixed(2)}，达到预算的 ${status.percent.toFixed(0)}%。`,
    contextMessage: "请在设置中决定是否追加预算"
  });
  await chrome.storage.local.set({ budgetAlerts: { ...(state.budgetAlerts || {}), [month]: true } });
}

export async function analyzeHighValueItems(limit = 8) {
  const state = await getState();
  if (!state.settings.apiKey || !state.settings.autoAnalyzeHighValue) return [];
  const watchlist = state.settings.watchlist.map((entry) => entry.toLowerCase());
  const candidates = state.items.filter((item) => {
    if (item.analysisStatus === "complete") return false;
    const haystack = `${item.titleEn} ${item.summaryEn}`.toLowerCase();
    return item.importance >= 4 || watchlist.some((term) => haystack.includes(term));
  }).slice(0, limit);
  const analyzed = [];
  for (const item of candidates) {
    const budget = await getBudgetStatus();
    if (!budget.allowed) break;
    try {
      analyzed.push(await analyzeItem(item.id));
    } catch {
      await patchItem(item.id, { analysisStatus: "error" });
    }
  }
  return analyzed;
}
