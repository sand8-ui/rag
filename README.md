# StayWise 酒店预订平台

NestJS + React（Vite）单体仓库骨架。当前是框架阶段：页面可点通，接口是占位实现，业务将按 Auth → Hotels → Orders → Chat/RAG 逐步补齐。

## 技术栈

- 后端：NestJS、Prisma、PostgreSQL、JWT 双 token
- 前端：React、Vite、TailwindCSS、Ant Design、React Router
- AI 客服：SSE 流式占位，后续接 RAG 检索

## 本地启动

需要 Node.js 18+ 和 Docker。

```bash
# 启动 PostgreSQL
docker compose up -d

# 安装依赖
npm install
npm install --prefix backend
npm install --prefix frontend

# 生成 Prisma Client、建表并写入演示账号
npm run prisma:generate
npm run prisma:push
npm run prisma:seed

# 同时启动前后端
npm run dev
```

也可以分开启动：

```bash
npm run dev:api   # http://localhost:3001
npm run dev:web   # http://localhost:5173
```

演示账号：`guest@staywise.com` / `123456`。

## 目录

```
backend/     NestJS API
frontend/    Vite React 应用
```

## 页面

| 路径 | 说明 |
| --- | --- |
| `/login` | 登录 |
| `/` | 搜索首页 |
| `/hotels` | 酒店列表 |
| `/hotels/:id` | 酒店详情与预订 |
| `/orders` | 订单：取消 / 改期 |
| `/chat` | AI 客服（SSE 占位） |

## 主要接口

- `POST /auth/login`、`POST /auth/register`、`POST /auth/refresh`、`POST /auth/logout`
- `GET /hotels`、`GET /hotels/:id`（需 JWT）
- `GET /orders`、`POST /orders`、`PATCH /orders/:id`、`DELETE /orders/:id`（需 JWT）
- `GET /chat/stream`（SSE，需 JWT）
