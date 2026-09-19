# AI 全球情报雷达

聚合全球 AI 更新、海外 AI 课程信号与重大 AI 新闻。当前推荐使用普通独立网页，旧版 Chrome 扩展源码仍保留。

## 独立网页版本（推荐）

- 通过 GitHub Pages 直接访问，不需要安装扩展
- AI更新迭代、海外AI课程、AI新闻播报、我的资料库、设置
- 中英文摘要与英文原文链接
- 搜索以及主题、来源、时间、分类、状态筛选
- 收藏、已读、稍后阅读和笔记（仅保存在当前浏览器）
- 课程热度、录播/直播、目标人群、用户痛点与机会报告
- 中文 Markdown、CSV、打印/PDF 导出
- GitHub Actions 每2小时抓取公开数据，保留30天
- 可选 DeepSeek 自动分析；API Key只使用 GitHub加密 Secret

网页地址：<https://sgwpmcnw2s-lab.github.io/Eimile-GitHub-Repository/>

### 首次上线

1. 将仓库设为 Public。
2. 打开 `Settings → Pages`，将 Source 设为 `GitHub Actions`。
3. 打开 `Actions → Refresh public AI data → Run workflow`，执行首次自动抓取。

### 可选：配置 DeepSeek

在 `Settings → Secrets and variables → Actions` 新建仓库 Secret：

- Name：`DEEPSEEK_API_KEY`
- Secret：你的 DeepSeek API Key

未配置时公开数据仍会更新，只使用规则摘要。不要把密钥写入代码、网页或聊天截图。

## 数据与判断口径

- 只读取公开可访问来源，不绕过登录、付费墙或访问限制。
- “已确认”表示来自官方来源，或同一事件至少有两个独立可信来源。
- “待验证”表示暂未达到上述标准，不代表消息一定错误。
- 课程热度综合公开互动、时效和来源质量，不等于报名量或销量。
- 用户痛点与课程机会是基于公开样本的分析判断；样本不足时会明确标注。
- 个别来源失效不会阻塞整体更新，失败状态会记录在数据文件中。

## 隐私

- 独立网页的收藏、已读、稍后阅读和笔记只保存在当前浏览器。
- DeepSeek Key保存在 GitHub Actions Secrets，不进入前端文件。
- 原文仅在启用 DeepSeek 分析时用于生成摘要。

## 开发检查

```bash
npm test
npm run check
npm run refresh
```

网页位于 `docs/`；数据更新脚本位于 `scripts/refresh-data.mjs`；自动任务位于 `.github/workflows/`。

## Chrome 扩展（旧版）

扩展仍可通过 `manifest.json` 加载，但不再作为主要使用方式。独立网页解决了浏览器跨域、后台任务易卡住和扩展重载等问题。

## 第二阶段

- 新建独立 Obsidian 库“AI全球情报库”并同步收藏、笔记与报告
- 通过163邮箱发送周五22:00周报
