import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useParams } from "react-router-dom";
import { MdDateRange, MdLabel, MdFolder } from "react-icons/md";

import { api, Post } from "../api";
import { buildToc } from "../markdown";
import { useSite } from "../site";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function PostPage() {
  const { slug } = useParams();
  const { site } = useSite();
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

  const toc = useMemo(() => post ? buildToc(post.contentMd) : [], [post]);
  let headingCursor = 0;
  const nextHeadingId = () => toc[headingCursor++]?.id;

  if (err) {
    return (
      <div className="container" style={{ padding: "100px 0" }}>
        <div className="card content">
          <h2 style={{ marginTop: 0 }}>Create 404</h2>
          <div className="muted">{err}</div>
          <div style={{ height: 14 }} />
          <Link to="/" className="muted">
            Back Home
          </Link>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="butterfly-hero" style={{ height: '40vh' }}>
        <div className="hero-content">Loading...</div>
      </div>
    );
  }

  const headerImage =
    post.coverImage ||
    site?.images.defaultPostCover ||
    `https://source.unsplash.com/random/1920x1080?nature&sig=${post.id}`;

  return (
    <div className="butterfly-layout">
      {/* Post Header */}
      <div className="post-header" style={{ backgroundImage: `url(${headerImage})` }}>
        <div className="post-header-overlay" />
        <div className="post-header-info">
          <h1 className="post-title">{post.title}</h1>
          <div className="post-meta">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <MdDateRange /> {formatDate(post.publishedAt ?? post.updatedAt)}
            </span>
            
            {post.categories.length > 0 && (
              <>
                <span style={{ margin: '0 10px' }}>|</span>
                <MdFolder />
                {post.categories.map((c, i) => (
                  <span key={c}>
                    {i > 0 && ", "}
                    {c}
                  </span>
                ))}
              </>
            )}

            {post.tags.length > 0 && (
              <>
                 <span style={{ margin: '0 10px' }}>|</span>
                 <MdLabel />
                 {post.tags.map((t, i) => (
                  <span key={t}>
                    {i > 0 && ", "}
                    {t}
                  </span>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="main-content">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card markdown">
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

        <aside className="sidebar">
          {toc.length > 0 && (
            <div className="widget" style={{ position: 'sticky', top: 80 }}>
              <div className="widget-title">目录</div>
              <div className="tocList" style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
                {toc.map((item) => (
                  <a
                    key={item.id}
                    className={`tocLink tocL${item.level}`}
                    href={`#${item.id}`}
                    style={{ 
                      display: 'block', 
                      padding: '4px 0', 
                      fontSize: '0.9rem',
                      color: 'var(--muted)',
                      paddingLeft: (item.level - 1) * 15
                    }}
                  >
                    {item.text}
                  </a>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
