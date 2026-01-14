import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { Markdown } from "../components/Markdown";
import { Sidebar } from "../components/Sidebar";
import { useSite } from "../site";
import { placeholderImageDataUrl } from "../placeholder";

export function AboutPage() {
  const { site } = useSite();
  const [about, setAbout] = useState<{ title: string; contentMd: string } | null>(null);
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.about();
        if (!alive) return;
        setAbout(res.about);
        setHeroImage(res.heroImage);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const bg =
    (heroImage && heroImage.trim() ? heroImage : "") ||
    (site?.images.aboutHero && site.images.aboutHero.trim() ? site.images.aboutHero : "") ||
    placeholderImageDataUrl("aboutHero", about?.title ?? "关于");

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
                <div className="muted">{err ? `加载失败（${err}）` : "你还没有设置关于页内容。"}</div>
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
