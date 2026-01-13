import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { api, Post, User } from "../../api";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { useSite } from "../../site";

function useMe() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.me();
        if (!alive) return;
        setUser(res.user);
      } catch {
        if (!alive) return;
        setUser(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { user, loading, refresh: async () => api.me().then((r) => setUser(r.user)) };
}

// Wrap admin pages in a simple centered container since we removed the public layout
const AdminLayoutWrapper = ({ children }: { children: React.ReactNode }) => (
  <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "40px 20px" }}>
    <div className="container" style={{ maxWidth: 1000 }}>
      {children}
    </div>
  </div>
);

export function AdminIndexPage() {
  const { user, loading } = useMe();
  const location = useLocation();
  if (loading) return <div className="container" style={{ padding: "26px 0" }}>加载中…</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return (
    <AdminLayoutWrapper>
      <AdminDashboard user={user} />
    </AdminLayoutWrapper>
  );
}

export function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sp] = useSearchParams();
  const from = (location.state as any)?.from ?? sp.get("from") ?? "/admin";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await api.login({ username, password });
      navigate(from, { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div className="glass content" style={{ width: "100%", maxWidth: 400, padding: 40 }}>
        <h2 style={{ marginTop: 0, textAlign: 'center' }}>后台登录</h2>
        <div style={{ height: 20 }} />
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 20 }}>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" style={{ padding: 12 }} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            style={{ padding: 12 }}
          />
          <button disabled={loading} style={{ padding: 12, fontSize: 16 }}>{loading ? "登录中…" : "登录"}</button>
          {err ? <div className="muted" style={{ textAlign: "center", color: "red" }}>{err}</div> : null}
        </form>
      </div>
    </div>
  );
}

function AdminDashboard({ user }: { user: User }) {
  const [items, setItems] = useState<Post[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.adminListPosts({ q, limit: 50 });
      setItems(res.items);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onLogout = async () => {
    await api.logout().catch(() => { });
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="glass content">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: 'center', marginBottom: 30 }}>
        <div>
          <h2 style={{ margin: 0 }}>控制台</h2>
          <div className="muted">欢迎回来，{user.username}</div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => navigate("/admin/new")}>+ 新建文章</button>
          <button onClick={() => navigate("/admin/settings")} style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}>设置</button>
          <button onClick={onLogout} style={{ background: 'transparent', color: 'var(--muted2)', border: 'none', boxShadow: 'none' }}>退出</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索文章..." style={{ flex: 1 }} />
        <button onClick={refresh} disabled={loading}>
          {loading ? "..." : "搜索"}
        </button>
      </div>

      {err ? <div className="muted" style={{ marginBottom: 20 }}>错误：{err}</div> : null}

      <div style={{ display: "flex", flexDirection: 'column', gap: 10 }}>
        {items.map((p) => (
          <div key={p.id} className="card" style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 0 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{p.title}</div>
              <div className="meta" style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span className={`pill ${p.status === 'published' ? 'active' : ''}`} style={{ color: p.status === 'published' ? 'green' : 'orange' }}>{p.status === 'published' ? '已发布' : '草稿'}</span>
                {p.featured ? <span className="pill" style={{ color: 'var(--accent)' }}>置顶</span> : null}
                <span className="pill">排序 {p.sortOrder ?? 0}</span>
                <span className="muted">/{p.slug}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={async () => {
                  await api.adminUpdatePostOrder(p.id, { featured: !Boolean(p.featured) });
                  refresh();
                }}
                className="pill"
                style={{ background: "transparent" }}
                title="置顶/取消置顶"
              >
                {p.featured ? "取消置顶" : "置顶"}
              </button>
              <button
                onClick={async () => {
                  await api.adminUpdatePostOrder(p.id, { sortOrder: (p.sortOrder ?? 0) + 1 });
                  refresh();
                }}
                className="pill"
                style={{ background: "transparent" }}
                title="排序 +1"
              >
                ↑
              </button>
              <button
                onClick={async () => {
                  await api.adminUpdatePostOrder(p.id, { sortOrder: (p.sortOrder ?? 0) - 1 });
                  refresh();
                }}
                className="pill"
                style={{ background: "transparent" }}
                title="排序 -1"
              >
                ↓
              </button>
              <Link to={`/post/${p.slug}`} target="_blank" className="pill">
                查看
              </Link>
              <Link to={`/admin/edit/${p.id}`} className="pill" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                编辑
              </Link>
            </div>
          </div>
        ))}
        {!items.length && !loading ? <div className="muted" style={{ textAlign: 'center', padding: 40 }}>暂无文章</div> : null}
      </div>
    </div>
  );
}

