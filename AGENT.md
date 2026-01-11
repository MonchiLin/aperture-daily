# UpWord (formerly Aperture Daily / Dancix)

## 目标
基于 Astro (Frontend) + ElysiaJS (Backend) 的每日单词阅读平台。
- **Frontend**: 纯静态/SSR UI，部署于 Cloudflare Pages。设计追求纸张质感与极简美学。
- **Backend**: 部署于 Docker/VPS，负责长运行任务 (LLM 生成) 与 SQLite (D1) 存储。
核心流程：抓词 -> 任务队列 (Elysia) -> 生成 Easy/Medium/Hard 三档文章 -> 入库 -> 前端展示。

## 不可妥协
- **错误显式化**：不做静默降级，错误必须直接可见。
- **JSON 严格校验**：LLM 输出必须符合 Schema，失败即终止任务。
- **三档必选**：每次生成必须同时覆盖三个难度等级。
- **时区一致**：业务与调度严格遵循 Asia/Shanghai。
- **配置严谨**：Admin Key 精准匹配，Secret 绝不出日志。

## 关键风险
- 扇贝 API 稳定性与其 Cookie 的风控。
- LLM 接口对联网搜索 (web_search) 的支持质量。

## 关键索引
- **入口 & 调度**：`server/index.ts` (App) / `server/workers/cronScheduler.ts` (Cron)
- **任务系统**：`server/src/services/tasks/TaskQueue.ts`
- **内容抓取**：`server/src/services/dailyWords.ts`
- **LLM 生成流水线**：`server/src/services/llm/geminiStages3.ts` (基于 3 阶段生成逻辑)
- **Prompt 规范**：`server/src/services/llm/prompts3stage.ts`
- **DB 模型**：`server/db/schema.ts` (Drizzle)
- **前端核心逻辑**：`src/pages/article/[id].astro` (阅读器) / `src/components/ArticleTabs.tsx` (交互)
- **辅助函数**：`server/src/utils/helpers.ts`

