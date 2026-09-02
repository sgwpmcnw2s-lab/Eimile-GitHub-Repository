import { NAV_ITEMS, SECTION_LABELS, SOURCE_GROUPS } from "./constants.js";
import { downloadText, escapeCsv, formatBeijingTime, matchesSearchQuery } from "./utils.js";

let appState = null;
let budget = { spentCny: 0, limitCny: 10, percent: 0 };
let currentSection = "updates";
let libraryTab = "saved";
let currentDetailId = null;
let noteSaveTimer = null;

const pageMeta = {
  updates: ["AI更新迭代", "追踪全球 AI 公司、模型、产品和开源项目的重要变化。"],
  courses: ["海外AI课程", "洞察课程热度、用户评价、真实痛点与下一门课程机会。"],
  news: ["AI新闻播报", "用多来源验证跟踪 AI 研究、重大节点、应用和里程碑。"],
  library: ["我的资料库", "集中管理收藏、稍后阅读、个人笔记与课程机会报告。"],
  settings: ["设置", "管理 DeepSeek、预算、更新频率、提醒规则和重点关注清单。"]
};

const icons = { spark: "✦", course: "◫", news: "◉", bookmark: "◇", settings: "⌘" };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function send(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (!response?.ok) throw new Error(response?.error || "操作失败");
  return response.result;
}

function escapeHtml(value = "") {
  const node = document.createElement("div");
  node.textContent = String(value);
  return node.innerHTML;
}

function safeUrl(value = "") {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : "#";
  } catch { return "#"; }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

async function refreshState() {
  appState = await send("GET_STATE");
  budget = await send("GET_BUDGET");
  renderAll();
}

function renderAll() {
  renderNav();
  renderHeader();
  renderSyncStatus();
  renderBudget();
  renderStats();
  renderFilters();
  renderView();
}

function renderNav() {
  $("#sidebarNav").innerHTML = NAV_ITEMS.map((item) => `
    <button class="nav-button ${item.id === currentSection ? "active" : ""}" data-section="${item.id}">
      <span class="nav-icon">${icons[item.icon]}</span><span>${item.label}</span>
    </button>`).join("");
  $$(".nav-button").forEach((button) => button.addEventListener("click", () => {
    currentSection = button.dataset.section;
    renderAll();
  }));
}

function renderHeader() {
  const [title, description] = pageMeta[currentSection];
  $("#pageTitle").textContent = title;
  $("#pageDescription").textContent = description;
  $("#toolbar").hidden = currentSection === "settings";
  const count = appState.pendingNotifications.length;
  $("#notificationCount").hidden = !count;
  $("#notificationCount").textContent = count;
}

function renderSyncStatus() {
  const sync = appState.sync;
  const dot = $("#syncDot");
  dot.className = `sync-dot ${sync.running ? "running" : sync.lastSuccessAt ? "live" : ""}`;
  $("#syncLabel").textContent = sync.running ? "正在更新" : sync.lastError ? "部分来源异常" : sync.lastSuccessAt ? "数据已同步" : "等待首次同步";
  $("#syncTime").textContent = sync.lastSuccessAt ? `${formatBeijingTime(sync.lastSuccessAt)} · 每2小时` : "每2小时更新";
  $("#syncButton").disabled = sync.running;
  $("#syncButton").textContent = sync.running ? "更新中…" : "立即更新";
}

function renderBudget() {
  $("#budgetText").textContent = `¥${budget.spentCny.toFixed(2)} / ¥${budget.limitCny}`;
  $("#budgetBar").style.width = `${Math.min(100, budget.percent)}%`;
  $("#budgetBar").style.background = budget.percent >= 100 ? "#e35f71" : budget.percent >= 80 ? "#f2a53b" : "";
}

