# YaBlog (React + Node.js + SQLite) · Minimal · Elegant · Powerful

YaBlog 是一个可一键部署的全栈博客：前端 React（Vite），后端 Node.js（Express），数据库 SQLite，支持后台写作/发布/置顶/排序、站点外观配置、图库、备份恢复、搜索、LaTeX 等。

## 功能概览

**前台页面**
- `/` 首页（置顶 + 列表分页）
- `/post/:slug` 文章详情（Markdown + GFM + LaTeX，右侧目录）
- `/archive` 归档（按月份分组，分页）
- `/search?q=...` 搜索（模糊搜索 + 相关推荐）
- `/tags` / `/tag/:tag` 标签页
- `/categories` / `/category/:category` 分类页
- `/about` 关于页（独立于文章列表）

**后台页面**
- `/admin/login` 登录
- `/admin` 文章管理（新建/编辑/删除/搜索、置顶、排序权重）
- `/admin/edit/:id` 写作页（Markdown 工具栏、图库插入、表格可视化编辑、双栏预览、封面上传）
- `/admin/media` 图库（上传/选择/替换/删除，缩略图）
- `/admin/settings` 设置（站点文案、导航栏、Footer、顶部图片、作者卡片、社媒、关于页、防盗链、备份恢复、修改账号密码）

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

2) 必改项：管理员账号/密码 + JWT 密钥
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `JWT_SECRET`

3) 启动

```bash
docker compose up -d --build
```

4) 访问
- 前台：`http://localhost:8787`
- 后台：`http://localhost:8787/admin`

数据默认保存在本机 `./data/`（包含数据库与上传图片）。

## 环境变量（.env）

常用项（完整见 `.env.example`）：
- `PORT`：服务端口（默认 `8787`）
- `DATABASE_PATH`：SQLite 路径（Docker 默认 `/data/yablog.db`）
- `WEB_DIST_PATH`：前端静态资源目录（Docker 默认 `/app/apps/web/dist`）
- `JWT_SECRET`：JWT 签名密钥（必须修改）
- `COOKIE_SECURE`：HTTPS 环境设为 `1`（Nginx+HTTPS 时务必开启）
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`：首次启动用于创建初始管理员
- `RESET_ADMIN_ON_START=1`：忘记密码时用（重启后将账号密码重置为 `.env` 的值），用完建议改回 `0`

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
- 可“替换图片保持 URL 不变”（适合不改文章内容直接换图）
- 支持 `/uploads/*` 静态访问

## 防盗链（可选）

后台「设置」可开启图片防盗链：阻止非白名单站点直接引用 `/uploads/*`。
- 允许的 Origin 支持多行配置
- 无 Referer 的请求默认放行（兼容 RSS / App / 某些下载场景）

## 备份与恢复

后台「设置」提供两种备份：
- 数据库备份：仅 SQLite（`.db.gz`）
- 全量备份：数据库 + 图片库（`.tar.gz`，包含 sha256 校验清单）

恢复时会触发服务自动重启，Docker 会自动拉起新进程。

## 反向代理（Nginx）

项目提供示例配置：`nginx/yablog.conf`  
把它放到你的 Nginx 配置目录（例如 `/etc/nginx/conf.d/`），并修改：
- `server_name example.com;`
- `upstream` 地址（如果 Nginx 与容器同机，可用 `127.0.0.1:8787`；如果是 Docker 网络内，用容器名）

然后执行：
```bash
nginx -t && nginx -s reload
```

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
