# UpWord

简要索引：AGENT.md 只保留大纲，细节在代码与注释中。

## 架构概览 (Four Pillars)

文章详情页围绕 **四大功能支柱** 组织代码：

| 支柱 | 目录 | 功能 |
|------|------|------|
| **Reading** | `src/lib/features/reading/` | 难度切换 (`levelSwitcher.ts`)、阅读追踪 (`readTracker.ts`) |
| **Syntax** | `src/lib/features/syntax/` | 语法分析控制器 (`SyntaxController.ts`)、可视化 (`SyntaxVisualizer.ts`)、语法定义 (`SyntaxDefinitions.ts`)、注解引擎 (`AnnotationEngine.ts`) |
| **Echoes** | `src/lib/features/echoes/` | 历史回响交互 (`hoverController.ts`) - 悬停目标词汇时显示跨文章语境 |
| **Audio** | `src/lib/features/audio/` | TTS 预加载 (`audioPreloader.ts`)、播放器 Hook (`useAudioPlayer.ts`)、Edge TTS 客户端 (`edge-client.ts`) |

### 命名约定
- **API**: `/api/echoes/batch` (原 `/api/context/batch`)
- **数据库**: `syntax_json` (原 `structure_json`)
- **前端类型**: `syntax` (原 `structure`)、`echoes` (原 `memories`)

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
2.  选择你的仓库 (`upword`).
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
3.  发布到 `ghcr.io/<your-username>/upword:latest`。

**前置要求**：
*   在 GitHub 仓库 > Settings > Actions > General > **Workflow permissions** 中开启 `Read and write permissions`。

#### B. VPS 部署 (使用 Docker Compose)
在您的 VPS 上创建 `docker-compose.yml`:

```yaml
version: '3.8'
services:
  backend:
    image: ghcr.io/<your-username>/upword:latest  # 替换为您的 GitHub 用户名
    container_name: upword-backend
    restart: always
    ports:
      - "3000:3000"
    environment:
      - D1_DATABASE_NAME=UpWordData
      # ... 其他环境变量 ...
      # 必须包含 DATABASE_URL 如果你使用本地SQLite
    volumes:
      - ./data:/app/data

  # 可选：如果需要一个单独的 DB sync 任务
  # db-sync:
  #   image: ghcr.io/<your-username>/upword:latest
  #   command: bun run db:push # 或者其他数据库同步命令
    
  # 可选：自动更新容器 (Watchtower)
  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 300 upword-backend
```

**启动服务**：
```bash
docker-compose up -d
```

后端服务将在端口 3000 运行。前端页面 (Cloudflare Pages) 需要配置反向代理或直接请求该 IP (注意 CORS)。

## HF Space 保活 (Keep-Alive)

Hugging Face 免费 Space 在 48 小时无访问后会休眠。使用 [UptimeRobot](https://uptimerobot.com) 定期 ping 可防止休眠：

1.  注册 UptimeRobot (免费)。
2.  添加新 Monitor，类型选 **HTTP(s)**。
3.  URL 填：`https://<your-space>.hf.space/api/health`
4.  间隔设 5-60 分钟均可。

## Todo

[x] IPA 音标

[x] 文章质量提升

[ ] 移动端支持

[x] 播放器优化(How to speak)

[x] SSR 作为新闻来源

[ ] 播放器背景音乐

[ ] MCP

[ ] 报纸风首页

[ ] 更好的详情页(增加小节名之类的)

[ ] 随机阅读/复读

[ ] 鼠标跟踪
