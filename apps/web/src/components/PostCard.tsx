import { Link } from "react-router-dom";
import { MdDateRange, MdLabel, MdPushPin } from "react-icons/md";
import type { Post } from "../api";
import { useSite } from "../site";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function PostCard({
  post,
  index,
  variant = "list",
}: {
  post: Post;
  index: number;
  variant?: "list" | "square";
}) {
  const { site } = useSite();
  const isAlt = index % 2 === 1;
  const coverImage =
    post.coverImage ||
    site?.images.defaultPostCover ||
    `https://source.unsplash.com/random/1200x900?nature&sig=${post.id}`;

  if (variant === "square") {
    return (
      <Link to={`/post/${post.slug}`} className="postSquare">
        <div className="postSquareImg" style={{ backgroundImage: `url(${coverImage})` }}>
          {post.featured ? (
            <div className="postSquareBadge" title="置顶">
              <MdPushPin />
            </div>
          ) : null}
        </div>
        <div className="postSquareBody">
          <div className="postSquareTitle">{post.title}</div>
          <div className="postSquareMeta">
            <MdDateRange />
            <span>{formatDate(post.publishedAt ?? post.updatedAt)}</span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/post/${post.slug}`} className={`card ${isAlt ? "alt" : ""}`}>
      <div className="card-cover">
        <img src={coverImage} alt={post.title} loading="lazy" />
        {post.featured ? (
          <div className="card-badge" title="置顶">
            <MdPushPin />
          </div>
        ) : null}
      </div>
      <div className="card-info">
        <h3 className="cardTitle">{post.title}</h3>

        <div className="card-meta">
          <MdDateRange />
          <span>{formatDate(post.publishedAt ?? post.updatedAt)}</span>
          {post.tags.length > 0 && (
            <>
              <span>|</span>
              <MdLabel />
              <span>{post.tags[0]}</span>
            </>
          )}
        </div>

        <div className="card-summary">{post.summary || "点击阅读全文..."}</div>
      </div>
    </Link>
  );
}
