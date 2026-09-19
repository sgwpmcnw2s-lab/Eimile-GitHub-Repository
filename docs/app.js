const DATA_URL = './data/feed.json';
const STORE_KEY = 'global-ai-radar-v2';
const defaultState = {bookmarks:[],read:[],later:[],notes:{},notification:false};
const views = {
  updates:['AI更新迭代','追踪全球 AI 公司、模型、产品和开源项目的重要变化。'],
  courses:['海外AI课程','洞察课程热度、用户评价、真实痛点与下一门课程机会。'],
  news:['AI新闻播报','关注重大节点、研究说明、下一步里程碑与 AI 应用。'],
  library:['我的资料库','集中查看收藏、稍后阅读、笔记与系统生成的机会报告。'],
  settings:['设置','管理通知、数据口径、导出与本机存储。']
};
let data={items:[],trends:[],sourceStatus:[]}, state=loadState(), currentView=(location.hash||'#updates').slice(1), noteItemId=null;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

function loadState(){try{return {...defaultState,...JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}}catch{return {...defaultState}}}
function saveState(){localStorage.setItem(STORE_KEY,JSON.stringify(state))}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function dateText(v){if(!v)return '时间未知';const d=new Date(v);return Number.isNaN(d.getTime())?'时间未知':new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)}
function relative(v){if(!v)return '尚未同步';const mins=Math.max(0,Math.round((Date.now()-new Date(v))/60000));if(mins<60)return `${mins}分钟前`;if(mins<1440)return `${Math.floor(mins/60)}小时前`;return `${Math.floor(mins/1440)}天前`}
function toast(msg){const n=$('#toast');n.textContent=msg;n.classList.add('show');setTimeout(()=>n.classList.remove('show'),1800)}
function unique(arr){return [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'zh-CN'))}
function titleFor(i){return i.titleZh||i.title||'未命名资讯'}
function matchesView(i){if(currentView==='updates')return i.section==='updates';if(currentView==='courses')return i.section==='courses';if(currentView==='news')return i.section==='news';if(currentView==='library')return state.bookmarks.includes(i.id)||state.later.includes(i.id)||state.notes[i.id];return false}

