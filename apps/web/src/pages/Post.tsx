import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useParams } from "react-router-dom";

import { api, Post } from "../api";
import { buildToc } from "../markdown";

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

  const toc = useMemo(() => buildToc(post.contentMd), [post.contentMd]);
  let headingCursor = 0;
  const nextHeadingId = () => toc[headingCursor++]?.id;

  return (
    <div className="container" style={{ padding: "30px 0 50px" }}>
      <div className="postLayout">
        <div className="glass content postMain">
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
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => {
                  const id = nextHeadingId();
                  return <h1 id={id}>{children}</h1>;
                },
                h2: ({ children }) => {
                  const id = nextHeadingId();
                  return <h2 id={id}>{children}</h2>;
                },
                h3: ({ children }) => {
                  const id = nextHeadingId();
                  return <h3 id={id}>{children}</h3>;
                },
              }}
            >
              {post.contentMd}
            </ReactMarkdown>
          </div>
        </div>

        <aside className="glass toc" aria-label="文章目录">
          <div className="tocTitle">目录</div>
          {toc.length ? (
            <div className="tocList">
              {toc.map((item) => (
                <a
                  key={item.id}
                  className={`tocLink tocL${item.level}`}
                  href={`#${item.id}`}
                >
                  {item.text}
                </a>
              ))}
            </div>
          ) : (
            <div className="muted">（无标题）</div>
          )}
        </aside>
      </div>
    </div>
  );
}