function sectionItems() {
  if (["updates", "courses", "news"].includes(currentSection)) return appState.items.filter((item) => item.section === currentSection);
  if (currentSection === "library") {
    if (libraryTab === "saved") return appState.items.filter((item) => item.saved);
    if (libraryTab === "later") return appState.items.filter((item) => item.readLater);
    if (libraryTab === "notes") return appState.items.filter((item) => item.note);
  }
  return [];
}

function filteredItems() {
  const query = $("#searchInput")?.value.trim().toLowerCase() || "";
  const topic = $("#topicFilter")?.value || "";
  const source = $("#sourceFilter")?.value || "";
  const timeDays = Number($("#timeFilter")?.value || 0);
  const dimension = $("#dimensionFilter")?.value || "";
  const status = $("#statusFilter")?.value || "";
  const sort = $("#sortSelect")?.value || "latest";
  const items = sectionItems().filter((item) => {
    const haystack = `${item.titleZh} ${item.titleEn} ${item.summaryZh} ${item.summaryEn} ${item.source} ${(item.topics || []).join(" ")}`.toLowerCase();
    if (!matchesSearchQuery(haystack, query)) return false;
    if (topic && !(item.topics || []).includes(topic)) return false;
    if (source && item.source !== source) return false;
    if (timeDays && new Date(item.publishedAt).getTime() < Date.now() - timeDays * 86400000) return false;
    if (dimension.startsWith("format:") && item.courseFormat !== dimension.slice(7)) return false;
    if (dimension.startsWith("audience:") && !(item.audience || []).includes(dimension.slice(9))) return false;
    if (dimension === "major" && item.importance < 4) return false;
    if (status === "confirmed" && item.credibility !== "confirmed") return false;
    if (status === "pending" && item.credibility !== "pending") return false;
    if (status === "unread" && item.read) return false;
    if (status === "saved" && !item.saved) return false;
    return true;
  });
  return items.sort((a, b) => {
    if (sort === "heat") return b.heatScore - a.heatScore;
    if (sort === "importance") return b.importance - a.importance;
    return new Date(b.publishedAt) - new Date(a.publishedAt);
  });
}

function renderStats() {
  const items = sectionItems();
  let stats;
  if (currentSection === "courses") {
    stats = [
      ["课程与讨论", items.length, "近30天公开样本"],
      ["平均热度", average(items, "heatScore"), "综合指标"],
      ["录播 / 直播", `${items.filter((i) => i.courseFormat === "录播课").length} / ${items.filter((i) => i.courseFormat === "直播课").length}`, "固定课表口径"],
      ["机会报告", appState.reports.length, "每周五22:00"]
    ];
  } else if (currentSection === "library") {
    stats = [
      ["我的收藏", appState.items.filter((i) => i.saved).length, "长期保留"],
      ["稍后阅读", appState.items.filter((i) => i.readLater).length, "待处理"],
      ["个人笔记", appState.items.filter((i) => i.note).length, "本地保存"],
      ["课程报告", appState.reports.length, "可导出"]
    ];
  } else if (currentSection === "settings") {
    stats = [
      ["启用来源", Object.values(appState.settings.sourceEnabled).filter((v) => v !== false).length || "默认全部", "公开来源"],
      ["更新间隔", `${appState.settings.syncIntervalMinutes}分钟`, "Chrome运行期间"],
      ["保留时间", `${appState.settings.retentionDays}天`, "收藏除外"],
      ["预算使用", `${budget.percent.toFixed(1)}%`, "接近上限提醒"]
    ];
  } else {
    stats = [
      ["近30天内容", items.length, SECTION_LABELS[currentSection]],
      ["已确认", items.filter((i) => i.credibility === "confirmed").length, "官方或多源佐证"],
      ["重大情报", items.filter((i) => i.importance >= 4).length, "重要度4–5"],
      ["未读", items.filter((i) => !i.read).length, "等待查看"]
    ];
  }
  $("#statsGrid").innerHTML = stats.map(([label, value, note]) => `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`).join("");
}

