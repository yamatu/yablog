# YaBlog - Fullstack Blog (React + Node.js + SQLite)

一个简洁好看的全栈博客项目：前端 React，后端 Node.js（Express），数据库 SQLite，使用 `docker-compose` 一键部署。

## Pages / 功能页面

- `/` 首页（精选 + 最新）
- `/post/:slug` 文章详情（Markdown 渲染）
- `/archive` 归档
- `/search?q=...` 搜索
- `/tags` / `/tag/:tag` 标签
- `/categories` / `/category/:category` 分类
- `/about` 关于（建议创建 slug=`about` 的文章来驱动）
- `/admin/login` 后台登录（账号密码）
- `/admin` 后台文章管理（新建/编辑/删除/发布/首页精选）

## Directory Structure

```
.
├── apps/
│   ├── api/                # Node.js API (Express + SQLite)
│   └── web/                # React Web (Vite)
├── data/                   # SQLite 数据文件（docker-compose volume）
├── docker-compose.yml
└── Dockerfile
```

## What's Inside

- React 前台：暗色玻璃拟态风格 UI、文章列表/详情、标签/分类/搜索/归档
- Admin 后台：账号密码登录、文章 CRUD、发布/草稿、首页精选
- Node.js API：JWT Cookie 登录态、SQLite 数据存储、文章/标签/分类 API
- Docker Compose：单容器部署（API 同时托管前端静态站点）

## Quick Start (Docker)

1) 修改 `docker-compose.yml` 里的账号密码和 `JWT_SECRET`

2) 启动：

```bash
docker compose up -d --build
```

3) 访问：

- 前台：`http://localhost:8787`
- 后台：`http://localhost:8787/admin`

SQLite 数据会保存在本机的 `./data/yablog.db`（由 compose volume 挂载）。

## Local Dev (No Docker)

```bash
npm install
npm run dev
```

- Web：`http://localhost:5173`
- API：`http://localhost:8787`

## Notes

- 默认账号密码来自后端环境变量：`ADMIN_USERNAME` / `ADMIN_PASSWORD`（初次启动会自动创建管理员）
- 生产环境请务必修改：`JWT_SECRET`，并在 HTTPS 场景设置 `COOKIE_SECURE=1`

## License

MIT