function render(){
  const [title,desc]=views[currentView]||views.updates; $('#pageTitle').textContent=title;$('#pageDescription').textContent=desc;
  $$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));
  const settings=currentView==='settings';$('#dashboard').classList.toggle('hidden',settings);$('#settingsPanel').classList.toggle('hidden',!settings);
  if(settings){renderSettings();return}
  updateOptions();renderStats();renderCards();renderTrend();
}
function filteredItems(){
  const q=$('#search').value.trim().toLowerCase(),topic=$('#topicFilter').value,source=$('#sourceFilter').value,time=$('#timeFilter').value,cat=$('#categoryFilter').value,status=$('#statusFilter').value,now=Date.now();
  let xs=data.items.filter(matchesView).filter(i=>!q||[titleFor(i),i.title,i.summaryZh,i.summaryEn,i.source,...(i.tags||[])].join(' ').toLowerCase().includes(q)).filter(i=>!topic||(i.tags||[]).includes(topic)).filter(i=>!source||i.source===source).filter(i=>!cat||i.category===cat||i.format===cat||i.audience===cat).filter(i=>!status||(status==='unread'?!state.read.includes(i.id):i.status===status));
  if(time!=='all'){const ms={"24h":864e5,"7d":6048e5,"30d":2592e6}[time];xs=xs.filter(i=>now-new Date(i.publishedAt)<=ms)}
  const sort=$('#sortFilter').value;xs.sort((a,b)=>sort==='heat'?(b.heat||0)-(a.heat||0):sort==='importance'?(b.importance||0)-(a.importance||0):new Date(b.publishedAt)-new Date(a.publishedAt));return xs;
}
function updateOptions(){
  const base=data.items.filter(matchesView);fill('#topicFilter',unique(base.flatMap(i=>i.tags||[])),'全部主题');fill('#sourceFilter',unique(base.map(i=>i.source)),'全部来源');
  const cats=currentView==='courses'?['录播课','直播课','零基础个人','职场办公人群','内容创作者','企业管理者']:unique(base.map(i=>i.category));fill('#categoryFilter',cats,'全部分类');
}
function fill(sel,values,first){const el=$(sel),old=el.value;el.innerHTML=`<option value="">${first}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');el.value=values.includes(old)?old:''}
function renderStats(){
  const xs=data.items.filter(matchesView),confirmed=xs.filter(i=>i.status==='confirmed').length,unread=xs.filter(i=>!state.read.includes(i.id)).length,major=xs.filter(i=>(i.importance||0)>=4).length;
  let blocks=currentView==='courses'?
    [['课程与讨论',xs.length,'近30天公开样本'],['平均热度',xs.length?Math.round(xs.reduce((a,i)=>a+(i.heat||0),0)/xs.length):0,'综合指标'],['录播 / 直播',`${xs.filter(i=>i.format==='录播课').length} / ${xs.filter(i=>i.format==='直播课').length}`,'严格分类口径'],['机会报告',reportItems().length,'可随时导出']]:
    [[currentView==='library'?'资料总数':'近30天内容',xs.length,currentView==='library'?'本机个人数据':titleForSection()],['已确认',confirmed,'官方或多源佐证'],['重大情报',major,'重要度4–5'],['未读',unread,'等待查看']];
  $('#stats').innerHTML=blocks.map(x=>`<div class="stat"><small>${x[0]}</small><strong>${x[1]}</strong><em>${x[2]}</em></div>`).join('')
}
function titleForSection(){return currentView==='news'?'AI新闻播报':'AI更新迭代'}
function renderCards(){const xs=filteredItems();$('#cards').innerHTML=xs.length?xs.map(cardHtml).join(''):`<div class="empty"><strong>当前没有符合条件的内容</strong><p>${data.generatedAt?'可以调整筛选条件，或等待下一次自动更新。':'网站已就绪，首次自动抓取完成后会显示真实公开数据。'}</p></div>`;bindCardActions()}
function cardHtml(i){const read=state.read.includes(i.id),saved=state.bookmarks.includes(i.id),later=state.later.includes(i.id),noted=!!state.notes[i.id];return `<article class="card" data-id="${esc(i.id)}"><div class="heat" style="--heat:${Math.min(100,i.heat||0)}"><span>${i.heat||0}<small>热度</small></span></div><div><div class="meta"><span class="dot">●</span><span>${esc(i.source||'未知来源')}</span><span>·</span><span>${dateText(i.publishedAt)}</span><span class="badge ${i.status==='confirmed'?'confirmed':'pending'}">${i.status==='confirmed'?'已确认':'待验证'}</span>${i.format?`<span class="badge format">${esc(i.format)}</span>`:''}<span class="stars">${'★'.repeat(Math.max(1,Math.min(5,i.importance||1)))}</span></div><h2><button data-open>${esc(titleFor(i))}</button></h2>${i.titleZh&&i.title&&i.titleZh!==i.title?`<p class="original">${esc(i.title)}</p>`:''}<p class="summary">${esc(i.summaryZh||i.summaryEn||'等待生成摘要。')}</p><div class="tags">${(i.tags||[]).slice(0,6).map(t=>`<span class="tag"># ${esc(t)}</span>`).join('')}</div></div><div class="actions"><button class="icon-btn ${saved?'active':''}" data-action="bookmark" title="收藏">◇</button><button class="icon-btn ${read?'active':''}" data-action="read" title="${read?'标为未读':'标记已读'}">✓</button><button class="icon-btn ${later?'active':''}" data-action="later" title="稍后阅读">◷</button><button class="icon-btn ${noted?'active':''}" data-action="note" title="添加笔记">✎</button></div></article>`}
function bindCardActions(){$$('.card').forEach(card=>{const id=card.dataset.id;card.querySelector('[data-open]').onclick=()=>openDetail(id);card.querySelectorAll('[data-action]').forEach(b=>b.onclick=e=>{e.stopPropagation();handleAction(id,b.dataset.action)})})}
function toggle(list,id){const idx=list.indexOf(id);idx<0?list.push(id):list.splice(idx,1)}
function handleAction(id,action){if(action==='bookmark')toggle(state.bookmarks,id);if(action==='read')toggle(state.read,id);if(action==='later')toggle(state.later,id);if(action==='note')return openNote(id);saveState();render();toast({bookmark:'收藏状态已更新',read:'阅读状态已更新',later:'稍后阅读已更新'}[action])}
function openNote(id){noteItemId=id;const i=data.items.find(x=>x.id===id);$('#noteTitle').textContent=titleFor(i||{});$('#noteText').value=state.notes[id]||'';$('#noteDialog').showModal()}
function openDetail(id){const i=data.items.find(x=>x.id===id);if(!i)return;if(!state.read.includes(id)){state.read.push(id);saveState()}const pains=(i.painPoints||[]).map(x=>`<li>${esc(x)}</li>`).join(''),reviews=(i.reviewInsights||[]).map(x=>`<li>${esc(x)}</li>`).join('');$('#detailContent').innerHTML=`<div class="detail-head"><div class="meta"><span>${esc(i.source)}</span><span>·</span><span>${dateText(i.publishedAt)}</span><span class="badge ${i.status==='confirmed'?'confirmed':'pending'}">${i.status==='confirmed'?'已确认':'待验证'}</span></div><h2>${esc(titleFor(i))}</h2>${i.titleZh&&i.title?`<p class="original">${esc(i.title)}</p>`:''}</div><section class="detail-section"><h3>中文摘要</h3><p>${esc(i.summaryZh||'暂无中文摘要')}</p></section><section class="detail-section"><h3>English summary</h3><p>${esc(i.summaryEn||'No English summary yet.')}</p></section>${pains?`<section class="detail-section"><h3>用户痛点</h3><ul>${pains}</ul></section>`:''}${reviews?`<section class="detail-section"><h3>用户评价与信号</h3><ul>${reviews}</ul></section>`:''}<section class="detail-section"><h3>可信度说明</h3><p>${esc(i.confirmationReason||'当前只找到一个公开来源，因此标记为待验证。')}</p></section><a class="source-link" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">打开英文原文 ↗</a>`;$('#detailDialog').showModal()}
function renderTrend(){const e=$('#trendBanner'),trends=(data.trends||[]).filter(t=>!t.section||t.section===currentView);e.classList.toggle('hidden',!trends.length);if(trends.length)e.innerHTML=`<strong>热度上升：</strong>${trends.map(t=>esc(t.topic)).join('、')}。系统已生成专项观察。`}
function reportItems(){return data.items.filter(i=>i.section==='courses').sort((a,b)=>(b.heat||0)-(a.heat||0)).slice(0,10)}
function reportMarkdown(){const xs=reportItems(),lines=['# 海外 AI 课程机会报告','',`生成时间：${new Date().toLocaleString('zh-CN')}`,'','> 本报告基于公开可访问样本。热度为综合指标，不代表实际销量。',''];xs.forEach((i,n)=>lines.push(`## ${n+1}. ${titleFor(i)}`,'',`- 热度：${i.heat||0}` ,`- 形式：${i.format||'待判断'}`,`- 人群：${i.audience||'待判断'}`,`- 状态：${i.status==='confirmed'?'已确认':'待验证'}`,`- 原文：${i.url}`,'',i.summaryZh||'暂无摘要',''));return lines.join('\n')}
function renderSettings(){$('#settingsPanel').innerHTML=`<h2>设置与导出</h2><div class="setting-row"><label>数据自动更新</label><p>GitHub Actions 每2小时从公开来源抓取一次。数据保留30天；网页打开时读取最新数据文件。</p></div><div class="setting-row"><label>可信度规则</label><p>官方来源，或至少两家独立可信媒体佐证，标记“已确认”；其余标记“待验证”。</p></div><div class="setting-row"><label>DeepSeek 自动分析</label><p>API Key只保存在 GitHub 仓库的加密 Secrets 中，不进入网页或代码。未配置时使用规则摘要，不影响基础数据更新。</p></div><div class="setting-row"><label>个人资料</label><p>收藏、已读、稍后阅读和笔记只保存在当前浏览器，不上传，也不会跨设备同步。</p></div><div class="setting-row"><label>课程机会报告</label><div class="report-actions"><button data-export="md">导出中文 Markdown</button><button data-export="csv">导出中文 CSV</button><button data-export="pdf">打印 / 保存为 PDF</button></div><p>周期口径：上周五22:00至本周五22:00。第二阶段再接入163邮箱与独立 Obsidian 库。</p></div><div class="setting-row"><label><input id="notifyToggle" type="checkbox" ${state.notification?'checked':''}> 允许重大新闻浏览器通知</label><p>仅网页打开时生效；21:00–次日09:00不弹窗。</p></div><div class="setting-row"><button id="clearLocal">清空本机个人数据</button></div>`;$('#notifyToggle').onchange=async e=>{if(e.target.checked&&Notification.permission!=='granted'){const p=await Notification.requestPermission();e.target.checked=p==='granted'}state.notification=e.target.checked;saveState()};$$('[data-export]').forEach(b=>b.onclick=()=>exportReport(b.dataset.export));$('#clearLocal').onclick=()=>{if(confirm('确定清空收藏、已读、稍后阅读和笔记吗？')){state={...defaultState};saveState();render();toast('本机个人数据已清空')}}}
function download(name,type,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportReport(type){const stamp=new Date().toISOString().slice(0,10);if(type==='md')download(`AI课程机会报告-${stamp}.md`,'text/markdown',reportMarkdown());if(type==='csv'){const rows=[['标题','热度','形式','目标人群','状态','原文链接'],...reportItems().map(i=>[titleFor(i),i.heat||0,i.format||'',i.audience||'',i.status==='confirmed'?'已确认':'待验证',i.url])];download(`AI课程机会报告-${stamp}.csv`,'text/csv',rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'))}if(type==='pdf')window.print()}

async function init(){
  try{const res=await fetch(DATA_URL,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);data=await res.json();if(!Array.isArray(data.items))data.items=[];$('#syncText').textContent=data.generatedAt?'数据已同步':'等待首次抓取';$('#syncTime').textContent=data.generatedAt?`${dateText(data.generatedAt)} · 每2小时`:'GitHub Actions 启用后自动抓取';$('#syncDot').style.background=data.generatedAt?'#31b990':'#d7a136';$('#budgetUsed').textContent=`¥${Number(data.aiCostCny||0).toFixed(2)} / ¥10`;$('#budgetBar').style.width=`${Math.min(100,Number(data.aiCostCny||0)*10)}%`}catch(e){$('#syncText').textContent='数据读取失败';$('#syncTime').textContent=e.message;data={items:[],trends:[],sourceStatus:[]}}
  render();maybeNotify();
}
function maybeNotify(){if(!state.notification||Notification.permission!=='granted')return;const h=new Date().getHours();if(h>=21||h<9)return;const last=localStorage.getItem('global-ai-radar-notified')||'';const major=data.items.find(i=>(i.importance||0)>=5&&i.publishedAt>last);if(major){new Notification('AI 全球雷达重大情报',{body:titleFor(major)});localStorage.setItem('global-ai-radar-notified',major.publishedAt)}}

$('#nav').onclick=e=>{const b=e.target.closest('[data-view]');if(!b)return;currentView=b.dataset.view;location.hash=currentView;render()};window.addEventListener('hashchange',()=>{currentView=(location.hash||'#updates').slice(1);render()});$$('.filters input,.filters select').forEach(e=>e.addEventListener(e.tagName==='INPUT'?'input':'change',()=>{renderStats();renderCards()}));$('#refreshBtn').onclick=()=>location.reload();$('#notifyBtn').onclick=()=>{currentView='settings';location.hash='settings';render()};$$('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());$('#saveNote').onclick=()=>{const v=$('#noteText').value.trim();if(v)state.notes[noteItemId]=v;else delete state.notes[noteItemId];saveState();$('#noteDialog').close();render();toast('笔记已保存')};
init();
