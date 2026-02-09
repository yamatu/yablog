import { FormEvent, useCallback, useEffect, useState } from "react";
import { MdRefresh } from "react-icons/md";
import { useLoaderData } from "react-router-dom";

import { api, Captcha, Link, LinkRequest } from "../api";
import { useSite } from "../site";
import { Sidebar } from "../components/Sidebar";
import { Markdown } from "../components/Markdown";
import { placeholderImageDataUrl } from "../placeholder";
import type { LinksLoaderData } from "../loaders";

export function LinksPage() {
  const { site } = useSite();
  const loaderData = useLoaderData() as LinksLoaderData | undefined;

  const [links, setLinks] = useState<Link[]>(loaderData?.links ?? []);
  const [requests, setRequests] = useState<LinkRequest[]>(loaderData?.requests ?? []);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(!loaderData);

  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [name, setName] = useState(() => (typeof localStorage !== "undefined" ? localStorage.getItem("yablog_linkreq_name") : null) ?? "");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refreshCaptcha = useCallback(async () => {
    try {
      const c = await api.captcha();
      setCaptcha(c);
      setCaptchaAnswer("");
    } catch {
      setCaptcha(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [a, b] = await Promise.all([api.listLinks(), api.listLinkRequests()]);
      setLinks(a.items);
      setRequests(b.items);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCaptcha();
    if (!loaderData) refresh();
  }, [refreshCaptcha, refresh]);

  const bg =
    (site?.images.archiveHero && site.images.archiveHero.trim() ? site.images.archiveHero : "") ||
    placeholderImageDataUrl("linksHero", "友情链接");

  return (
    <div className="butterfly-layout">
      <div className="page-banner" style={{ backgroundImage: `url(${bg})` }}>
        <div className="hero-overlay" />
        <h1 className="page-banner-title">友情链接</h1>
      </div>

      <div className="main-content">
        <div style={{ flex: 1, minWidth: 0 }}>
          {err ? <div className="card" style={{ padding: 20 }}>加载失败：{err}</div> : null}

          <div className="card content">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Links</h2>
              <button className="btn-ghost" type="button" onClick={refresh} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <MdRefresh />
                刷新
              </button>
            </div>
            <div style={{ height: 14 }} />

            {links.length === 0 && !loading ? <div className="emptyState">暂无友情链接</div> : null}

            <div className="linkGrid">
              {links.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="card linkCard"
                >
                  <div className="linkCardInner">
                    <div className="linkIcon">
                      {l.iconUrl ? (
                        <img src={l.iconUrl} alt="" />
                      ) : (
                        <div className="linkIconFallback">{(l.title || "?").slice(0, 1).toUpperCase()}</div>
                      )}
                    </div>
                    <div className="linkMeta">
                      <div className="linkTitle">{l.title}</div>
                      <div className="linkUrl">{l.url}</div>
                      {l.description ? <div className="linkDesc">{l.description}</div> : null}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div style={{ height: 18 }} />

          <div className="card content">
            <h2 style={{ marginTop: 0 }}>申请友链 / 留言</h2>
            <div className="muted">提交后需要后台审核通过才会展示。</div>

            <div style={{ height: 16 }} />

            <form
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                setSubmitErr(null);
                setSubmitOk(null);
                if (!captcha) return setSubmitErr("验证码加载失败，请刷新页面重试");
                const n = name.trim();
                const u = url.trim();
                if (!n) return setSubmitErr("请输入站点名称");
                if (!u) return setSubmitErr("请输入站点 URL");
                setSubmitting(true);
                try {
                  localStorage.setItem("yablog_linkreq_name", n);
                  await api.createLinkRequest({
                    name: n,
                    url: u,
                    description: description.trim(),
                    message: message.trim(),
                    captchaId: captcha.id,
                    captchaAnswer,
                  });
                  setUrl("");
                  setDescription("");
                  setMessage("");
                  setSubmitOk("已提交，等待审核。");
                  await refreshCaptcha();
                } catch (e: any) {
                  setSubmitErr(e?.message ?? String(e));
                  await refreshCaptcha();
                } finally {
                  setSubmitting(false);
                }
              }}
              style={{ display: "grid", gap: 10 }}
            >
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="站点名称" maxLength={40} />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="站点 URL（https://...）" />
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述（可选）" maxLength={200} />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="留言（可选，支持 Markdown）"
                rows={4}
                maxLength={1000}
                style={{ resize: "vertical" }}
              />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div className="muted" style={{ minWidth: 120 }}>
                  验证码：{captcha?.question ?? "—"}
                </div>
                <input value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} placeholder="答案" style={{ width: 120 }} />
                <button type="button" className="btn-ghost" onClick={refreshCaptcha} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <MdRefresh />
                  换一题
                </button>
                <div style={{ flex: 1 }} />
                <button className="btn-primary" disabled={submitting}>
                  {submitting ? "提交中…" : "提交"}
                </button>
              </div>
              {submitErr ? <div className="muted" style={{ color: "red" }}>{submitErr}</div> : null}
              {submitOk ? <div className="muted" style={{ color: "var(--accent)" }}>{submitOk}</div> : null}
            </form>

            <div style={{ height: 18 }} />
            <div style={{ height: 1, background: "var(--border)", opacity: 0.8 }} />
            <div style={{ height: 18 }} />

            <h3 style={{ marginTop: 0 }}>友链留言</h3>
            {requests.length === 0 ? <div className="muted">暂无留言</div> : null}
            <div style={{ display: "grid", gap: 12 }}>
              {requests.map((r) => (
                <div key={r.id} className="glass linkMessage">
                  <div className="linkMessageHeader">
                    <div className="linkMessageName">
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.name}
                      </a>
                    </div>
                    <div className="linkMessageDate">
                      {new Date(r.createdAt).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })}
                    </div>
                  </div>
                  {r.description ? <div className="linkMessageDesc">{r.description}</div> : null}
                  {r.message ? (
                    <div className="linkMessageBody">
                      <div className="markdown" style={{ padding: 0, background: "transparent", border: 0 }}>
                        <Markdown value={r.message} sanitize />
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <Sidebar />
      </div>
    </div>
  );
}
