import { APP_NAME } from "./constants.js";
import { analyzeHighValueItems, analyzeItem, getBudgetStatus } from "./analyzer.js";
import { fetchAllSources, isCourseContent } from "./fetchers.js";
import { generateWeeklyReport } from "./reports.js";
import { filterItems, getState, patchItem, pruneItems, saveReport, setState, updateSettings, upsertItems } from "./storage.js";
import { isQuietHours, simpleHash } from "./utils.js";

const ALARM_SYNC = "ai-radar-sync";
const ALARM_MORNING = "ai-radar-morning-digest";
const ALARM_WEEKLY = "ai-radar-weekly-report";
const MAX_SYNC_AGE_MS = 10 * 60 * 1000;

chrome.runtime.onInstalled.addListener(async () => {
  await recoverInterruptedSync("插件重新加载，上次更新已中断并自动重试");
  await configureAlarms();
  await openDashboard();
  runSync("installed").catch(console.error);
});

chrome.runtime.onStartup.addListener(async () => {
  await recoverInterruptedSync("Chrome重新启动，上次更新已中断并自动重试");
  await configureAlarms();
  runSync("startup").catch(console.error);
});

chrome.action.onClicked.addListener(openDashboard);
chrome.notifications.onClicked.addListener(() => openDashboard());

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_SYNC) runSync("alarm").catch(console.error);
  if (alarm.name === ALARM_MORNING) deliverMorningDigest().catch(console.error);
  if (alarm.name === ALARM_WEEKLY) generateWeeklyReport().catch(console.error);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handlers = {
    GET_STATE: () => getState(),
    RUN_SYNC: () => runSync("manual"),
    ANALYZE_ITEM: () => analyzeItem(message.id),
    PATCH_ITEM: () => patchItem(message.id, message.patch),
    UPDATE_SETTINGS: async () => {
      const settings = await updateSettings(message.patch);
      await configureAlarms();
      return settings;
    },
    GENERATE_REPORT: () => generateWeeklyReport({ forceAnalyze: true }),
    GET_BUDGET: () => getBudgetStatus(),
    TEST_API: () => testApiConnection(),
    CLEAR_EXPIRED: async () => {
      const state = await getState();
      return { pruned: await pruneItems(state.settings.retentionDays) };
    }
  };
  const handler = handlers[message?.type];
  if (!handler) return false;
  handler().then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function openDashboard() {
  const url = chrome.runtime.getURL("dashboard.html");
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId) await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

async function configureAlarms() {
  const state = await getState();
  await chrome.alarms.clearAll();
  chrome.alarms.create(ALARM_SYNC, { delayInMinutes: 2, periodInMinutes: Math.max(30, Number(state.settings.syncIntervalMinutes) || 120) });
  chrome.alarms.create(ALARM_MORNING, { when: nextLocalTime(9, 0), periodInMinutes: 1440 });
  chrome.alarms.create(ALARM_WEEKLY, { when: nextFridayAt22(), periodInMinutes: 10080 });
}

