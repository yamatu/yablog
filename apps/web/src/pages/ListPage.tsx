import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { api, Post } from "../api";
import { PostCard } from "../components/PostCard";

export function ArchivePage() {
  const [items, setItems] = useState<Post[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.listPosts({ limit: 50 });
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
    <div className="container" style={{ padding: "26px 0 50px" }}>
      <div className="glass content">
        <h2 style={{ marginTop: 0 }}>归档</h2>
        {err ? <div className="muted">加载失败：{err}</div> : null}
        <div className="grid">
          {items.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SearchPage() {
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
    <div className="container" style={{ padding: "26px 0 50px" }}>
      <div className="glass content">
        <h2 style={{ marginTop: 0 }}>搜索</h2>
        <div className="muted">关键词：{q || "（空）"}</div>
        {err ? <div className="muted">加载失败：{err}</div> : null}
        <div className="grid">
          {items.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TagListPage() {
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
    <div className="container" style={{ padding: "26px 0 50px" }}>
      <div className="glass content">
        <h2 style={{ marginTop: 0 }}>标签</h2>
        {err ? <div className="muted">加载失败：{err}</div> : null}
        <div className="meta">
          {items.map((t) => (
            <Link key={t} className="pill" to={`/tag/${encodeURIComponent(t)}`}>
              #{t}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CategoryListPage() {
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
    <div className="container" style={{ padding: "26px 0 50px" }}>
      <div className="glass content">
        <h2 style={{ marginTop: 0 }}>分类</h2>
        {err ? <div className="muted">加载失败：{err}</div> : null}
        <div className="meta">
          {items.map((c) => (
            <Link key={c.slug} className="pill" to={`/category/${encodeURIComponent(c.name)}`}>
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TagPage() {
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
    <div className="container" style={{ padding: "26px 0 50px" }}>
      <div className="glass content">
        <h2 style={{ marginTop: 0 }}>标签：#{tag}</h2>
        {err ? <div className="muted">加载失败：{err}</div> : null}
        <div className="grid">
          {items.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function CategoryPage() {
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
    <div className="container" style={{ padding: "26px 0 50px" }}>
      <div className="glass content">
        <h2 style={{ marginTop: 0 }}>分类：{category}</h2>
        {err ? <div className="muted">加载失败：{err}</div> : null}
        <div className="grid">
          {items.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

