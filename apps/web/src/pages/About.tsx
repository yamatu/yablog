import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";

import { api } from "../api";
import { useSite } from "../site";

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

  const bg = heroImage ?? site?.images.aboutHero ?? "https://source.unsplash.com/random/1920x600?person";

  return (
    <div className="butterfly-layout">
      <div className="page-banner" style={{ backgroundImage: `url(${bg})` }}>
        <div className="hero-overlay" />
        <h1 className="page-banner-title">{about?.title ?? "关于"}</h1>
      </div>

      <div className="container content-layer">
        <div className="glass content">
          {about ? (
            <div className="markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{about.contentMd}</ReactMarkdown>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 50 }}>
              <div className="muted">
                {err ? `加载失败（${err}）` : "你还没有设置关于页内容。"}
              </div>
              <div style={{ height: 20 }} />
              <Link to="/admin" className="btnPrimary">
                去后台创建
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
