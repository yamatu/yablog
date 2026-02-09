import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams, useLoaderData } from "react-router-dom";

import { api, Post } from "../api";
import { PostCard } from "../components/PostCard";
import { Sidebar } from "../components/Sidebar";
import { useSite } from "../site";
import { placeholderImageDataUrl } from "../placeholder";
import type {
  ArchiveLoaderData,
  TagListLoaderData,
  TagLoaderData,
  CategoryListLoaderData,
  CategoryLoaderData,
} from "../loaders";

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
  const image = (bg && bg.trim() ? bg : "") || placeholderImageDataUrl(`banner:${title}`, title);
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
  const loaderData = useLoaderData() as ArchiveLoaderData | undefined;
  const [items, setItems] = useState<Post[]>(loaderData?.posts ?? []);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(loaderData?.total ?? 0);
  const limit = 12;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const groups = useMemo(() => {
    const map = new Map<string, Post[]>();
    const keyFor = (p: Post) => {
      const iso = p.publishedAt ?? p.updatedAt ?? p.createdAt;
      const d = new Date(iso);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      return `${y}-${m}`;
    };
    for (const p of items) {
      const k = keyFor(p);
      const arr = map.get(k) ?? [];
      arr.push(p);
      map.set(k, arr);
    }
    return Array.from(map.entries()).map(([key, posts]) => ({ key, posts }));
  }, [items]);

  const groupTitle = (key: string) => {
    const [y, m] = key.split("-");
    return `${y} 年 ${m} 月`;
  };

  useEffect(() => {
    if (loaderData) return;
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
        {groups.map((g) => (
          <div key={g.key} style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{groupTitle(g.key)}</div>
              <div className="muted">{g.posts.length} 篇</div>
            </div>
            <div style={{ height: 12 }} />
            <div className="archiveGrid">
              {g.posts.map((p, i) => (
                <PostCard key={p.id} post={p} index={i} variant="square" />
              ))}
            </div>
          </div>
        ))}
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
  const [recommendations, setRecommendations] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.search({ q, limit: 30, page: 1 });
        if (!alive) return;
        setItems(res.items);
        setTotal(res.total);
        setRecommendations(res.recommendations);
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
      {!q.trim() && !err ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>请输入关键词进行搜索</div>
      ) : null}

      {q.trim() && items.length === 0 && !err ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>没有找到相关文章</div>
      ) : null}

      {items.length ? (
        <div>
          <div className="muted" style={{ padding: "10px 2px" }}>
            共 {total} 篇结果
          </div>
          <div className="grid">
            {items.map((p, i) => (
              <PostCard key={p.id} post={p} index={i} />
            ))}
          </div>
        </div>
      ) : null}

      {recommendations.length ? (
        <div style={{ marginTop: 24 }}>
          <div className="card" style={{ padding: 20, marginBottom: 14 }}>
            <div className="widget-title" style={{ marginBottom: 0 }}>相关推荐</div>
            <div className="muted">基于搜索结果的标签/分类推荐</div>
          </div>
          <div className="grid">
            {recommendations.map((p, i) => (
              <PostCard key={`rec-${p.id}`} post={p} index={i} />
            ))}
          </div>
        </div>
      ) : null}
    </PageLayout>
  );
}

export function TagListPage() {
  const { site } = useSite();
  const loaderData = useLoaderData() as TagListLoaderData | undefined;
  const [items, setItems] = useState<string[]>(loaderData?.tags ?? []);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (loaderData) return;
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
  const loaderData = useLoaderData() as CategoryListLoaderData | undefined;
  const [items, setItems] = useState<{ name: string; slug: string }[]>(loaderData?.categories ?? []);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (loaderData) return;
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
  const loaderData = useLoaderData() as TagLoaderData | undefined;
  const [items, setItems] = useState<Post[]>(loaderData?.posts ?? []);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (loaderData) return;
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
  const loaderData = useLoaderData() as CategoryLoaderData | undefined;
  const [items, setItems] = useState<Post[]>(loaderData?.posts ?? []);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (loaderData) return;
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
