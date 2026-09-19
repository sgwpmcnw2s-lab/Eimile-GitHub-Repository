import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const OUT = new URL('../docs/data/feed.json', import.meta.url);
const RETENTION_MS = 30*24*60*60*1000;
const now = new Date();
const monthAgo = new Date(Date.now()-30*24*60*60*1000).toISOString().slice(0,10);
const officialHosts = new Set(['openai.com','www.anthropic.com','blog.google','deepmind.google','blogs.microsoft.com','blogs.nvidia.com','ai.meta.com','github.blog']);
const sources = [
  {name:'OpenAI News',url:'https://openai.com/news/rss.xml',section:'updates',official:true},
  {name:'Google AI',url:'https://blog.google/technology/ai/rss/',section:'updates',official:true},
  {name:'Google DeepMind',url:'https://deepmind.google/blog/rss.xml',section:'updates',official:true},
  {name:'Microsoft AI',url:'https://blogs.microsoft.com/ai/feed/',section:'updates',official:true},
  {name:'NVIDIA Blog',url:'https://blogs.nvidia.com/feed/',section:'updates',official:true},
  {name:'MIT AI News',url:'https://news.mit.edu/rss/topic/artificial-intelligence2',section:'news'},
  {name:'Hacker News · AI',url:'https://hn.algolia.com/api/v1/search_by_date?query=AI&tags=story&hitsPerPage=45',kind:'hn',section:'news'},
  {name:'Hacker News · AI Courses',url:'https://hn.algolia.com/api/v1/search_by_date?query=AI%20course&tags=story&hitsPerPage=30',kind:'hn-course',section:'courses'},
  {name:'Class Central Report',url:'https://www.classcentral.com/report/feed/',section:'courses'},
  {name:'Reddit · Learn Machine Learning',url:'https://www.reddit.com/r/learnmachinelearning/search.json?q=course&restrict_sr=on&sort=new&t=month&limit=50',kind:'reddit-course',section:'courses'},
  {name:'GitHub · AI Courses',url:`https://api.github.com/search/repositories?q=${encodeURIComponent(`AI course created:>${monthAgo}`)}&sort=stars&order=desc&per_page=30`,kind:'github-course',section:'courses'},
  {name:'arXiv · AI',url:'https://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=25',kind:'atom',section:'news'}
];

const clean = s => String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim();
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0,20);
const host = u => {try{return new URL(u).hostname}catch{return ''}};
const canonical = u => {try{const x=new URL(u);['utm_source','utm_medium','utm_campaign','ref','source'].forEach(k=>x.searchParams.delete(k));x.hash='';return x.toString()}catch{return u}};
const has = (s,r) => r.test(String(s||'').toLowerCase());
const courseStrict = s => has(s,/\b(ai|artificial intelligence|chatgpt|llm|machine learning|generative ai)\b/) && has(s,/\b(course|class|curriculum|lesson|tutorial|learn|training)\b/) && !has(s,/\b(webinar|workshop|conference|bootcamp|cohort|meetup|of course|peer review)\b/);
const formatFor = s => has(s,/\b(live|cohort|instructor-led|zoom)\b/)?'直播课':'录播课';
const audienceFor = s => has(s,/creator|content|video|writing/) ? '内容创作者' : has(s,/manager|leader|enterprise|business/) ? '企业管理者' : has(s,/office|productivity|excel|work/) ? '职场办公人群' : '零基础个人';
const tagsFor = s => [...new Set([
  has(s,/agent|agentic/)&&'AI Agent',has(s,/model|llm|gpt|claude|gemini/)&&'模型',has(s,/video|image|audio|multimodal/)&&'多模态',has(s,/open.?source|github/)&&'开源',has(s,/research|paper|study|benchmark/)&&'研究',has(s,/course|learn|training|tutorial/)&&'AI课程',has(s,/office|productivity/)&&'效率工具'
].filter(Boolean))];
const classifySection = (title,desc,preferred) => preferred==='courses' ? (courseStrict(`${title} ${desc}`)?'courses':null) : preferred;

