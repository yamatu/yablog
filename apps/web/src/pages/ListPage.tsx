import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { api, Post } from "../api";
import { PostCard } from "../components/PostCard";
import { Sidebar } from "../components/Sidebar";
import { useSite } from "../site";

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function chipHue(name: string) {
  return hashString(name) % 360;
}

function chipSize(name: string) {
  const h = hashString(name);
  return 16 + (h % 18); // 16..33
}

// Reusable Page Banner Component
const PageBanner = ({ title, bg }: { title: string; bg?: string }) => {
  const image = bg || "https://source.unsplash.com/random/1920x600?nature,water";
  return (
    <div className="page-banner" style={{ backgroundImage: `url(${image})` }}>
      <div className="hero-overlay" />
      <h1 className="page-banner-title">{title}</h1>
    </div>
  );
};

// Layout wrapper helper
const PageLayout = ({ children, title, bg }: { children: React.ReactNode; title: string; bg?: string }) => (
  <div className="butterfly-layout">
    <PageBanner title={title} bg={bg} />
    <div className="main-content">
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
      <Sidebar />
    </div>
  </div>
);

export function ArchivePage() {
  const { site } = useSite();
  const [items, setItems] = useState<Post[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 12;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.listPosts({ page: 1, limit });
        if (!alive) return;
        setItems(res.items);
        setTotal(res.total);
        setPage(1);
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
    <PageLayout title="归档" bg={site?.images.archiveHero}>
      {err ? <div className="card" style={{ padding: 20 }}>加载失败：{err}</div> : null}

      <div className="card" style={{ padding: "26px" }}>
        <div className="archiveGrid">
          {items.map((p, i) => (
            <PostCard key={p.id} post={p} index={i} variant="square" />
          ))}
        </div>
      </div>

      <div className="pager pagerFloat">
        <button
          onClick={async () => {
            const next = Math.max(1, page - 1);
            const res = await api.listPosts({ page: next, limit });
            setItems(res.items);
            setTotal(res.total);
            setPage(next);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          disabled={page <= 1}
        >
          上一页
        </button>
        <div className="muted">
          第 {page} / {totalPages} 页
        </div>
        <button
          onClick={async () => {
            const next = Math.min(totalPages, page + 1);
            const res = await api.listPosts({ page: next, limit });
            setItems(res.items);
            setTotal(res.total);
            setPage(next);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          disabled={page >= totalPages}
        >
          下一页
        </button>
      </div>
    </PageLayout>
  );
}

export function SearchPage() {
  const { site } = useSite();
  const [sp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const [items, setItems] = useState<Post[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.listPosts({ q, limit: 50 });
        if (!alive) return;
        setItems(res.items);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [q]);

  return (
    <PageLayout title={`搜索：${q}`} bg={site?.images.archiveHero}>
      {err ? <div className="card" style={{ padding: 20 }}>加载失败：{err}</div> : null}
      {items.length === 0 && !err && <div className="card" style={{ padding: 40, textAlign: 'center' }}>没有找到相关文章</div>}
      <div className="grid">
        {items.map((p, i) => (
          <PostCard key={p.id} post={p} index={i} />
        ))}
      </div>
    </PageLayout>
  );
}

export function TagListPage() {
  const { site } = useSite();
  const [items, setItems] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.listTags();
        if (!alive) return;
        setItems(res.items);
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
    <PageLayout title="标签" bg={site?.images.tagsHero}>
      <div className="card" style={{ minHeight: 400, padding: 40 }}>
        {err ? <div className="muted">加载失败：{err}</div> : null}
        <div className="chipCloud">
          {items.map((t) => (
            <Link
              key={t}
              className="colorChip"
              style={{ ["--h" as any]: chipHue(t), fontSize: chipSize(t) }}
              to={`/tag/${encodeURIComponent(t)}`}
            >
              #{t}
            </Link>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}

export function CategoryListPage() {
  const { site } = useSite();
  const [items, setItems] = useState<{ name: string; slug: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.listCategories();
        if (!alive) return;
        setItems(res.items);
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
    <PageLayout title="分类" bg={site?.images.tagsHero}>
      <div className="card" style={{ minHeight: 400, padding: 40 }}>
        {err ? <div className="muted">加载失败：{err}</div> : null}
        <div className="chipCloud">
          {items.map((c) => (
            <Link
              key={c.slug}
              className="colorChip"
              style={{ ["--h" as any]: chipHue(c.name), fontSize: chipSize(c.name) }}
              to={`/category/${encodeURIComponent(c.name)}`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}

export function TagPage() {
  const { site } = useSite();
  const { tag } = useParams();
  const [items, setItems] = useState<Post[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!tag) return;
    let alive = true;
    (async () => {
      try {
        const res = await api.listPosts({ tag, limit: 50 });
        if (!alive) return;
        setItems(res.items);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [tag]);

  return (
    <PageLayout title={`标签：${tag}`} bg={site?.images.tagsHero}>
      {err ? <div className="card" style={{ padding: 20 }}>加载失败：{err}</div> : null}
      <div className="grid">
        {items.map((p, i) => (
          <PostCard key={p.id} post={p} index={i} />
        ))}
      </div>
    </PageLayout>
  );
}

export function CategoryPage() {
  const { site } = useSite();
  const { category } = useParams();
  const [items, setItems] = useState<Post[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!category) return;
    let alive = true;
    (async () => {
      try {
        const res = await api.listPosts({ category, limit: 50 });
        if (!alive) return;
        setItems(res.items);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [category]);

  return (
    <PageLayout title={`分类：${category}`} bg={site?.images.tagsHero}>
      {err ? <div className="card" style={{ padding: 20 }}>加载失败：{err}</div> : null}
      <div className="grid">
        {items.map((p, i) => (
          <PostCard key={p.id} post={p} index={i} />
        ))}
      </div>
    </PageLayout>
  );
}
