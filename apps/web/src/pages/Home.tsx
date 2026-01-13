import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, Post } from "../api";
import { PostCard } from "../components/PostCard";

export function HomePage() {
  const [featured, setFeatured] = useState<Post[]>([]);
  const [latest, setLatest] = useState<Post[]>([]);
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
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <div className="container hero">
        <h1 className="heroTitle">写作、记录、沉淀。</h1>
        <p className="heroSub">
          一个简洁好看的全栈博客：React + Node.js + SQLite，支持后台登录与文章管理。
        </p>
        {err ? <p className="muted">加载失败：{err}</p> : null}
      </div>
      <div className="container">
        <div className="split">
          <div className="glass content">
            <h2 style={{ marginTop: 0 }}>精选</h2>
            <div className="muted">用于首页置顶展示的文章。</div>
            <div style={{ height: 12 }} />
            {featured.length ? (
              <div style={{ display: "grid", gap: 12 }}>
                {featured.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </div>
            ) : (
              <div className="muted">
                还没有精选文章。去 <Link to="/admin">后台</Link> 勾选“精选”即可显示。
              </div>
            )}
          </div>
          <div className="glass content">
            <h2 style={{ marginTop: 0 }}>最新</h2>
            <div className="muted">最近发布的文章列表。</div>
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