function average(items, key) {
  return items.length ? Math.round(items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length) : 0;
}

function renderFilters() {
  const items = sectionItems();
  const topics = [...new Set(items.flatMap((item) => item.topics || []))].sort();
  const sources = [...new Set(items.map((item) => item.source))].sort();
  const topicValue = $("#topicFilter").value;
  const sourceValue = $("#sourceFilter").value;
  const dimensionValue = $("#dimensionFilter").value;
  $("#topicFilter").innerHTML = `<option value="">全部主题</option>${topics.map((topic) => `<option>${escapeHtml(topic)}</option>`).join("")}`;
  $("#sourceFilter").innerHTML = `<option value="">全部来源</option>${sources.map((source) => `<option>${escapeHtml(source)}</option>`).join("")}`;
  $("#dimensionFilter").innerHTML = currentSection === "courses"
    ? `<option value="">全部分类</option><option value="format:录播课">录播课</option><option value="format:直播课">直播课</option><option value="audience:零基础个人">零基础个人</option><option value="audience:职场办公人群">职场办公人群</option><option value="audience:内容创作者">内容创作者</option><option value="audience:企业管理者">企业管理者</option>`
    : `<option value="">全部分类</option><option value="major">重要程度4–5</option>`;
  if (topics.includes(topicValue)) $("#topicFilter").value = topicValue;
  if (sources.includes(sourceValue)) $("#sourceFilter").value = sourceValue;
  if ([...$("#dimensionFilter").options].some((option) => option.value === dimensionValue)) $("#dimensionFilter").value = dimensionValue;
}

function renderView() {
  if (currentSection === "settings") return renderSettings();
  if (currentSection === "library") return renderLibrary();
  const items = filteredItems();
  let content = renderCards(items);
  if (currentSection === "courses") content += renderReportSection();
  $("#viewContent").innerHTML = content;
  bindCardEvents();
  bindReportEvents();
}

function renderCards(items) {
  if (!items.length) return `<div class="empty-state"><div class="empty-icon">◎</div><h3>暂时没有匹配内容</h3><p>首次使用请点击“立即更新”。部分海外来源可能暂时不可访问，插件会保留来源状态并在下次同步重试。</p><button class="primary-button" data-action="sync-empty">立即更新</button></div>`;
  return `<div class="content-list">${items.map(renderCard).join("")}</div>`;
}