export function AdminEditorPage({ mode }: { mode: "new" | "edit" }) {
  const { user, loading } = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const id = mode === "edit" ? Number(params.id) : null;

  const [post, setPost] = useState<Post | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [contentMd, setContentMd] = useState("# Hello YaBlog\n\n开始写作吧。");
  const [tags, setTags] = useState("");
  const [categories, setCategories] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [featured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === "new") return;
    if (!id) return;
    (async () => {
      try {
        const res = await api.adminListPosts({ limit: 100 });
        const found = res.items.find((p) => p.id === id) ?? null;
        setPost(found);
        if (found) {
          setTitle(found.title);
          setSlug(found.slug);
          setSummary(found.summary ?? "");
          setCoverImage(found.coverImage ?? "");
          setContentMd(found.contentMd);
          setTags(found.tags.join(","));
          setCategories(found.categories.join(","));
          setStatus(found.status);
          setFeatured(Boolean(found.featured));
          setSortOrder(found.sortOrder ?? 0);
        }
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, [id, mode]);

  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  const onSave = async (opts?: { publish?: boolean }) => {
    setErr(null);
    setSaving(true);
    try {
      const nextStatus = opts?.publish ? "published" : status;
      const payload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        summary: summary.trim() || undefined,
        coverImage: coverImage.trim() || undefined,
        contentMd,
        tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
        categories: categories.split(",").map((s) => s.trim()).filter(Boolean),
        status: nextStatus,
        featured,
        sortOrder,
      };

      if (mode === "new") {
        const res = await api.adminCreatePost(payload);
        navigate(`/admin/edit/${res.id}`, { replace: true });
      } else {
        if (!id) throw new Error("missing id");
        await api.adminUpdatePost(id, payload);
      }
      if (opts?.publish) setStatus("published");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!id) return;
    if (!confirm("确定删除这篇文章吗？")) return;
    setSaving(true);
    try {
      await api.adminDeletePost(id);
      navigate("/admin", { replace: true });
    } finally {
      setSaving(false);
    }
  };

	  return (
	    <AdminLayoutWrapper>
	      <div className="glass content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <button onClick={() => navigate("/admin")} style={{ background: 'transparent', color: 'var(--muted)', padding: 0, boxShadow: 'none', marginBottom: 5 }}>← 返回列表</button>
            <h2 style={{ margin: 0 }}>{mode === "new" ? "撰写新文章" : "编辑文章"}</h2>
          </div>
	          <div style={{ display: "flex", gap: 10 }}>
	            {mode === "edit" && post && (
	              <Link to={`/post/${post.slug}`} target="_blank" className="pill" style={{ height: 40, lineHeight: '30px', padding: '0 15px' }}>
	                预览页面
	              </Link>
	            )}
	            <button onClick={() => onSave()} disabled={saving} style={{ padding: "0 24px" }}>
	              {saving ? "保存中…" : "保存更改"}
	            </button>
              <button onClick={() => onSave({ publish: true })} disabled={saving} style={{ padding: "0 24px" }}>
                {saving ? "保存中…" : "保存并发布"}
              </button>
	          </div>
	        </div>

        <div style={{ display: "grid", gap: 20 }}>
          {/* Title Area */}
          <div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="在此输入文章标题..."
              style={{ fontSize: 24, fontWeight: 'bold', padding: 15, height: 60 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
            {/* Main Editor */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <MarkdownEditor value={contentMd} onChange={setContentMd} placeholder="开始写作..." minHeight={600} />
            </div>

            {/* Sidebar Settings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
	              <div className="card" style={{ padding: 20 }}>
	                <div className="widget-title">文章设置</div>
	                <div style={{ display: 'grid', gap: 10 }}>
	                  <label style={{ fontSize: 13, color: 'var(--muted)' }}>Slug (URL路径):</label>
	                  <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="example-post" />

	                  <label style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5 }}>摘要:</label>
	                  <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="文章简介..." rows={3} style={{ resize: 'vertical' }} />

                    <label style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5 }}>顶部图片 (Cover):</label>
                    <input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://..." />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          const res = await api.adminUploadImage(f);
                          setCoverImage(res.url);
                        } catch (err: any) {
                          setErr(err?.message ?? String(err));
                        }
                      }}
                    />
                    {coverImage ? (
                      <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
                        <img src={coverImage} alt="cover" style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                      </div>
                    ) : null}
	                </div>
	              </div>

              <div className="card" style={{ padding: 20 }}>
                <div className="widget-title">分类与标签</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <label style={{ fontSize: 13, color: 'var(--muted)' }}>分类 (逗号分隔):</label>
                  <input value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="技术, 生活" />

                  <label style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5 }}>标签 (逗号分隔):</label>
                  <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="React, Node.js" />
                </div>
              </div>

	              <div className="card" style={{ padding: 20 }}>
	                <div className="widget-title">发布状态</div>
	                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                    <div className="muted">当前状态：{status === "published" ? "已发布" : "草稿"}</div>
	                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
	                    <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} style={{ width: 'auto' }} />
	                    <span>置顶文章 (首页置顶)</span>
	                  </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>排序权重（数字越大越靠前）</span>
                      <input
                        type="number"
                        value={sortOrder}
                        onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                      />
                    </label>
	                </div>
	              </div>

              {mode === "edit" ? (
                <button onClick={onDelete} className="btn" style={{ background: '#ff4d4f', color: 'white', justifyContent: 'center' }}>
                  删除此文章
                </button>
              ) : null}

            </div>
          </div>

          {err ? <div className="card" style={{ padding: 15, color: 'red', background: '#fff2f0', border: '1px solid #ffccc7' }}>错误：{err}</div> : null}

        </div>
      </div>
    </AdminLayoutWrapper>
  );
}

export function AdminSettingsPage() {
  const { user, loading, refresh } = useMe();
  const { site, refresh: refreshSite } = useSite();
  const location = useLocation();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [backupErr, setBackupErr] = useState<string | null>(null);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreFullBusy, setRestoreFullBusy] = useState(false);
  const [restoreFullFile, setRestoreFullFile] = useState<File | null>(null);
  const [restoreFullMsg, setRestoreFullMsg] = useState<string | null>(null);
  const [restoreFullErr, setRestoreFullErr] = useState<string | null>(null);

  const [siteDraft, setSiteDraft] = useState(site);
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteMsg, setSiteMsg] = useState<string | null>(null);
  const [siteErr, setSiteErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.adminGetSite();
        if (!alive) return;
        setSiteDraft(res.site);
      } catch {
        // ignore; fall back to public site settings if available
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  const onSave = async () => {
    setErr(null);
    setMsg(null);

    const nextUser = newUsername.trim();
    const nextPass = newPassword;
    if (!currentPassword) return setErr("请输入当前密码");
    if (!nextUser && !nextPass) return setErr("请输入要修改的用户名或新密码");
    if (nextPass && nextPass.length < 8) return setErr("新密码至少 8 位");
    if (nextPass && nextPass !== confirmPassword) return setErr("两次输入的新密码不一致");

    setSaving(true);
    try {
      await api.adminUpdateAccount({
        currentPassword,
        newUsername: nextUser || undefined,
        newPassword: nextPass || undefined,
      });
      await refresh();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMsg("已保存");
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      if (raw.includes("username_taken")) setErr("用户名已被占用");
      else if (raw.includes("invalid_credentials")) setErr("当前密码不正确");
      else setErr(raw);
    } finally {
      setSaving(false);
    }
  };

  const onDownloadBackup = () => {
    setBackupErr(null);
    try {
      window.location.assign("/api/admin/backup");
    } catch (e: any) {
      setBackupErr(e?.message ?? String(e));
    }
  };

  const onRestore = async () => {
    setRestoreErr(null);
    setRestoreMsg(null);
    if (!restoreFile) return setRestoreErr("请选择要上传的备份文件（.db 或 .db.gz）");
    if (!window.confirm("恢复备份会替换当前数据库，并触发服务重启。确定继续吗？")) return;

    setRestoreBusy(true);
    try {
      const res = await api.adminRestoreBackup(restoreFile);
      if (res.restarting) {
        setRestoreMsg("已开始恢复，服务正在重启…（Docker 会自动拉起新进程）");
        setTimeout(() => window.location.reload(), 2500);
      } else {
        setRestoreMsg("已恢复");
      }
    } catch (e: any) {
      setRestoreErr(e?.message ?? String(e));
    } finally {
      setRestoreBusy(false);
    }
  };

  const onDownloadFullBackup = () => {
    window.location.assign("/api/admin/backup/full");
  };

  const onRestoreFull = async () => {
    setRestoreFullErr(null);
    setRestoreFullMsg(null);
    if (!restoreFullFile) return setRestoreFullErr("请选择全量备份文件（.tar.gz）");
    if (!window.confirm("全量恢复会替换数据库和图片库，并触发服务重启。确定继续吗？")) return;

    setRestoreFullBusy(true);
    try {
      const res = await api.adminRestoreFullBackup(restoreFullFile);
      if (res.restarting) {
        setRestoreFullMsg("已开始全量恢复，服务正在重启…");
        setTimeout(() => window.location.reload(), 2500);
      } else {
        setRestoreFullMsg("已恢复");
      }
    } catch (e: any) {
      setRestoreFullErr(e?.message ?? String(e));
    } finally {
      setRestoreFullBusy(false);
    }
  };

  const saveSite = async () => {
    if (!siteDraft) return;
    setSiteErr(null);
    setSiteMsg(null);
    setSiteBusy(true);
    try {
      await api.adminUpdateSite(siteDraft);
      await refreshSite();
      setSiteMsg("站点设置已保存");
    } catch (e: any) {
      setSiteErr(e?.message ?? String(e));
    } finally {
      setSiteBusy(false);
    }
  };

  return (
    <AdminLayoutWrapper>
      <div className="glass content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
          <h2 style={{ margin: 0 }}>系统设置</h2>
          <button onClick={() => navigate("/admin")}>返回控制台</button>
        </div>

        <div className="grid">
          <div className="card" style={{ padding: 30 }}>
            <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 20 }}>修改账户信息</div>
            <div style={{ display: 'grid', gap: 15 }}>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="当前授权密码" />
              <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="新用户名 (留空不改)" />
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="新密码 (留空不改, 至少8位)" />
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="确认新密码" />
              <button onClick={onSave} disabled={saving} style={{ marginTop: 10 }}>
                {saving ? "保存中..." : "保存更改"}
              </button>
              {msg ? <span style={{ color: 'green' }}>{msg}</span> : null}
              {err ? <span style={{ color: 'red' }}>{err}</span> : null}
            </div>
          </div>

          <div className="card" style={{ padding: 30 }}>
            <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 20 }}>数据维护</div>

            <div style={{ marginBottom: 30 }}>
              <div className="muted" style={{ marginBottom: 10 }}>备份全部文章和数据</div>
              <button onClick={onDownloadBackup} className="btn-follow">下载数据库备份</button>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
              <div className="muted" style={{ marginBottom: 10 }}>恢复数据 (危险操作)</div>
              <input type="file" onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)} accept=".db,.gz,.db.gz" style={{ display: 'block', marginBottom: 10 }} />
              <button onClick={onRestore} disabled={restoreBusy || !restoreFile} style={{ background: '#ff4d4f' }}>
                {restoreBusy ? "恢复中..." : "覆盖并恢复数据"}
              </button>
              {restoreMsg ? <div style={{ marginTop: 10, color: 'blue' }}>{restoreMsg}</div> : null}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 20 }}>
              <div className="muted" style={{ marginBottom: 10 }}>全量备份/恢复（包含图片库，带哈希校验）</div>
              <button onClick={onDownloadFullBackup} className="btn-follow">下载全量备份</button>
              <div style={{ height: 12 }} />
              <input
                type="file"
                onChange={(e) => setRestoreFullFile(e.target.files?.[0] ?? null)}
                accept=".tar.gz,application/gzip"
                style={{ display: 'block', marginBottom: 10 }}
              />
              <button onClick={onRestoreFull} disabled={restoreFullBusy || !restoreFullFile} style={{ background: '#ff4d4f' }}>
                {restoreFullBusy ? "全量恢复中..." : "上传并全量恢复"}
              </button>
              {restoreFullMsg ? <div style={{ marginTop: 10, color: 'blue' }}>{restoreFullMsg}</div> : null}
              {restoreFullErr ? <div style={{ marginTop: 10, color: 'red' }}>{restoreFullErr}</div> : null}
            </div>
          </div>
        </div>

        <div style={{ height: 22 }} />
        <div className="card" style={{ padding: 30 }}>
          <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 20 }}>站点外观与内容</div>
          {!siteDraft ? (
            <div className="muted">加载站点设置中…</div>
          ) : (
            <div style={{ display: "grid", gap: 22 }}>
              <div>
                <div className="widget-title">顶部图片</div>
                <div style={{ display: "grid", gap: 12 }}>
                  <input
                    value={siteDraft.images.homeHero}
                    onChange={(e) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, homeHero: e.target.value } })}
                    placeholder="首页顶部图片 URL"
                  />
                  <input
                    value={siteDraft.images.archiveHero}
                    onChange={(e) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, archiveHero: e.target.value } })}
                    placeholder="归档顶部图片 URL"
                  />
                  <input
                    value={siteDraft.images.tagsHero}
                    onChange={(e) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, tagsHero: e.target.value } })}
                    placeholder="标签/分类顶部图片 URL"
                  />
                  <input
                    value={siteDraft.images.aboutHero}
                    onChange={(e) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, aboutHero: e.target.value } })}
                    placeholder="关于页顶部图片 URL"
                  />
                  <input
                    value={siteDraft.images.defaultPostCover}
                    onChange={(e) =>
                      setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, defaultPostCover: e.target.value } })
                    }
                    placeholder="文章默认封面 URL"
                  />
                </div>
              </div>

              <div>
                <div className="widget-title">侧边栏作者卡片</div>
                <div style={{ display: "grid", gap: 12 }}>
                  <input
                    value={siteDraft.sidebar.avatarUrl}
                    onChange={(e) =>
                      setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, avatarUrl: e.target.value } })
                    }
                    placeholder="头像 URL"
                  />
                  <input
                    value={siteDraft.sidebar.name}
                    onChange={(e) =>
                      setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, name: e.target.value } })
                    }
                    placeholder="昵称"
                  />
                  <input
                    value={siteDraft.sidebar.bio}
                    onChange={(e) =>
                      setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, bio: e.target.value } })
                    }
                    placeholder="简介"
                  />
                  <div className="muted">公告（支持 Markdown）</div>
                  <MarkdownEditor
                    value={siteDraft.sidebar.noticeMd}
                    onChange={(v) => setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, noticeMd: v } })}
                    minHeight={260}
                  />

                  <div className="muted">Follow 按钮</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {siteDraft.sidebar.followButtons.map((b, i) => (
                      <div key={`${b.label}-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr auto", gap: 10 }}>
                        <input
                          value={b.label}
                          onChange={(e) => {
                            const next = [...siteDraft.sidebar.followButtons];
                            next[i] = { ...next[i], label: e.target.value };
                            setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, followButtons: next } });
                          }}
                          placeholder="按钮文字"
                        />
                        <input
                          value={b.url}
                          onChange={(e) => {
                            const next = [...siteDraft.sidebar.followButtons];
                            next[i] = { ...next[i], url: e.target.value };
                            setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, followButtons: next } });
                          }}
                          placeholder="链接（/about 或 https://...）"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = siteDraft.sidebar.followButtons.filter((_, idx) => idx !== i);
                            setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, followButtons: next } });
                          }}
                        >
                          删除
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setSiteDraft({
                          ...siteDraft,
                          sidebar: {
                            ...siteDraft.sidebar,
                            followButtons: [...siteDraft.sidebar.followButtons, { label: "新按钮", url: "https://" }],
                          },
                        })
                      }
                    >
                      + 添加按钮
                    </button>
                  </div>

                  <div className="muted">社媒图标（type 可用：github / youtube / rss / link）</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {siteDraft.sidebar.socials.map((s, i) => (
                      <div key={`${s.type}-${i}`} style={{ display: "grid", gridTemplateColumns: "0.8fr 1.8fr 1fr auto", gap: 10 }}>
                        <input
                          value={s.type}
                          onChange={(e) => {
                            const next = [...siteDraft.sidebar.socials];
                            next[i] = { ...next[i], type: e.target.value };
                            setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, socials: next } });
                          }}
                          placeholder="type"
                        />
                        <input
                          value={s.url}
                          onChange={(e) => {
                            const next = [...siteDraft.sidebar.socials];
                            next[i] = { ...next[i], url: e.target.value };
                            setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, socials: next } });
                          }}
                          placeholder="https://..."
                        />
                        <input
                          value={s.label ?? ""}
                          onChange={(e) => {
                            const next = [...siteDraft.sidebar.socials];
                            next[i] = { ...next[i], label: e.target.value || undefined };
                            setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, socials: next } });
                          }}
                          placeholder="提示文字（可空）"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = siteDraft.sidebar.socials.filter((_, idx) => idx !== i);
                            setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, socials: next } });
                          }}
                        >
                          删除
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setSiteDraft({
                          ...siteDraft,
                          sidebar: {
                            ...siteDraft.sidebar,
                            socials: [...siteDraft.sidebar.socials, { type: "github", url: "https://github.com/" }],
                          },
                        })
                      }
                    >
                      + 添加社媒
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="widget-title">关于页（独立，不出现在文章列表）</div>
                <div style={{ display: "grid", gap: 12 }}>
                  <input
                    value={siteDraft.about.title}
                    onChange={(e) => setSiteDraft({ ...siteDraft, about: { ...siteDraft.about, title: e.target.value } })}
                    placeholder="关于页标题"
                  />
                  <MarkdownEditor
                    value={siteDraft.about.contentMd}
                    onChange={(v) => setSiteDraft({ ...siteDraft, about: { ...siteDraft.about, contentMd: v } })}
                    minHeight={360}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={saveSite} disabled={siteBusy}>
                  {siteBusy ? "保存中…" : "保存站点设置"}
                </button>
                {siteMsg ? <span style={{ color: "green" }}>{siteMsg}</span> : null}
                {siteErr ? <span style={{ color: "red" }}>{siteErr}</span> : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayoutWrapper>
  );
}