function nextLocalTime(hour, minute) {
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function nextFridayAt22() {
  const next = new Date();
  const days = (5 - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + days);
  next.setHours(22, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 7);
  return next.getTime();
}

async function runSync(reason) {
  const state = await getState();
  const startedTime = new Date(state.sync.lastStartedAt || 0).getTime();
  const syncAge = Date.now() - startedTime;
  if (state.sync.running && Number.isFinite(syncAge) && syncAge < MAX_SYNC_AGE_MS) return { skipped: true, reason: "already-running", sourceResults: state.sync.sourceResults || [] };
  const startedAt = new Date().toISOString();
  await setState({ sync: { ...state.sync, running: true, lastStartedAt: startedAt, lastError: null } });
  try {
    const fetched = await fetchAllSources(state.settings);
    await upsertItems(fetched.items);
    await filterItems((item) => item.section !== "courses" || isCourseContent(`${item.titleEn} ${item.summaryEn}`));
    await reconcileCredibility();
    await pruneItems(state.settings.retentionDays);
    const analyzed = await analyzeHighValueItems(6);
    const trendReports = await detectCourseTrends();
    const freshState = await getState();
    const lastSuccess = freshState.sync.lastSuccessAt ? new Date(freshState.sync.lastSuccessAt) : new Date(Date.now() - 2 * 3600000);
    const newHighValue = freshState.items.filter((item) => new Date(item.createdAt) > lastSuccess && item.importance >= 4 && item.credibility === "confirmed");
    await queueOrNotify(newHighValue);
    const sync = { ...freshState.sync, running: false, lastSuccessAt: new Date().toISOString(), lastError: null, sourceResults: fetched.results, lastReason: reason };
    await setState({ sync });
    chrome.runtime.sendMessage({ type: "SYNC_COMPLETE", count: fetched.items.length }).catch(() => {});
    return { count: fetched.items.length, analyzed: analyzed.length, trendReports: trendReports.length, sourceResults: fetched.results };
  } catch (error) {
    const latest = await getState();
    await setState({ sync: { ...latest.sync, running: false, lastError: error.message } });
    throw error;
  }
}

async function recoverInterruptedSync(message) {
  const state = await getState();
  if (!state.sync.running) return false;
  await setState({ sync: { ...state.sync, running: false, lastError: message } });
  return true;
}

async function detectCourseTrends() {
  const state = await getState();
  const now = Date.now();
  const currentStart = now - 7 * 86400000;
  const previousStart = now - 14 * 86400000;
  const buckets = new Map();
  for (const item of state.items.filter((entry) => entry.section === "courses" && new Date(entry.publishedAt).getTime() >= previousStart)) {
    for (const topic of item.topics?.length ? item.topics : ["AI课程"]) {
      const bucket = buckets.get(topic) || { current: [], previous: [] };
      (new Date(item.publishedAt).getTime() >= currentStart ? bucket.current : bucket.previous).push(item);
      buckets.set(topic, bucket);
    }
  }
  const candidates = [...buckets.entries()].filter(([, bucket]) => {
    const increase = bucket.previous.length ? (bucket.current.length - bucket.previous.length) / bucket.previous.length : bucket.current.length >= 5 ? 1 : 0;
    const heat = bucket.current.length ? bucket.current.reduce((sum, item) => sum + item.heatScore, 0) / bucket.current.length : 0;
    return bucket.current.length >= 3 && (increase >= 0.8 || heat >= 78);
  }).sort((a, b) => b[1].current.length - a[1].current.length).slice(0, 2);

  const reports = [];
  const today = new Date().toISOString().slice(0, 10);
  const trendAlerts = { ...(state.trendAlerts || {}) };
  for (const [topic, bucket] of candidates) {
    if (trendAlerts[topic] === today) continue;
    const heat = Math.round(bucket.current.reduce((sum, item) => sum + item.heatScore, 0) / bucket.current.length);
    const report = {
      id: simpleHash(`trend|${topic}|${today}`),
      type: "trend-course-opportunity",
      title: `课程热度突增专项报告 · ${topic}`,
      generatedAt: new Date().toISOString(),
      periodStart: new Date(currentStart).toISOString(),
      periodEnd: new Date(now).toISOString(),
      sampleSize: bucket.current.length,
      summary: `${topic}在最近7天达到${bucket.current.length}条公开课程或讨论信号，综合热度${heat}分，建议进入选题验证。`,
      opportunities: [{
        rank: 1,
        topic,
        heatScore: heat,
        evidenceCount: bucket.current.length,
        audience: bucket.current.flatMap((item) => item.audience || [])[0] || "零基础个人",
        format: bucket.current.filter((item) => item.courseFormat === "直播课").length > bucket.current.length / 2 ? "直播课" : "录播课",
        reason: `本周信号量较上一周期明显增长或平均热度超过阈值。建议先制作小型内容或报名页验证真实需求。`,
        painPoints: [...new Set(bucket.current.flatMap((item) => item.painPoints || []))].slice(0, 3),
        sources: bucket.current.slice(0, 5).map((item) => ({ title: item.titleZh || item.titleEn, url: item.url, source: item.source }))
      }],
      caveats: ["突增判断基于公开样本，不等同于真实销量增长。", "建议通过访谈、预售或内容点击进一步验证。"]
    };
    await saveReport(report);
    reports.push(report);
    trendAlerts[topic] = today;
  }
  if (reports.length) {
    await setState({ trendAlerts });
    if (!isQuietHours(new Date(), state.settings.quietStartHour, state.settings.quietEndHour)) {
      await chrome.notifications.create(`trend-${today}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon.png"),
        title: "AI课程主题热度明显上升",
        message: reports.map((report) => report.opportunities[0].topic).join("、"),
        contextMessage: "已生成专项课程机会报告"
      });
    }
  }
  return reports;
}

function fingerprint(title = "") {
  const stop = new Set(["the", "a", "an", "and", "for", "with", "from", "new", "ai", "of", "to", "in", "on"]);
  return title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff ]/g, " ").split(/\s+/).filter((token) => token.length > 2 && !stop.has(token)).slice(0, 6).sort().join("|");
}

async function reconcileCredibility() {
  const state = await getState();
  const groups = new Map();
  for (const item of state.items.filter((entry) => entry.section === "news" || entry.importance >= 4)) {
    const key = fingerprint(item.titleEn);
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  const items = state.items.map((item) => {
    const group = groups.get(fingerprint(item.titleEn)) || [];
    const distinctSources = new Set(group.map((entry) => entry.sourceId)).size;
    const confirmed = item.sourceOfficial || distinctSources >= 2;
    return {
      ...item,
      credibility: confirmed ? "confirmed" : "pending",
      corroboratingSources: distinctSources,
      isMajorConfirmed: confirmed && item.importance >= 4
    };
  });
  await setState({ items });
}

async function queueOrNotify(items) {
  if (!items.length) return;
  const state = await getState();
  if (isQuietHours(new Date(), state.settings.quietStartHour, state.settings.quietEndHour)) {
    const pending = [...new Set([...state.pendingNotifications, ...items.map((item) => item.id)])].slice(-50);
    await setState({ pendingNotifications: pending });
    return;
  }
  for (const item of items.slice(0, 3)) await showNotification(item);
}

async function showNotification(item) {
  await chrome.notifications.create(`item-${item.id}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon.png"),
    title: `${APP_NAME} · 已确认`,
    message: item.titleZh || item.titleEn,
    contextMessage: item.source,
    priority: item.importance >= 5 ? 2 : 1
  });
}

async function deliverMorningDigest() {
  const state = await getState();
  if (!state.pendingNotifications.length) return { count: 0 };
  const items = state.pendingNotifications.map((id) => state.items.find((item) => item.id === id)).filter(Boolean);
  await chrome.notifications.create("morning-digest", {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon.png"),
    title: "AI 情报早间汇总",
    message: `免打扰期间新增 ${items.length} 条重要且已确认的 AI 情报。`,
    contextMessage: items.slice(0, 2).map((item) => item.titleZh || item.titleEn).join(" · ")
  });
  await setState({ pendingNotifications: [] });
  return { count: items.length };
}

async function testApiConnection() {
  const state = await getState();
  if (!state.settings.apiKey) throw new Error("请先填写 API Key");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${state.settings.apiKey}` },
    body: JSON.stringify({ model: state.settings.model, messages: [{ role: "user", content: "只回复 OK" }], thinking: { type: "disabled" }, max_tokens: 8 })
  });
  if (!response.ok) throw new Error(`连接失败：${response.status} ${(await response.text()).slice(0, 120)}`);
  return { connected: true };
}
