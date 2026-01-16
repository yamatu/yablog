# YaBlog (React + Node.js + SQLite) · Minimal · Elegant · Powerful

YaBlog 是一个可一键部署的全栈博客：
- 前端：React + Vite
- 后端：Node.js + Express
- 数据库：SQLite（可选 Redis 做缓存/限流）
- 部署：Docker / docker-compose（生产推荐 Nginx + HTTPS，可选 Cloudflare CDN）

内置功能包含：后台写作/发布/置顶/排序、站点外观配置、图库（多选上传/拖拽/替换/缩略图/进度条）、备份恢复（数据库与全量）、搜索推荐、评论+验证码、友链、AI 对话（HTTP 或 Codex CLI）等。

## 功能概览

**前台页面**
- `/` 首页（置顶 + 列表分页）
- `/post/:slug` 文章详情（Markdown + GFM + LaTeX，右侧目录）
- `/archive` 归档（按月份分组，分页）
- `/search?q=...` 搜索（模糊搜索 + 相关推荐）
- `/tags` / `/tag/:tag` 标签页
- `/categories` / `/category/:category` 分类页
- `/about` 关于页（独立于文章列表）
- `/links` 友链（含“申请友链”提交）
- `/ai` AI 对话（可选开启）

**后台页面**
- `/admin/login` 登录
- `/admin` 文章管理（新建/编辑/删除/搜索、置顶、排序权重）
- `/admin/edit/:id` 写作页（Markdown 工具栏、图库插入、表格可视化编辑、双栏预览、封面上传）
- `/admin/media` 图库（多选上传/拖拽上传/替换/删除/缩略图/上传进度/刷新 Cloudflare 缓存）
- `/admin/settings` 设置（站点文案、导航栏、Footer、顶部图片、作者卡片、社媒、关于页、防盗链、备份恢复、账号密码、AI、Cloudflare 刷新缓存）

## 目录结构

```
.
├── apps/
│   ├── api/                # Node.js API (Express + SQLite)
│   └── web/                # React Web (Vite)
├── data/                   # SQLite + uploads（docker-compose volume）
├── nginx/                  # Nginx 反代示例配置
├── docker-compose.yml
└── Dockerfile
```

## 快速开始（Docker / 生产推荐）

1) 创建环境变量文件

```bash
cp .env.example .env
```

2) 必改项：JWT 密钥
- `JWT_SECRET`（必须修改）

3) 首次启动管理员账号

YaBlog 的管理员账号保存在数据库里。第一次启动如果数据库中还没有任何用户，需要用环境变量创建初始管理员：
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

创建完成后你可以在后台「系统设置」里修改账号/密码；生产环境下也可以把 `.env` 里这两项移除或置空（不要留真实密码在文件里）。

4) 启动

```bash
docker compose up -d --build
```

5) 访问
- 前台：`http://localhost:8787`
- 后台：`http://localhost:8787/admin`

数据默认保存在本机 `./data/`（包含数据库与上传图片）。

## 环境变量（.env）

