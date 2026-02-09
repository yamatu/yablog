import { useMemo } from "react";
import { Link, useLoaderData } from "react-router-dom";

import { Markdown } from "../components/Markdown";
import { Sidebar } from "../components/Sidebar";
import { useSite } from "../site";
import { placeholderImageDataUrl } from "../placeholder";
import type { AboutLoaderData } from "../loaders";

export function AboutPage() {
  const loaderData = useLoaderData() as AboutLoaderData | undefined;
  const { site } = useSite();
  const about = loaderData?.about ?? site?.about ?? null;

  const bg = useMemo(() => {
    const hero = loaderData?.heroImage?.trim() || (site?.images.aboutHero && site.images.aboutHero.trim() ? site.images.aboutHero : "");
    return hero || placeholderImageDataUrl("aboutHero", about?.title ?? "关于");
  }, [loaderData?.heroImage, site?.images.aboutHero, about?.title]);

  return (
    <div className="butterfly-layout">
      <div className="page-banner" style={{ backgroundImage: `url(${bg})` }}>
        <div className="hero-overlay" />
        <h1 className="page-banner-title">{about?.title ?? "关于"}</h1>
      </div>

      <div className="main-content">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card markdown">
            {about ? (
              <Markdown value={about.contentMd} />
            ) : (
              <div style={{ textAlign: "center", padding: 40 }}>
                <div className="muted">你还没有设置关于页内容。</div>
                <div style={{ height: 16 }} />
                <Link to="/admin" className="pill">
                  去后台创建
                </Link>
              </div>
            )}
          </div>
        </div>
        <Sidebar />
      </div>
    </div>
  );
}