function renderCard(item) {
  const title = item.titleZh || item.titleEn;
  const english = item.titleZh ? item.titleEn : "尚未生成中文标题 · 点击卡片可按需分析";
  const summary = item.summaryZh || item.summaryEn || "暂无摘要";
  const verified = item.credibility === "confirmed";
  return `<article class="content-card ${item.read ? "read" : ""}" data-id="${item.id}">
    <div class="score-ring" style="--score:${item.heatScore || 0}"><strong>${item.heatScore || 0}</strong><small>热度</small></div>
    <div class="card-main">
      <div class="card-meta"><span class="source-dot"></span><strong>${escapeHtml(item.source)}</strong><span>·</span><span>${escapeHtml(formatBeijingTime(item.publishedAt))}</span><span class="pill ${verified ? "confirmed" : "pending"}">${verified ? "已确认" : "待验证"}</span>${item.courseFormat ? `<span class="pill ${item.courseFormat === "直播课" ? "live" : ""}">${escapeHtml(item.courseFormat)}</span>` : ""}<span class="importance">${"★".repeat(item.importance || 1)}</span></div>
      <h2 class="card-title">${escapeHtml(title)}</h2>
      <p class="card-title-en">${escapeHtml(english)}</p>
      <p class="card-summary">${escapeHtml(summary)}</p>
      <div class="tag-row">${(item.topics || []).map((topic) => `<span class="tag"># ${escapeHtml(topic)}</span>`).join("")}${(item.audience || []).slice(0,2).map((audience) => `<span class="tag">${escapeHtml(audience)}</span>`).join("")}</div>
    </div>
    <div class="card-actions">
      <button class="card-action ${item.saved ? "active" : ""}" data-action="saved" title="收藏">${item.saved ? "◆" : "◇"}</button>
      <button class="card-action ${item.read ? "active" : ""}" data-action="read" title="标记已读">✓</button>
      <button class="card-action ${item.readLater ? "active" : ""}" data-action="later" title="稍后阅读">◷</button>
      <button class="card-action ${item.note ? "active" : ""}" data-action="note" title="添加笔记">✎</button>
    </div>
  </article>`;
}

function renderReportSection() {
  return `<div class="section-heading"><h2>课程机会报告</h2><button class="primary-button" id="generateReportButton">生成本周报告</button></div>
    <div class="report-grid">${appState.reports.length ? appState.reports.map(renderReportCard).join("") : `<div class="empty-state"><h3>还没有课程机会报告</h3><p>完成首次数据同步后生成报告。报告会明确数据依据、机会判断和限制。</p></div>`}</div>`;
}

function renderReportCard(report) {
  return `<article class="report-card" data-report-id="${report.id}"><span class="pill">课程机会</span><h3>${escapeHtml(report.title)}</h3><p>${escapeHtml(report.summary)}</p><p>样本：${report.sampleSize} · 生成：${escapeHtml(formatBeijingTime(report.generatedAt))}</p><footer><button class="secondary-button" data-export="pdf">PDF</button><button class="secondary-button" data-export="md">Markdown</button><button class="secondary-button" data-export="csv">CSV</button></footer></article>`;
}

function renderLibrary() {
  const tabs = [["saved", "我的收藏"], ["later", "稍后阅读"], ["notes", "我的笔记"], ["reports", "课程报告"]];
  let content = `<div class="library-tabs">${tabs.map(([id,label]) => `<button class="tab-button ${libraryTab === id ? "active" : ""}" data-library-tab="${id}">${label}</button>`).join("")}</div>`;
  content += libraryTab === "reports" ? `<div class="report-grid">${appState.reports.length ? appState.reports.map(renderReportCard).join("") : renderCards([])}</div>` : renderCards(filteredItems());
  $("#viewContent").innerHTML = content;
  $$(`[data-library-tab]`).forEach((button) => button.addEventListener("click", () => { libraryTab = button.dataset.libraryTab; renderAll(); }));
  bindCardEvents();
  bindReportEvents();
}

function bindCardEvents() {
  $$(`[data-action="sync-empty"]`).forEach((button) => button.addEventListener("click", runSync));
  $$(".content-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (action) return handleCardAction(card.dataset.id, action);
      openDetail(card.dataset.id);
    });
  });
}

async function handleCardAction(id, action) {
  const item = appState.items.find((entry) => entry.id === id);
  if (!item) return;
  const patches = { saved: { saved: !item.saved }, read: { read: !item.read }, later: { readLater: !item.readLater } };
  if (action === "note") return openDetail(id, true);
  const patch = patches[action];
  if (!patch) return;
  await send("PATCH_ITEM", { id, patch });
  await refreshState();
  showToast(action === "saved" ? (patch.saved ? "已收藏，内容将长期保留" : "已取消收藏") : action === "later" ? "稍后阅读状态已更新" : "阅读状态已更新");
}

function openDetail(id, focusNote = false) {
  const item = appState.items.find((entry) => entry.id === id);
  if (!item) return;
  currentDetailId = id;
  $("#drawerContent").innerHTML = `
    <span class="drawer-kicker">${escapeHtml(item.source)} · ${escapeHtml(formatBeijingTime(item.publishedAt))}</span>
    <h2>${escapeHtml(item.titleZh || item.titleEn)}</h2>
    <p class="drawer-english">${escapeHtml(item.titleEn)}</p>
    <div class="tag-row"><span class="pill ${item.credibility === "confirmed" ? "confirmed" : "pending"}">${item.credibility === "confirmed" ? "已确认" : "待验证"}</span>${(item.topics || []).map((topic) => `<span class="tag"># ${escapeHtml(topic)}</span>`).join("")}</div>
    <section class="drawer-section"><h3>中文摘要</h3><p>${escapeHtml(item.summaryZh || "尚未生成。你可以点击下方“生成AI分析”。")}</p></section>
    <section class="drawer-section"><h3>English summary</h3><p>${escapeHtml(item.summaryEn || "No summary available.")}</p></section>
    ${item.reviewInsights?.length ? `<section class="drawer-section"><h3>用户评价洞察</h3><ul>${item.reviewInsights.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul></section>` : ""}
    ${item.painPoints?.length ? `<section class="drawer-section"><h3>用户痛点</h3><ul>${item.painPoints.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul></section>` : ""}
    ${item.opportunity ? `<section class="drawer-section"><h3>课程机会建议</h3><p>${escapeHtml(item.opportunity)}</p></section>` : ""}
    <section class="drawer-section"><h3>我的笔记</h3><textarea id="noteField" placeholder="记录你的判断、选题灵感或后续动作…">${escapeHtml(item.note || "")}</textarea></section>
    <div class="drawer-actions">
      <button class="primary-button" id="analyzeButton" ${item.analysisStatus === "complete" ? "disabled" : ""}>${item.analysisStatus === "complete" ? "AI分析已完成" : "生成AI分析"}</button>
      <button class="secondary-button" id="saveNoteButton">保存笔记</button>
      <a class="secondary-button source-link" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noreferrer">查看英文原文 ↗</a>
    </div>`;
  $("#detailDrawer").classList.add("open");
  $("#drawerBackdrop").classList.add("open");
  $("#detailDrawer").setAttribute("aria-hidden", "false");
  $("#analyzeButton").addEventListener("click", () => analyzeCurrentItem(id));
  $("#saveNoteButton").addEventListener("click", () => saveNote(id));
  $("#noteField").addEventListener("input", () => {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(() => saveNote(id, { silent: true }).catch(console.error), 600);
  });
  if (focusNote) setTimeout(() => $("#noteField").focus(), 250);
}

async function closeDetail() {
  clearTimeout(noteSaveTimer);
  const id = currentDetailId;
  if (id && $("#noteField")) {
    try { await saveNote(id, { silent: true }); }
    catch (error) { showToast(error.message); return; }
  }
  $("#detailDrawer").classList.remove("open");
  $("#drawerBackdrop").classList.remove("open");
  $("#detailDrawer").setAttribute("aria-hidden", "true");
  currentDetailId = null;
}

async function analyzeCurrentItem(id) {
  const button = $("#analyzeButton");
  button.disabled = true;
  button.textContent = "DeepSeek分析中…";
  try {
    await send("ANALYZE_ITEM", { id });
    await refreshState();
    openDetail(id);
    showToast("中英文摘要与分析已生成");
  } catch (error) {
    button.disabled = false;
    button.textContent = "生成AI分析";
    showToast(error.message);
  }
}

async function saveNote(id, { silent = false } = {}) {
  const note = $("#noteField").value.trim();
  const updated = await send("PATCH_ITEM", { id, patch: { note } });
  const index = appState.items.findIndex((item) => item.id === id);
  if (index >= 0) appState.items[index] = updated;
  if (!silent) showToast(note ? "笔记已保存并长期保留" : "笔记已清空");
  return updated;
}

function bindReportEvents() {
  $("#generateReportButton")?.addEventListener("click", generateReport);
  $$(`[data-export]`).forEach((button) => button.addEventListener("click", () => {
    const reportId = button.closest("[data-report-id]").dataset.reportId;
    const report = appState.reports.find((entry) => entry.id === reportId);
    exportReport(report, button.dataset.export);
  }));
}

async function generateReport() {
  const button = $("#generateReportButton");
  button.disabled = true;
  button.textContent = "生成中…";
  try {
    await send("GENERATE_REPORT");
    await refreshState();
    showToast("中文版课程机会报告已生成");
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
    button.textContent = "生成本周报告";
  }
}

function reportMarkdown(report) {
  const lines = [`# ${report.title}`, "", `生成时间：${formatBeijingTime(report.generatedAt)}`, `统计周期：${formatBeijingTime(report.periodStart)} 至 ${formatBeijingTime(report.periodEnd)}`, `公开样本数：${report.sampleSize}`, "", `> ${report.summary}`, "", "## 课程机会排序", ""];
  for (const opportunity of report.opportunities) {
    lines.push(`### ${opportunity.rank}. ${opportunity.topic}`, "", `- 热度分：${opportunity.heatScore}`, `- 证据数量：${opportunity.evidenceCount}`, `- 建议人群：${opportunity.audience}`, `- 推荐形式：${opportunity.format}`, `- 机会理由：${opportunity.reason}`);
    if (opportunity.painPoints?.length) lines.push(`- 用户痛点：${opportunity.painPoints.join("；")}`);
    lines.push("", "参考来源：", ...opportunity.sources.map((source) => `- [${source.title}](${source.url}) · ${source.source}`), "");
  }
  lines.push("## 使用限制", "", ...report.caveats.map((caveat) => `- ${caveat}`));
  return lines.join("\n");
}

