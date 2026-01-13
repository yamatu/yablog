import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, Post } from "../api";
import { PostCard } from "../components/PostCard";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function HomePage() {
  const [featured, setFeatured] = useState<Post[]>([]);
  const [latest, setLatest] = useState<Post[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const f = await api.listPosts({ featured: true, limit: 6 });
        const l = await api.listPosts({ limit: 12 });
        if (!alive) return;
        setFeatured(f.items);
        setLatest(l.items);
        setTotal(l.total);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const scrollToFeed = () => {
    document.getElementById("feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <div className="landing">
        <div className="container">
          <div className="landingStage">
            <div>
              <div className="kicker">
                <span className="kickerDot" />
                <span>Minimal · Elegant · Powerful</span>
              </div>
              <h1 className="landingTitle">把你的文字，做成一扇落地窗。</h1>
              <p className="landingSub">
                这是一个更大气的全栈博客模板：React + Node.js + SQLite。支持后台登录、文章发布、精选置顶、标签分类与搜索。
              </p>
              <div className="ctaRow">
                <Link className="btnPrimary" to="/archive">
                  浏览文章
                </Link>
                <Link className="btnGhost" to="/admin">
                  进入后台
                </Link>
              </div>
              <div
                className="scrollHint"
                onClick={scrollToFeed}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") scrollToFeed();
                }}
                role="button"
                tabIndex={0}
              >
                <span className="scrollPill">↓</span>
                <span>向下滑动，进入正文</span>
              </div>
              {err ? <p className="muted">加载失败：{err}</p> : null}
            </div>

            <div className="landingWindow">
              <div className="landingWindowInner">
                <div className="windowHeader">
                  <div>
                    <div className="windowTitle">今日概览</div>
                    <div className="windowMeta">
                      已发布文章：{total} · 精选：{featured.length}
                    </div>
                  </div>
                  <Link className="pill" to="/admin">
                    管理
                  </Link>
                </div>

                <div className="windowGrid">
                  <div className="windowTile">
                    <div className="windowTileTitle">写作体验</div>
                    <p className="windowTileSub">
                      后台支持 Markdown 编辑、快捷按钮（标题/链接/表格等），更高效地写内容。
                    </p>
                  </div>
                  <div className="windowTile">
                    <div className="windowTileTitle">双主题</div>
                    <p className="windowTileSub">支持黑/白主题切换，整体更像 Apple 风格的克制与质感。</p>
                  </div>
                </div>

                <div className="windowGrid">
                  {latest.slice(0, 4).map((p) => (
                    <Link key={p.id} to={`/post/${p.slug}`} className="windowTile">
                      <div className="windowTileTitle">{p.title}</div>
                      <p className="windowTileSub">
                        {p.summary ? p.summary : "打开阅读 →"} · {formatDate(p.publishedAt ?? p.updatedAt)}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="feed" className="container" style={{ paddingBottom: 46 }}>
        <div className="split">
          <div className="glass content">
            <h2 style={{ marginTop: 0, letterSpacing: "-0.02em" }}>精选</h2>
            <div className="muted">用于首页上方展示的文章。</div>
            <div style={{ height: 12 }} />
            {featured.length ? (
              <div style={{ display: "grid", gap: 12 }}>
                {featured.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </div>
            ) : (
              <div className="muted">
                还没有精选文章。去 <Link to="/admin">后台</Link> 勾选“首页精选”即可显示。
              </div>
            )}
          </div>
          <div className="glass content">
            <h2 style={{ marginTop: 0, letterSpacing: "-0.02em" }}>最新文章</h2>
            <div className="muted">向下滑动后的“正文区域”。</div>
            <div style={{ height: 12 }} />
            <div className="grid" style={{ paddingTop: 0 }}>
              {latest.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
