# Aperture Daily Server

Elysia + Bun 后端服务，连接 Cloudflare D1 数据库。

## 快速开始

```bash
# 安装依赖
bun install

# 启动开发服务器 (使用本地 local.db)
bun run dev

# 生产启动
bun run start
```

## 数据库命令

| 命令 | 说明 |
|------|------|
| `bun run db:pull` | 从远程 D1 拉取数据到 local.db |
| `bun run db:push` | 推送 local.db 到远程 D1 |
| `bun run db:export` | 导出远程 D1 到 backup.sql |
| `bun run db:migrate` | 运行 Drizzle 本地迁移 |
| `bun run db:generate` | 生成 Drizzle 迁移文件 |
| `bun run db:studio` | 打开 Drizzle Studio |
| `bun run d1:migrate:remote` | 应用迁移到远程 D1 |

## 开发工作流

### 本地开发
1. 使用 `local.db` 作为本地 SQLite 数据库
2. 不配置 `CLOUDFLARE_*` 环境变量时自动使用本地数据库
3. 修改 schema 后运行 `bun run db:migrate`

### 同步远程数据
```bash
# 首次或需要最新数据时
bun run db:pull
```

### 部署到生产
1. 在 HF Space 配置环境变量：
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_DATABASE_ID`
   - `CLOUDFLARE_API_TOKEN`
   - `ADMIN_KEY`
2. 推送代码触发自动部署

## 环境变量

参考 `.env.example` 配置必要的环境变量。

## 技术栈

- **Runtime**: Bun
- **Framework**: Elysia
- **Database**: Cloudflare D1 (生产) / SQLite (本地)
- **ORM**: Drizzle
