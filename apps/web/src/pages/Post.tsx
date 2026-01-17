import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MdDateRange, MdLabel, MdFolder, MdRefresh, MdKeyboardArrowUp } from "react-icons/md";

import { api, Captcha, Comment, Post } from "../api";
import { Markdown } from "../components/Markdown";
import { buildToc, extractImageUrls } from "../markdown";
import { useSite } from "../site";
import { placeholderImageDataUrl } from "../placeholder";
import { ImageViewer, type ViewerItem } from "../components/ImageViewer";

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

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsErr, setCommentsErr] = useState<string | null>(null);

  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [author, setAuthor] = useState(() => localStorage.getItem("yablog_comment_author") ?? "");
  const [contentMd, setContentMd] = useState("");
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

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

  const refreshCaptcha = useCallback(async () => {
    try {
      const c = await api.captcha();
      setCaptcha(c);
      setCaptchaAnswer("");
    } catch {
      setCaptcha(null);
    }
  }, []);

  const loadComments = useCallback(async () => {
    if (!slug) return;
    setCommentsLoading(true);
    setCommentsErr(null);
    try {
      const res = await api.listPostComments(slug);
      setComments(res.items);
    } catch (e: any) {
      setCommentsErr(e?.message ?? String(e));
    } finally {
      setCommentsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    refreshCaptcha();
    loadComments();
  }, [slug, refreshCaptcha, loadComments]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    (site?.images.defaultPostCover && site.images.defaultPostCover.trim() ? site.images.defaultPostCover : "") ||
    placeholderImageDataUrl(`postHeader:${post.id}`, post.title);

  const viewerItems = useMemo<ViewerItem[]>(() => {
    const items: ViewerItem[] = [{ url: headerImage, name: post.title }];
    for (const u of extractImageUrls(post.contentMd || "")) items.push({ url: u });
    return items;
  }, [headerImage, post.contentMd, post.title]);

  const openViewerByUrl = (src: string) => {
    const idx = viewerItems.findIndex((it) => it.url === src);
    setViewerIndex(idx >= 0 ? idx : 0);
    setViewerOpen(true);
  };

  return (
    <div className="butterfly-layout">
      <ImageViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        items={viewerItems}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
      />
      {/* Post Header */}
      <div
        className="post-header"
        style={{ backgroundImage: `url(${headerImage})`, cursor: "zoom-in" }}
        title="点击放大查看"
        onClick={() => {
          setViewerIndex(0);
          setViewerOpen(true);
        }}
      >
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
            <Markdown
              value={post.contentMd}
              onImageClick={(src) => openViewerByUrl(src)}
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
            />
          </div>

          <div style={{ height: 18 }} />

          <div className="card content">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>评论</h3>
              <button className="btn-ghost" type="button" onClick={loadComments} title="刷新评论" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <MdRefresh />
                刷新
              </button>
            </div>

            <div style={{ height: 12 }} />

            {commentsErr ? <div className="muted" style={{ color: "red" }}>加载评论失败：{commentsErr}</div> : null}
            {commentsLoading ? <div className="muted">加载中…</div> : null}

            {!commentsLoading && !commentsErr && comments.length === 0 ? (
              <div className="muted">还没有评论，来做第一个留言的人吧。</div>
            ) : null}

            <div style={{ display: "grid", gap: 12 }}>
              {comments.map((c) => (
                <div key={c.id} className="glass" style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700 }}>{c.author}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{formatDate(c.createdAt)}</div>
                  </div>
                  <div style={{ height: 8 }} />
                  <div className="markdown" style={{ padding: 0, background: "transparent", border: 0 }}>
                    <Markdown value={c.contentMd} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ height: 18 }} />
            <div style={{ height: 1, background: "var(--border)", opacity: 0.8 }} />
            <div style={{ height: 18 }} />

            <h3 style={{ margin: 0 }}>发表评论</h3>
            <div style={{ height: 12 }} />

            <form
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                setSubmitErr(null);
                setSubmitOk(null);
                if (!slug) return;
                if (!captcha) {
                  setSubmitErr("验证码加载失败，请刷新页面重试");
                  return;
                }
                const a = author.trim();
                const m = contentMd.trim();
                if (!a) return setSubmitErr("请输入昵称");
                if (!m) return setSubmitErr("请输入评论内容");
                setSubmitting(true);
                try {
                  localStorage.setItem("yablog_comment_author", a);
                  await api.createPostComment(slug, {
                    author: a,
                    contentMd: m,
                    captchaId: captcha.id,
                    captchaAnswer,
                  });
                  setContentMd("");
                  setSubmitOk("已提交，等待后台审核后展示。");
                  await refreshCaptcha();
                } catch (e: any) {
                  setSubmitErr(e?.message ?? String(e));
                  await refreshCaptcha();
                } finally {
                  setSubmitting(false);
                }
              }}
              style={{ display: "grid", gap: 10 }}
            >
              <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="昵称" maxLength={40} />
              <textarea
                value={contentMd}
                onChange={(e) => setContentMd(e.target.value)}
                placeholder="评论内容（支持 Markdown）"
                rows={5}
                maxLength={2000}
                style={{ resize: "vertical" }}
              />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div className="muted" style={{ minWidth: 120 }}>
                  验证码：{captcha?.question ?? "—"}
                </div>
                <input
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  placeholder="答案"
                  style={{ width: 120 }}
                />
                <button type="button" className="btn-ghost" onClick={refreshCaptcha} title="换一题" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <MdRefresh />
                  换一题
                </button>
                <div style={{ flex: 1 }} />
                <button className="btn-primary" disabled={submitting}>
                  {submitting ? "提交中…" : "提交评论"}
                </button>
              </div>

              {submitErr ? <div className="muted" style={{ color: "red" }}>{submitErr}</div> : null}
              {submitOk ? <div className="muted" style={{ color: "var(--accent)" }}>{submitOk}</div> : null}
            </form>
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

      <button
        type="button"
        className={`scrollTopBtn ${showTop ? "show" : ""}`}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="回到顶部"
        title="回到顶部"
      >
        <MdKeyboardArrowUp />
      </button>
    </div>
  );
}
