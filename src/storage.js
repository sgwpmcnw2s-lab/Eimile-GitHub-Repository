import { DEFAULT_SETTINGS, STORAGE_VERSION } from "./constants.js";

const DEFAULT_STATE = {
  version: STORAGE_VERSION,
  items: [],
  reports: [],
  sync: {
    lastStartedAt: null,
    lastSuccessAt: null,
    lastError: null,
    sourceResults: [],
    running: false
  },
  usage: {},
  budgetAlerts: {},
  trendAlerts: {},
  pendingNotifications: [],
  settings: DEFAULT_SETTINGS
};

function api() {
  if (!globalThis.chrome?.storage?.local) throw new Error("Chrome storage API unavailable");
  return chrome.storage.local;
}

let itemMutationQueue = Promise.resolve();

function mutateItems(mutator) {
  const operation = itemMutationQueue.then(async () => {
    const state = await getState();
    const result = await mutator(state.items, state);
    await setState({ items: result.items });
    return result.value;
  });
  itemMutationQueue = operation.catch(() => {});
  return operation;
}

export async function getState() {
  const stored = await api().get(DEFAULT_STATE);
  return {
    ...DEFAULT_STATE,
    ...stored,
    settings: { ...DEFAULT_SETTINGS, ...(stored.settings || {}) },
    sync: { ...DEFAULT_STATE.sync, ...(stored.sync || {}) }
  };
}

export async function setState(patch) {
  await api().set(patch);
}

export async function updateSettings(patch) {
  const state = await getState();
  const settings = { ...state.settings, ...patch };
  await setState({ settings });
  return settings;
}

export async function upsertItems(incoming) {
  return mutateItems((currentItems) => {
    const existing = new Map(currentItems.map((item) => [item.id, item]));
    for (const item of incoming) {
      const previous = existing.get(item.id) || {};
      existing.set(item.id, {
        ...previous,
        ...item,
        saved: previous.saved || false,
        read: previous.read || false,
        readLater: previous.readLater || false,
        note: previous.note || ""
      });
    }
    const items = [...existing.values()].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    return { items, value: items };
  });
}

export async function patchItem(id, patch) {
  return mutateItems((currentItems) => {
    const index = currentItems.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("内容不存在，保存失败");
    const updated = { ...currentItems[index], ...patch, updatedAt: new Date().toISOString() };
    const items = [...currentItems];
    items[index] = updated;
    return { items, value: updated };
  });
}

export async function pruneItems(retentionDays) {
  return mutateItems((currentItems) => {
    const cutoff = Date.now() - retentionDays * 86400000;
    const items = currentItems.filter((item) => {
      const protectedItem = item.saved || item.readLater || item.note || item.isMajorConfirmed;
      return protectedItem || new Date(item.publishedAt).getTime() >= cutoff;
    });
    return { items, value: currentItems.length - items.length };
  });
}

export async function filterItems(predicate) {
  return mutateItems((currentItems) => {
    const items = currentItems.filter(predicate);
    return { items, value: currentItems.length - items.length };
  });
}

export function currentUsageMonth(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(date);
}

export async function recordUsage(usage = {}, estimatedUsd = 0) {
  const state = await getState();
  const month = currentUsageMonth();
  const previous = state.usage[month] || { inputTokens: 0, outputTokens: 0, estimatedUsd: 0, calls: 0 };
  const next = {
    inputTokens: previous.inputTokens + (usage.prompt_tokens || usage.input_tokens || 0),
    outputTokens: previous.outputTokens + (usage.completion_tokens || usage.output_tokens || 0),
    estimatedUsd: previous.estimatedUsd + estimatedUsd,
    calls: previous.calls + 1
  };
  await setState({ usage: { ...state.usage, [month]: next } });
  return next;
}

export async function saveReport(report) {
  const state = await getState();
  const reports = [report, ...state.reports.filter((entry) => entry.id !== report.id)].slice(0, 52);
  await setState({ reports });
  return report;
}
