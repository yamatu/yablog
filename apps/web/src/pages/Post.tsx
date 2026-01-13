import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useParams } from "react-router-dom";

import { api, Post } from "../api";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function PostPage() {
  const { slug } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    (async () => {
      try {
        const res = await api.getPost(slug);
        if (!alive) return;
        setPost(res.post);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  if (err) {
    return (
      <div className="container" style={{ padding: "30px 0 50px" }}>
        <div className="glass content">
          <h2 style={{ marginTop: 0 }}>未找到</h2>
          <div className="muted">{err}</div>
          <div style={{ height: 14 }} />
          <Link to="/" className="muted">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="container" style={{ padding: "30px 0 50px" }}>
        <div className="glass content">加载中…</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: "30px 0 50px" }}>
      <div className="glass content">
        <h1 style={{ marginTop: 0 }}>{post.title}</h1>
        <div className="meta" style={{ marginBottom: 12 }}>
          <span className="pill">{formatDate(post.publishedAt ?? post.updatedAt)}</span>
          {post.categories.map((c) => (
            <Link key={c} className="pill" to={`/category/${encodeURIComponent(c)}`}>
              {c}
            </Link>
          ))}
          {post.tags.map((t) => (
            <Link key={t} className="pill" to={`/tag/${encodeURIComponent(t)}`}>
              #{t}
            </Link>
          ))}
        </div>
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.contentMd}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

