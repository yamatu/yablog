import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MdKeyboardArrowDown } from "react-icons/md";

import { api, Post } from "../api";
import { PostCard } from "../components/PostCard";
import { Sidebar } from "../components/Sidebar";
import { useSite } from "../site";

export function HomePage() {
  const { site } = useSite();
  const [pinned, setPinned] = useState<Post[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const p = await api.listPosts({ pinned: true, limit: 3 });
        const l = await api.listPosts({ featured: false, page: 1, limit });
        if (!alive) return;
        setPinned(p.items);
        setPosts(l.items);
        setTotal(l.total);
        setPage(1);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const scrollToContent = () => {
    document.getElementById("content")?.scrollIntoView({ behavior: "smooth" });
  };

  const heroImage =
    site?.images.homeHero ||
    "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=80";

  const heroTitle = site?.home?.title || "YaBlog";
  const heroSubtitle = site?.home?.subtitle || "Minimal · Elegant · Powerful";

  const goToPage = async (nextPage: number) => {
    const p = Math.max(1, nextPage);
    setErr(null);
    setLoading(true);
    try {
      const res = await api.listPosts({ featured: false, page: p, limit });
      setPosts(res.items);
      setTotal(res.total);
      setPage(p);
      scrollToContent();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="butterfly-layout">
      {/* Hero Section */}
      <div
        className="butterfly-hero"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="hero-overlay" />
        <div className="hero-content">
          <h1 className="hero-title">{heroTitle}</h1>
          <p className="hero-subtitle">{heroSubtitle}</p>
        </div>
        <div className="scroll-down" onClick={scrollToContent}>
          <MdKeyboardArrowDown />
        </div>
      </div>

      {/* Main Content Area */}
      <div id="content" className="main-content">
        <div className="post-list">
          {err ? <div className="card" style={{ padding: 18 }}>加载失败：{err}</div> : null}

          {/* 置顶只在卡片左上角显示，不做额外区块标题；仅第一页展示 */}
          {page === 1
            ? pinned.map((p, index) => <PostCard key={p.id} post={p} index={index} />)
            : null}
          {posts.map((p, index) => (
            <PostCard key={p.id} post={p} index={index + pinned.length} />
          ))}

          {!posts.length && !loading ? <div className="muted" style={{ padding: 16 }}>暂无文章</div> : null}

          <div className="pager pagerFloat">
            <button onClick={() => goToPage(page - 1)} disabled={loading || page <= 1}>
              上一页
            </button>
            <div className="muted">
              第 {page} / {totalPages} 页
            </div>
            <button onClick={() => goToPage(page + 1)} disabled={loading || page >= totalPages}>
              下一页
            </button>
          </div>

        </div>

        {/* Sidebar */}
        <Sidebar />
      </div>
    </div>
  );
}