function parseRss(text,source){
  const chunks=[...text.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(x=>x[0]);
  return chunks.map(c=>{
    const tag=n=>clean((c.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`,'i'))||[])[1]);
    const href=(c.match(/<link[^>]+href=["']([^"']+)/i)||[])[1]||tag('link')||tag('guid');
    return rawItem({title:tag('title'),url:href,description:tag('description')||tag('summary')||tag('content'),publishedAt:tag('pubDate')||tag('published')||tag('updated')},source)
  }).filter(Boolean)
}
function parseHn(json,source){return (json.hits||[]).map(h=>rawItem({title:h.title,url:h.url||`https://news.ycombinator.com/item?id=${h.objectID}`,description:`Hacker News discussion with ${h.num_comments||0} comments.`,publishedAt:h.created_at,points:h.points||0,comments:h.num_comments||0},source)).filter(Boolean)}
function parseReddit(json,source){return (json.data?.children||[]).map(({data:h})=>rawItem({title:h.title,url:`https://www.reddit.com${h.permalink}`,description:clean(h.selftext).slice(0,700),publishedAt:new Date(h.created_utc*1000),points:h.score||0,comments:h.num_comments||0},source)).filter(Boolean)}
function parseGitHub(json,source){return (json.items||[]).map(h=>rawItem({title:h.full_name, url:h.html_url, description:h.description||'',publishedAt:h.created_at,points:h.stargazers_count||0,comments:h.open_issues_count||0},source)).filter(Boolean)}
function rawItem(x,source){
  if(!x.title||!x.url)return null;const section=classifySection(x.title,x.description,source.section);if(source.section==='courses'&&section!=='courses')return null;
  const url=canonical(x.url),text=`${x.title} ${x.description}`;let heat=Math.min(100,Math.round((x.points||0)*.55+(x.comments||0)*1.2+12));
  if(source.official)heat=Math.max(heat,58);const importance=Math.max(1,Math.min(5,Math.round(heat/20)||1));
  return {id:hash(url),section,title:x.title,titleZh:'',url,source:source.name,publishedAt:new Date(x.publishedAt||now).toISOString(),summaryZh:'',summaryEn:clean(x.description).slice(0,520),tags:tagsFor(text),category:section==='updates'?'产品更新':section==='news'?'行业新闻':'AI课程',format:section==='courses'?formatFor(text):'',audience:section==='courses'?audienceFor(text):'',heat,importance,status:source.official||officialHosts.has(host(url))?'confirmed':'pending',confirmationReason:source.official?'来自官方发布渠道。':'目前仅发现单一公开来源，尚未达到确认标准。',painPoints:[],reviewInsights:[]}
}
async function fetchSource(source){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);try{const r=await fetch(source.url,{headers:{'user-agent':'GlobalAIRadar/2.0 (+https://github.com/sgwpmcnw2s-lab/Eimile-GitHub-Repository)','accept':'application/rss+xml, application/atom+xml, application/json, text/xml;q=.9, */*;q=.5'},signal:ctrl.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);const text=await r.text();const items=source.kind?.startsWith('hn')?parseHn(JSON.parse(text),source):source.kind?.startsWith('reddit')?parseReddit(JSON.parse(text),source):source.kind?.startsWith('github')?parseGitHub(JSON.parse(text),source):parseRss(text,source);return {source:source.name,ok:true,count:items.length,items}}catch(e){return {source:source.name,ok:false,count:0,error:e.name==='AbortError'?'timeout':e.message,items:[]}}finally{clearTimeout(timer)}}
function fingerprint(i){return clean(i.title).toLowerCase().replace(/\b(the|a|an|ai|new|launches?|announces?)\b/g,'').replace(/[^a-z0-9\u4e00-\u9fff]+/g,' ').trim().split(' ').filter(Boolean).slice(0,7).join(' ')}
function reconcile(items){
  const groups=new Map();for(const i of items){const k=fingerprint(i);if(!k)continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i)}
  for(const xs of groups.values()){const independent=new Set(xs.map(i=>i.source));if(independent.size>=2)for(const i of xs){i.status='confirmed';i.confirmationReason=`同一事件已由 ${[...independent].join('、')} 等独立来源佐证。`}}
}
function fallbackAnalysis(i){
  if(i.analysisProvider==='deepseek')return i;i.titleZh=i.title;i.summaryZh=i.summaryEn?`尚未配置 DeepSeek 中文分析。英文原文摘录：${i.summaryEn}`:'已收录该公开信号，建议打开原文核查详情。';i.analysisProvider='rules';
  if(i.section==='courses'){i.painPoints=['学习者需要更清晰的实践路径与可验证成果'];i.reviewInsights=['当前公开互动样本有限，不能据此推断实际报名量或销量']}
  return i
}
async function deepseekAnalyze(items){
  const key=process.env.DEEPSEEK_API_KEY;if(!key)return {items:items.map(fallbackAnalysis),cost:0};
  const targets=items.filter(i=>i.analysisProvider!=='deepseek').sort((a,b)=>b.importance-a.importance).slice(0,6);if(!targets.length)return {items,cost:0};
  const prompt=`你是AI情报编辑。只根据输入，不补造事实。为每项返回JSON数组，字段id,titleZh,summaryZh,summaryEn,painPoints,reviewInsights,tags。中文摘要80-140字；英文摘要1-2句；课程项才分析痛点和评论信号，样本不足要明说。输入：${JSON.stringify(targets.map(({id,title,summaryEn,section,source,url})=>({id,title,summaryEn,section,source,url})))}`;
  try{const r=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify({model:'deepseek-chat',response_format:{type:'json_object'},messages:[{role:'system',content:'严格输出 {"items": [...]} 的JSON，不使用Markdown。'},{role:'user',content:prompt}],temperature:.2,max_tokens:3000})});if(!r.ok)throw new Error(`DeepSeek HTTP ${r.status}`);const j=await r.json(),parsed=JSON.parse(j.choices?.[0]?.message?.content||'{"items":[]}'),byId=new Map((parsed.items||[]).map(x=>[x.id,x]));for(const i of items){const a=byId.get(i.id);if(a)Object.assign(i,a,{analysisProvider:'deepseek'})}const tokens=(j.usage?.prompt_tokens||0)+(j.usage?.completion_tokens||0);return {items:items.map(fallbackAnalysis),cost:Number((tokens/1e6*2).toFixed(4))}}catch(e){console.error('DeepSeek fallback:',e.message);return {items:items.map(fallbackAnalysis),cost:0}}
}
function trends(items){const recent=items.filter(i=>Date.now()-new Date(i.publishedAt)<7*864e5),counts={};for(const i of recent)for(const t of i.tags||[])counts[t]=(counts[t]||0)+1;return Object.entries(counts).filter(([,n])=>n>=4).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([topic,count])=>({topic,count,section:recent.find(i=>(i.tags||[]).includes(topic))?.section||'news'}))}

let previous={items:[],aiCostCny:0};try{previous=JSON.parse(await fs.readFile(OUT,'utf8'))}catch{}
const results=await Promise.all(sources.map(fetchSource));
const previousById=new Map((previous.items||[]).map(i=>[i.id,i]));
let items=results.flatMap(r=>r.items).filter(i=>Date.now()-new Date(i.publishedAt)<=RETENTION_MS).map(i=>{const p=previousById.get(i.id);return p?.analysisProvider==='deepseek'?{...i,titleZh:p.titleZh,summaryZh:p.summaryZh,summaryEn:p.summaryEn,painPoints:p.painPoints,reviewInsights:p.reviewInsights,tags:p.tags,analysisProvider:'deepseek'}:i});
for(const old of previous.items||[])if(Date.now()-new Date(old.publishedAt)<=RETENTION_MS&&(old.section!=='courses'||courseStrict(`${old.title} ${old.summaryEn||''}`))&&!items.some(i=>i.id===old.id))items.push(old);
items=[...new Map(items.map(i=>[i.id,i])).values()];reconcile(items);
const analyzed=await deepseekAnalyze(items);items=analyzed.items.sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));
const payload={generatedAt:now.toISOString(),aiCostCny:Number((Number(previous.aiCostCny||0)+analyzed.cost).toFixed(4)),sourceStatus:results.map(({source,ok,count,error})=>({source,ok,count,error})),trends:trends(items),items};
await fs.mkdir(new URL('../docs/data/',import.meta.url),{recursive:true});await fs.writeFile(OUT,JSON.stringify(payload,null,2)+'\n');
console.log(`Wrote ${items.length} items from ${results.filter(r=>r.ok).length}/${results.length} sources.`);
