import { Link } from "react-router-dom";

import type { Post } from "../api";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function PostCard({ post }: { post: Post }) {
  return (
    <Link to={`/post/${post.slug}`} className="card">
      <h3 className="cardTitle">{post.title}</h3>
      {post.summary ? <div className="muted">{post.summary}</div> : null}
      <div style={{ height: 10 }} />
      <div className="meta">
        <span className="pill">{formatDate(post.publishedAt ?? post.updatedAt)}</span>
        {post.featured ? <span className="pill">精选</span> : null}
        {post.categories.slice(0, 2).map((c) => (
          <span key={c} className="pill">
            {c}
          </span>
        ))}
        {post.tags.slice(0, 3).map((t) => (
          <span key={t} className="pill">
            #{t}
          </span>
        ))}
      </div>
    </Link>
  );
}