function reportCsv(report) {
  const header = ["排名", "课程主题", "热度分", "证据数量", "目标人群", "推荐形式", "机会理由", "用户痛点", "来源链接"];
  const rows = report.opportunities.map((entry) => [entry.rank, entry.topic, entry.heatScore, entry.evidenceCount, entry.audience, entry.format, entry.reason, (entry.painPoints || []).join("；"), entry.sources.map((source) => source.url).join("；")]);
  return "\uFEFF" + [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function exportReport(report, type) {
  if (!report) return;
  const base = report.title.replace(/[\\/:*?"<>|]/g, "-");
  if (type === "md") return downloadText(`${base}.md`, reportMarkdown(report), "text/markdown;charset=utf-8");
  if (type === "csv") return downloadText(`${base}.csv`, reportCsv(report), "text/csv;charset=utf-8");
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#17233a;max-width:820px;margin:40px auto;line-height:1.75}h1{color:#236fcf}h2{margin-top:32px;border-bottom:1px solid #dcebf8;padding-bottom:8px}.meta{color:#6f7f94}.op{break-inside:avoid;border:1px solid #dcebf8;border-radius:12px;padding:16px;margin:12px 0}.score{color:#236fcf;font-weight:700}a{color:#236fcf}@media print{body{margin:0}.no-print{display:none}}</style></head><body><h1>${escapeHtml(report.title)}</h1><p class="meta">统计周期：${escapeHtml(formatBeijingTime(report.periodStart))} 至 ${escapeHtml(formatBeijingTime(report.periodEnd))} · 样本 ${report.sampleSize}</p><p>${escapeHtml(report.summary)}</p><h2>课程机会排序</h2>${report.opportunities.map((entry) => `<section class="op"><h3>${entry.rank}. ${escapeHtml(entry.topic)} <span class="score">${entry.heatScore}分</span></h3><p><b>建议人群：</b>${escapeHtml(entry.audience)}　<b>推荐形式：</b>${escapeHtml(entry.format)}</p><p><b>机会理由：</b>${escapeHtml(entry.reason)}</p>${entry.painPoints?.length ? `<p><b>用户痛点：</b>${escapeHtml(entry.painPoints.join("；"))}</p>` : ""}<p><b>参考来源：</b>${entry.sources.map((source) => `<a href="${escapeHtml(safeUrl(source.url))}">${escapeHtml(source.title)}</a>`).join("；")}</p></section>`).join("")}<h2>使用限制</h2><ul>${report.caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join("")}</ul></body></html>`;
  const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const printWindow = window.open(blobUrl, "_blank");
  setTimeout(() => { printWindow?.print(); setTimeout(() => URL.revokeObjectURL(blobUrl), 3000); }, 700);
}

function renderSettings() {
  const settings = appState.settings;
  const allSources = [...SOURCE_GROUPS.rss, ...SOURCE_GROUPS.github, ...SOURCE_GROUPS.hackerNews, ...SOURCE_GROUPS.reddit, ...SOURCE_GROUPS.arxiv];
  $("#viewContent").innerHTML = `<div class="settings-grid">
    <section class="settings-card"><h2>DeepSeek 与预算</h2><p>API Key只保存在本机Chrome中，以掩码显示，不会提交到GitHub。</p>
      <div class="field"><label for="apiKeyInput">DeepSeek API Key</label><input id="apiKeyInput" type="password" value="${escapeHtml(settings.apiKey)}" placeholder="sk-…" autocomplete="off"></div>
      <div class="field-row"><div class="field"><label for="modelInput">模型</label><input id="modelInput" value="${escapeHtml(settings.model)}"></div><div class="field"><label for="budgetInput">月预算（人民币）</label><input id="budgetInput" type="number" min="1" step="1" value="${settings.monthlyBudgetCny}"></div></div>
      <div class="settings-actions"><button class="primary-button" id="saveAiSettings">保存设置</button><button class="secondary-button" id="testApiButton">测试连接</button></div>
    </section>
    <section class="settings-card"><h2>同步与提醒</h2><p>仅在Chrome运行期间同步；重启后自动补抓，最多保留30天普通内容。</p>
      <div class="field-row"><div class="field"><label for="intervalInput">更新间隔（分钟）</label><input id="intervalInput" type="number" min="30" value="${settings.syncIntervalMinutes}"></div><div class="field"><label for="retentionInput">保留天数</label><input id="retentionInput" type="number" min="1" max="30" value="${settings.retentionDays}"></div></div>
      <div class="field-row"><div class="field"><label for="quietStart">免打扰开始</label><input id="quietStart" type="number" min="0" max="23" value="${settings.quietStartHour}"></div><div class="field"><label for="quietEnd">免打扰结束</label><input id="quietEnd" type="number" min="0" max="23" value="${settings.quietEndHour}"></div></div>
      <button class="primary-button" id="saveSyncSettings">保存同步设置</button>
    </section>
    <section class="settings-card"><h2>重点关注清单</h2><p>命中清单的内容会提高分析和提醒优先级。</p>
      <div class="watchlist" id="watchlist">${settings.watchlist.map((entry, index) => `<span class="watch-tag">${escapeHtml(entry)}<button data-remove-watch="${index}">×</button></span>`).join("")}</div>
      <div class="field"><label for="watchInput">添加公司、模型、产品、机构、关键词或GitHub仓库</label><input id="watchInput" placeholder="输入后按回车"></div>
    </section>
    <section class="settings-card"><h2>数据来源状态</h2><p>只抓取公开可访问的信息。失败来源会在下一轮更新时重试。</p>
      <div class="source-status">${allSources.map((source) => { const status = appState.sync.sourceResults.find((entry) => entry.sourceId === source.id); return `<div class="source-row"><span>${escapeHtml(source.name)}</span><span class="pill ${status?.ok ? "confirmed" : status ? "pending" : ""}">${status ? status.ok ? `${status.count}条` : "异常" : "待同步"}</span></div>`; }).join("")}</div>
    </section>
    <section class="settings-card"><h2>第二阶段集成</h2><p>以下能力已进入第二阶段范围，MVP暂不启用。</p><div class="source-row"><span>Obsidian · AI全球情报库</span><span class="pill">第二阶段</span></div><div class="source-row"><span>163邮箱周五22:00推送</span><span class="pill">第二阶段</span></div></section>
    <section class="settings-card"><h2>本地数据维护</h2><p>收藏、稍后阅读、笔记和重大已确认内容不会被30天清理规则删除。</p><button class="secondary-button danger-button" id="clearExpiredButton">立即清理过期普通内容</button></section>
  </div>`;
  bindSettingsEvents();
}

function bindSettingsEvents() {
  $("#saveAiSettings").addEventListener("click", async () => {
    await saveSettings({ apiKey: $("#apiKeyInput").value.trim(), model: $("#modelInput").value.trim() || "deepseek-v4-flash", monthlyBudgetCny: Number($("#budgetInput").value) || 10 });
  });
  $("#testApiButton").addEventListener("click", async () => {
    try { await saveSettings({ apiKey: $("#apiKeyInput").value.trim(), model: $("#modelInput").value.trim() }); await send("TEST_API"); showToast("DeepSeek API连接成功"); } catch (error) { showToast(error.message); }
  });
  $("#saveSyncSettings").addEventListener("click", () => saveSettings({ syncIntervalMinutes: Math.max(30, Number($("#intervalInput").value) || 120), retentionDays: Math.min(30, Math.max(1, Number($("#retentionInput").value) || 30)), quietStartHour: Number($("#quietStart").value), quietEndHour: Number($("#quietEnd").value) }));
  $$(`[data-remove-watch]`).forEach((button) => button.addEventListener("click", async () => { const watchlist = [...appState.settings.watchlist]; watchlist.splice(Number(button.dataset.removeWatch), 1); await saveSettings({ watchlist }); }));
  $("#watchInput").addEventListener("keydown", async (event) => { if (event.key === "Enter" && event.target.value.trim()) { const watchlist = [...new Set([...appState.settings.watchlist, event.target.value.trim()])]; await saveSettings({ watchlist }); } });
  $("#clearExpiredButton").addEventListener("click", async () => { const result = await send("CLEAR_EXPIRED"); await refreshState(); showToast(`已清理 ${result.pruned} 条过期普通内容`); });
}

async function saveSettings(patch) {
  await send("UPDATE_SETTINGS", { patch });
  await refreshState();
  showToast("设置已保存");
}

async function runSync() {
  $("#syncButton").disabled = true;
  $("#syncButton").textContent = "更新中…";
  try {
    const result = await send("RUN_SYNC");
    await refreshState();
    if (result.skipped) return showToast("已有一轮更新正在进行，请稍候");
    const failed = result.sourceResults?.filter((entry) => !entry.ok).length || 0;
    showToast(`更新完成：抓取 ${result.count} 条${failed ? `，${failed}个来源待重试` : ""}`);
  } catch (error) {
    showToast(error.message);
    await refreshState();
  }
}

$("#syncButton").addEventListener("click", runSync);
$("#drawerClose").addEventListener("click", closeDetail);
$("#drawerBackdrop").addEventListener("click", closeDetail);
$("#notificationButton").addEventListener("click", () => { currentSection = "news"; $("#statusFilter").value = "confirmed"; renderAll(); });
const searchInput = $("#searchInput");
searchInput.addEventListener("input", renderView);
searchInput.addEventListener("search", renderView);
searchInput.addEventListener("change", renderView);
searchInput.addEventListener("keydown", (event) => { if (event.key === "Enter") renderView(); });
[$("#topicFilter"), $("#sourceFilter"), $("#timeFilter"), $("#dimensionFilter"), $("#statusFilter"), $("#sortSelect")].forEach((element) => element.addEventListener("change", renderView));
chrome.runtime.onMessage.addListener((message) => { if (message.type === "SYNC_COMPLETE") refreshState().catch(console.error); });

refreshState().catch((error) => {
  $("#viewContent").innerHTML = `<div class="empty-state"><h3>插件初始化失败</h3><p>${escapeHtml(error.message)}</p></div>`;
});