常用项（完整见 `.env.example`）：
- `PORT`：服务端口（默认 `8787`）
- `DATABASE_PATH`：SQLite 路径（Docker 默认 `/data/yablog.db`）
- `WEB_DIST_PATH`：前端静态资源目录（Docker 默认 `/app/apps/web/dist`）
- `REDIS_URL`：Redis 连接串（可选；docker-compose 默认已带 redis 并注入 `redis://redis:6379/0`）
- `JWT_SECRET`：JWT 签名密钥（必须修改，且不要泄露）
- `COOKIE_SECURE`：HTTPS 环境设为 `1`（Nginx+HTTPS 时务必开启）
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`：首次启动用于创建初始管理员（建议用完后删除/置空）
- `RESET_ADMIN_ON_START=1`：忘记密码时用（重启后将账号密码重置为 `.env` 的值），用完建议改回 `0` 并移除明文密码

## 写作与格式

**Markdown 渲染**
- 支持 GFM：表格 / 任务列表 / 删除线等
- 支持 LaTeX（KaTeX）：  
  - 行内：`$E=mc^2$`  
  - 块级：`$$\\int_a^b f(x)dx$$`

**图库图片插入与自定义大小**
- 后台编辑器：工具栏「图库图片」可直接插入图片
- 插入时可填写宽度（例如 `600`、`80%`）
- 也可手写：`![alt](/uploads/xxx.webp "w=600")` 或 `![alt](/uploads/xxx.webp "w=80% h=300")`

**表格可视化编辑**
- 编辑器「表格」按钮打开可视化表格编辑器：可调行列、每列对齐、直接编辑单元格，一键插入 Markdown 表格。

**自定义文章发布时间**
- 后台编辑文章时可设置“发布时间”（`datetime-local`）
- 用于导入历史文章：可以自定义发布日期并用于归档分组与排序

## 归档逻辑

归档页按文章日期分组（优先使用 `publishedAt`，否则使用 `updatedAt`），按月份展示，并支持分页。

## 图库与图片处理

- 上传图片会自动压缩（多数转为 WebP）并生成缩略图用于图库列表
- 支持多选上传、拖拽上传、上传进度条
- 可“替换图片保持 URL 不变”（适合不改文章内容直接换图；Cloudflare 场景建议配合自动 Purge）
- 支持 `/uploads/*` 静态访问
- 图库里提供「刷新缓存」按钮（调用 Cloudflare Purge Everything）

## 防盗链（可选）

后台「设置」可开启图片防盗链：阻止非白名单站点直接引用 `/uploads/*`。
- 允许的 Origin 支持多行配置
- 无 Referer 的请求默认放行（兼容 RSS / App / 某些下载场景）

## 备份与恢复

后台「设置」提供两种备份：
- 数据库备份：仅 SQLite（`.db.gz`）
- 全量备份：数据库 + 图片库（`.tar.gz`，包含 sha256 校验清单）

恢复时会触发服务自动重启，Docker 会自动拉起新进程。

## 缓存与 Cloudflare（强烈建议阅读）

很多“新文章/新图片不更新”的根因来自 Cloudflare 的强缓存规则（例如 Cache Everything / Ignore Cache-Control）。

YaBlog 做了两层保护：
- Nginx 示例配置对 HTML 与 `/api/*` 强制 `no-store`，只对 `/assets/*`、`/uploads/*` 做长缓存
- 后台可配置 Cloudflare API 自动 Purge：内容更新时自动刷新缓存

### 后台 Cloudflare 自动刷新缓存

路径：`/admin/settings` -> `Cloudflare 缓存自动刷新`
- 认证方式：Email + Global API Key + Zone ID（用户要求的方式）
- 支持：自动刷新（内容更新触发）+ 手动“立即刷新缓存”

注意：Purge Everything 会清整个站点缓存，Cloudflare 有频率限制；本项目已做了合并/节流，但仍建议配合下面的 Cache Rule。

### Cloudflare 推荐规则（否则后台可能被缓存）

在 Cloudflare 里加 Cache Rule / Page Rule：
- `URI Path starts with /admin` -> Bypass cache
- `URI Path starts with /api` -> Bypass cache
- （可选）只对 `/assets/*`、`/uploads/*` 走缓存，其余尊重源站（Respect origin）

## 反向代理（Nginx）

项目提供示例配置：`nginx/yablog.conf`  
把它放到你的 Nginx 配置目录（例如 `/etc/nginx/conf.d/`），并修改：
- `server_name example.com;`
- `upstream` 地址（如果 Nginx 与容器同机，可用 `127.0.0.1:8787`；如果是 Docker 网络内，用容器名）

然后执行：
```bash
nginx -t && nginx -s reload
```

## AI 对话（/ai）

前端提供 `/ai` 对话页面，后端统一入口：`POST /api/chat`。

后台配置路径：`/admin/settings` -> `AI 对话`
- `mode=http`：直连 OpenAI/兼容接口（优先 `/v1/responses`，失败回退 `/v1/chat/completions`）
- `mode=codex`：在服务器内运行 `codex exec`（适合某些“只能通过 Codex CLI”访问的接口）
- 支持保存 `config.toml` / `auth.json`（仅后台可见）

## 本地开发（不使用 Docker）

```bash
cp .env.example .env
npm install
npm run dev
```

- Web：`http://localhost:5173`
- API：`http://localhost:8787`

## 升级/同步代码（建议流程）

1) 拉取最新代码
```bash
git pull
```

2) 重新构建并启动（数据不会丢，仍在 `./data`）
```bash
docker compose up -d --build
```

数据库迁移会在服务启动时自动执行。

## License

MIT
