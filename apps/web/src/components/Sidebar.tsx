import { Link } from "react-router-dom";
import {
  MdCampaign,
  MdFolder,
  MdLabel,
  MdLink,
  MdOndemandVideo,
  MdRssFeed,
} from "react-icons/md";
import { FaGithub } from "react-icons/fa6";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Markdown } from "./Markdown";
import { useSite } from "../site";
import { placeholderImageDataUrl } from "../placeholder";

export function Sidebar() {
  const { site } = useSite();
  const [stats, setStats] = useState({ posts: 0, tags: 0, cats: 0 });

  useEffect(() => {
    api
      .listPosts({ limit: 1 })
      .then((res) => setStats((s) => ({ ...s, posts: res.total })))
      .catch(() => {});

    api
      .listTags()
      .then((res) => setStats((s) => ({ ...s, tags: res.items.length })))
      .catch(() => {});

    api
      .listCategories()
      .then((res) => setStats((s) => ({ ...s, cats: res.items.length })))
      .catch(() => {});
  }, []);

  const sidebar = site?.sidebar;
  const avatar =
    sidebar?.avatarUrl && sidebar.avatarUrl.trim()
      ? sidebar.avatarUrl
      : placeholderImageDataUrl("avatar", sidebar?.name ?? "YaBlog");

  const socialIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t === "github") return <FaGithub />;
    if (t === "youtube") return <MdOndemandVideo />;
    if (t === "rss") return <MdRssFeed />;
    return <MdLink />;
  };

  return (
    <div className="sidebar">
      <div className="widget profile-widget">
        <div className="profile-avatar">
          <img src={avatar} alt="Avatar" />
        </div>
        <div className="profile-name">{sidebar?.name ?? "Admin"}</div>
        <div className="profile-bio">{sidebar?.bio ?? ""}</div>

        <div className="profile-data">
          <div className="data-item">
            <div className="data-count">{stats.posts}</div>
            <div className="data-name">文章</div>
          </div>
          <div className="data-item">
            <div className="data-count">{stats.tags}</div>
            <div className="data-name">标签</div>
          </div>
          <div className="data-item">
            <div className="data-count">{stats.cats}</div>
            <div className="data-name">分类</div>
          </div>
        </div>

        <div className="follow-buttons">
          {(sidebar?.followButtons ?? [{ label: "Follow Me", url: "/about" }]).map((b) => {
            const internal = b.url.startsWith("/");
            return internal ? (
              <Link key={b.label} to={b.url} className="btn-follow">
                {b.label}
              </Link>
            ) : (
              <a key={b.label} href={b.url} className="btn-follow" target="_blank" rel="noreferrer">
                {b.label}
              </a>
            );
          })}
        </div>

        {(sidebar?.socials?.length ?? 0) > 0 ? (
          <div className="social-row" aria-label="Social links">
            {sidebar!.socials.map((s) => (
              <a key={`${s.type}:${s.url}`} href={s.url} target="_blank" rel="noreferrer" title={s.label ?? s.type}>
                {socialIcon(s.type)}
              </a>
            ))}
          </div>
        ) : null}
      </div>

      <div className="widget">
        <div className="widget-title">
          <MdCampaign /> 公告
        </div>
        <div className="widget-markdown">
          <Markdown value={sidebar?.noticeMd ?? ""} />
        </div>
      </div>

      <div className="widget">
        <div className="widget-title">快捷入口</div>
        <div className="quick-links">
          <Link to="/archive">
            <MdFolder /> 归档
          </Link>
          <Link to="/tags">
            <MdLabel /> 标签
          </Link>
        </div>
      </div>
    </div>
  );
}
