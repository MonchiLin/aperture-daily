# Aperture Daily

简要索引：AGENT.md 只保留大纲，细节在代码与注释中。

## 快速开始 (Split Stack)

### 1. 后端 Backend (Elysia + SQLite)
需要安装 Bun 运行时。
```bash
# 安装后端依赖
cd server && bun install

# 启动后端服务 (localhost:3000)
npm run dev:server
```

### 2. 前端 Frontend (Astro)
```bash
# 启动前端 (localhost:4321)
npm run dev
```

### 3. 本地数据库 Database
```bash
# 推送 Schema 到本地 SQLite
npm run db:push

# 打开 Drizzle Studio 可视化管理
npm run db:studio
```

## 自动化部署方案 (CI/CD)

本项目采用 **前后端分离** 部署策略：

### 1. 前端 (Cloudflare Pages)
**零成本、全球CDN加速、Git 自动集成**

1.  进入 [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
2.  选择你的仓库 (`aperture-daily`).
3.  **构建配置 (Build settings)**:
    *   **Framework preset**: `Astro`
    *   **Build command**: `npm run build`
    *   **Output directory**: `dist`
4.  **环境变量 (Environment variables)**:
    *   添加 `Public` 变量 (Cloudflare 会自动暴露给前端):
        *   `PUBLIC_LLM_API_KEY`: (如果前端直接调用LLM，现已迁移至后端，可不填)
        *   注意：现在的架构中，前端主要通过 `http://localhost:3000` 连接后端。生产环境需将前端代码里的 API 地址改为您的 VPS 域名/IP。

### 2. 后端 (Docker + GitHub Actions)
**自动化构建 Docker 镜像并发布到 GHCR，VPS 自动更新**

#### A. 配置 GitHub Actions
项目已包含 `.github/workflows/docker-publish.yml`，它会：
1.  监听 `main` 分支的推送。
2.  进入 `server/` 目录构建 Docker 镜像。
3.  发布到 `ghcr.io/<your-username>/aperture-daily:latest`。

**前置要求**：
*   在 GitHub 仓库 > Settings > Actions > General > **Workflow permissions** 中开启 `Read and write permissions`。

#### B. VPS 部署 (使用 Docker Compose)
在您的 VPS 上创建 `docker-compose.yml`:

```yaml
version: '3.8'
services:
  backend:
    image: ghcr.io/<your-username>/aperture-daily:latest  # 替换为您的 GitHub 用户名
    container_name: aperture-daily-backend
    restart: always
    ports:
      - "3000:3000"
    environment:
      - SHANBAY_COOKIE=your_cookie_here
      - ADMIN_KEY=your_admin_secret_key
      - LLM_API_KEY=your_key
      - LLM_BASE_URL=https://api.openai.com/v1
    volumes:
      - ./data:/app/local.db  # 持久化数据库
    
  # 可选：自动更新容器 (Watchtower)
  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 300 aperture-daily-backend
```

**启动服务**：
```bash
docker-compose up -d
```

后端服务将在端口 3000 运行。前端页面 (Cloudflare Pages) 需要配置反向代理或直接请求该 IP (注意 CORS)。


## AGENT 索引
- 目标与原则：`AGENT.md`
- 定时窗口与流程：`server/index.ts` (Worker Loop)
- 抓词与入库：`server/src/services/dailyWords.ts`
- 任务编排与队列：`server/src/services/tasks/TaskQueue.ts`
- LLM 多阶段与结构化校验：`server/src/services/llm/openaiCompatible.ts`
- Prompt 规范：`server/src/services/llm/openaiPrompts.ts`
- G1/S1 Prompt: `src/lib/prompts/dailyNews.ts` (Frontend/Legacy)
- SRS 规则：`src/lib/srs.ts`
- 鉴权边界：`src/lib/admin.ts` (Frontend Auth)
- DB 结构：`db/schema.ts`
- 高亮与 DOM 稳定性：`src/components/ArticleTabs.tsx`

