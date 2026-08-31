export const APP_NAME = "AI 全球情报雷达";
export const STORAGE_VERSION = 1;
export const RETENTION_DAYS = 30;
export const SYNC_INTERVAL_MINUTES = 120;
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_MODEL = "deepseek-v4-flash";

export const NAV_ITEMS = [
  { id: "updates", label: "AI更新迭代", icon: "spark" },
  { id: "courses", label: "海外AI课程", icon: "course" },
  { id: "news", label: "AI新闻播报", icon: "news" },
  { id: "library", label: "我的资料库", icon: "bookmark" },
  { id: "settings", label: "设置", icon: "settings" }
];

export const DEFAULT_WATCHLIST = [
  "OpenAI", "Anthropic", "Google DeepMind", "Gemini", "Microsoft Copilot",
  "Meta AI", "Llama", "DeepSeek", "Mistral", "NVIDIA", "Hugging Face",
  "Claude", "ChatGPT", "Sora", "Midjourney", "Runway", "Perplexity",
  "LangChain", "LlamaIndex", "CrewAI", "AutoGen", "ComfyUI"
];

export const SOURCE_GROUPS = {
  rss: [
    { id: "openai", name: "OpenAI News", url: "https://openai.com/news/rss.xml", section: "updates", official: true, reliability: 5 },
    { id: "google-ai", name: "Google AI", url: "https://blog.google/technology/ai/rss/", section: "updates", official: true, reliability: 5 },
    { id: "deepmind", name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", section: "updates", official: true, reliability: 5 },
    { id: "microsoft-ai", name: "Microsoft AI", url: "https://blogs.microsoft.com/ai/feed/", section: "updates", official: true, reliability: 5 },
    { id: "nvidia", name: "NVIDIA Blog", url: "https://blogs.nvidia.com/feed/", section: "updates", official: true, reliability: 5 },
    { id: "openai-news", name: "OpenAI Official", url: "https://openai.com/news/rss.xml", section: "news", official: true, reliability: 5 },
    { id: "deepmind-news", name: "Google DeepMind Official", url: "https://deepmind.google/blog/rss.xml", section: "news", official: true, reliability: 5 },
    { id: "nvidia-news", name: "NVIDIA Official", url: "https://blogs.nvidia.com/feed/", section: "news", official: true, reliability: 5 },
    { id: "mit-ai", name: "MIT News · AI", url: "https://news.mit.edu/rss/topic/artificial-intelligence2", section: "news", official: false, reliability: 5 },
    { id: "class-central", name: "Class Central", url: "https://www.classcentral.com/report/feed/", section: "courses", official: false, reliability: 4 }
  ],
  github: [
    { id: "github-ai", name: "GitHub AI Trending", query: "topic:artificial-intelligence stars:>500", section: "updates" },
    { id: "github-agents", name: "GitHub Agent Trending", query: "topic:ai-agents stars:>100", section: "updates" },
    { id: "github-llm", name: "GitHub LLM Trending", query: "topic:large-language-models stars:>500", section: "updates" }
  ],
  hackerNews: [
    { id: "hn-ai", name: "Hacker News", query: "artificial intelligence", section: "news" },
    { id: "hn-course", name: "Hacker News · AI Courses", query: "AI course", section: "courses" }
  ],
  reddit: [
    { id: "reddit-course", name: "Reddit · AI Courses", query: "AI course", section: "courses" }
  ],
  arxiv: [
    { id: "arxiv-ai", name: "arXiv · Artificial Intelligence", query: "cat:cs.AI", section: "news" },
    { id: "arxiv-llm", name: "arXiv · Computation and Language", query: "cat:cs.CL", section: "news" }
  ]
};

export const DEFAULT_SETTINGS = {
  apiKey: "",
  model: DEEPSEEK_MODEL,
  monthlyBudgetCny: 10,
  notifyAtPercent: 80,
  syncIntervalMinutes: SYNC_INTERVAL_MINUTES,
  retentionDays: RETENTION_DAYS,
  quietStartHour: 21,
  quietEndHour: 9,
  timezone: "Asia/Shanghai",
  autoAnalyzeHighValue: true,
  notifyConfirmedOnly: true,
  watchlist: DEFAULT_WATCHLIST,
  sourceEnabled: {},
  recipientEmail: ""
};

export const SECTION_LABELS = {
  updates: "AI更新迭代",
  courses: "海外AI课程",
  news: "AI新闻播报"
};

export const COURSE_AUDIENCES = ["零基础个人", "职场办公人群", "内容创作者", "企业管理者"];
