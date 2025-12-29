# AGENT.md

## 目标
## 目标
基于 Astro (Frontend) + ElysiaJS (Backend) 的每日单词阅读站。
- **Frontend**: 纯静态/SSR UI，部署于 Cloudflare Pages。
- **Backend**: 长运行任务 (LLM 生成) 与 SQLite 数据库，部署于 Docker/VPS。
核心流程：抓词 -> 队列任务 (Elysia) -> 生成三档文章 -> 入库 -> 前端展示。

## 不可妥协
- 快速失败：不做静默降级与自动重试，错误显式可见。
- LLM 输出必须严格 JSON 校验；失败即终止。
- 每次生成必须同时产出 Easy/Medium/Hard 三档。
- 业务日期与调度以 Asia/Shanghai 为准。
- Admin Key 精确匹配（不 trim）。
- 配置按原值读取；非法配置直接失败。
- Secret 不出日志。

## 关键风险
- 扇贝 Cookie 可能过期或被风控。
- OpenAI-compatible /v1 Responses 需支持 web_search；不支持则失败。

## 细节索引
- 定时窗口与流程：`workers/cron/index.ts`
- 抓词与入库：`src/lib/words/dailyWords.ts`、`src/lib/shanbay.ts`
- 任务编排与队列：`src/lib/tasks/articleGeneration.ts`、`src/lib/tasks/generationQueue.ts`
- LLM 多阶段与结构化校验：`src/lib/llm/openaiCompatible.ts`、`src/lib/schemas/dailyNews.ts`
- Prompt 规范：`src/lib/prompts/dailyNews.ts`、`prompts/daily_news.md`
- SRS 规则：`src/lib/srs.ts`
- 鉴权边界：`src/lib/admin.ts`、`src/pages/api/admin/*`
- DB 结构：`db/schema.ts`
- 高亮与 DOM 稳定性：`src/components/ArticleTabs.tsx`
