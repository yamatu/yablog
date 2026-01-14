import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { api, CommentAdminRow, Link as FriendLink, LinkRequest, Post, User } from "../../api";
import { ImageField } from "../../components/ImageField";
import { Markdown } from "../../components/Markdown";
import { MediaLibraryPanel } from "../../components/MediaLibraryModal";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { useSite } from "../../site";

const NAV_ICON_OPTIONS = [
  { key: "home", label: "Home" },
  { key: "archive", label: "Archive" },
  { key: "tag", label: "Tag" },
  { key: "category", label: "Category" },
  { key: "info", label: "Info" },
  { key: "search", label: "Search" },
  { key: "link", label: "Link" },
];

const NAV_PATH_OPTIONS = [
  { path: "/", label: "首页 /" },
  { path: "/archive", label: "归档 /archive" },
  { path: "/tags", label: "标签 /tags" },
  { path: "/categories", label: "分类 /categories" },
  { path: "/links", label: "友链 /links" },
  { path: "/about", label: "关于 /about" },
];

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
  <div className="adminRoot" style={{ minHeight: "100vh", background: "var(--bg)", padding: "40px 20px" }}>
    <div className="container" style={{ maxWidth: 1280 }}>
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
    <div className="adminRoot" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div className="glass content" style={{ width: "100%", maxWidth: 400, padding: 40 }}>
        <h2 style={{ marginTop: 0, textAlign: 'center' }}>后台登录</h2>
        <div style={{ height: 20 }} />
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 20 }}>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
          />
          <button className="btn-primary" disabled={loading}>{loading ? "登录中…" : "登录"}</button>
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
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
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

  useEffect(() => {
    setSelectedIds((prev) => {
      if (!prev.size) return prev;
      const visible = new Set(items.map((p) => p.id));
      const next = new Set<number>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next;
    });
  }, [items]);

  const onLogout = async () => {
    await api.logout().catch(() => { });
    navigate("/admin/login", { replace: true });
  };

  const visibleIds = items.map((p) => p.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;
  const toggleOne = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllVisible = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  const clearSelected = () => setSelectedIds(new Set());

  const runSequential = async (ids: number[], fn: (id: number) => Promise<void>) => {
    for (const id of ids) await fn(id);
  };

  return (
    <div className="glass content">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: 'center', marginBottom: 30 }}>
        <div>
          <h2 style={{ margin: 0 }}>控制台</h2>
          <div className="muted">欢迎回来，{user.username}</div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn-primary" onClick={() => navigate("/admin/new")}>+ 新建文章</button>
          <button className="btn-ghost" onClick={() => navigate("/admin/media")}>图库</button>
          <button className="btn-ghost" onClick={() => navigate("/admin/comments")}>评论</button>
          <button className="btn-ghost" onClick={() => navigate("/admin/links")}>友链</button>
          <button className="btn-ghost" onClick={() => navigate("/admin/settings")}>设置</button>
          <button className="btn-ghost" onClick={onLogout}>退出</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索文章..." style={{ flex: 1 }} />
        <button className="btn-ghost" onClick={refresh} disabled={loading}>
          {loading ? "..." : "搜索"}
        </button>
      </div>

      <div className="adminBulkBar" style={{ marginBottom: 18 }}>
        <label className="chkWrap" title="全选当前列表">
          <input type="checkbox" checked={allSelected} onChange={toggleAllVisible} />
          <span className="muted">全选</span>
        </label>
        <div className="muted">{selectedCount ? `已选 ${selectedCount} 篇` : "未选择"}</div>
        <div style={{ flex: 1 }} />
        <button className="btn-ghost" disabled={!selectedCount || bulkBusy} onClick={clearSelected}>
          清空
        </button>
        <button
          className="btn-ghost"
          disabled={!selectedCount || bulkBusy}
          onClick={async () => {
            setBulkBusy(true);
            try {
              const ids = Array.from(selectedIds);
              await runSequential(ids, async (id) => {
                await api.adminUpdatePostOrder(id, { featured: true });
              });
              await refresh();
            } finally {
              setBulkBusy(false);
            }
          }}
        >
          批量置顶
        </button>
        <button
          className="btn-ghost"
          disabled={!selectedCount || bulkBusy}
          onClick={async () => {
            setBulkBusy(true);
            try {
              const ids = Array.from(selectedIds);
              await runSequential(ids, async (id) => {
                await api.adminUpdatePostOrder(id, { featured: false });
              });
              await refresh();
            } finally {
              setBulkBusy(false);
            }
          }}
        >
          取消置顶
        </button>
        <button
          className="btn-danger"
          disabled={!selectedCount || bulkBusy}
          onClick={async () => {
            if (!confirm(`确定删除选中的 ${selectedCount} 篇文章吗？此操作不可恢复。`)) return;
            setBulkBusy(true);
            try {
              const ids = Array.from(selectedIds);
              await runSequential(ids, async (id) => {
                await api.adminDeletePost(id);
              });
              clearSelected();
              await refresh();
            } finally {
              setBulkBusy(false);
            }
          }}
        >
          批量删除
        </button>
      </div>

      {err ? <div className="muted" style={{ marginBottom: 20 }}>错误：{err}</div> : null}

      <div style={{ display: "flex", flexDirection: 'column', gap: 10 }}>
        {items.map((p) => (
          <div key={p.id} className="card adminPostRow" style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 0 }}>
            <label className="chkWrap" style={{ marginRight: 10 }}>
              <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleOne(p.id)} />
            </label>
            <div className="adminPostMain" style={{ flex: 1, minWidth: 0 }}>
              <div className="adminPostTitle" style={{ fontWeight: 600, fontSize: 16, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
              <div className="meta adminPostMeta" style={{ display: 'flex', gap: 8, fontSize: 12, flexWrap: "wrap" }}>
                <span className={`pill ${p.status === 'published' ? 'active' : ''}`} style={{ color: p.status === 'published' ? 'green' : 'orange' }}>{p.status === 'published' ? '已发布' : '草稿'}</span>
                {p.featured ? <span className="pill" style={{ color: 'var(--accent)' }}>置顶</span> : null}
                <span className="pill">排序 {p.sortOrder ?? 0}</span>
                <span className="muted adminPostSlug">/{p.slug}</span>
              </div>
            </div>
            <div className="adminPostActions" style={{ display: "flex", gap: 10 }}>
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
  const [publishedAtLocal, setPublishedAtLocal] = useState<string>("");
  const [featured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toLocalInput = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const fromLocalInput = (value: string) => {
    const v = value.trim();
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

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
          setPublishedAtLocal(toLocalInput(found.publishedAt ?? null));
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
      const publishedAt = fromLocalInput(publishedAtLocal);
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
        publishedAt,
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
            <button className="btn-ghost" onClick={() => onSave()} disabled={saving}>
              {saving ? "保存中…" : "保存更改"}
            </button>
            <button className="btn-primary" onClick={() => onSave({ publish: true })} disabled={saving}>
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

          <div className="adminEditorColumns" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
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

                    <div style={{ marginTop: 8 }}>
                      <ImageField
                        label="顶部图片 (Cover)"
                        value={coverImage}
                        onChange={setCoverImage}
                        placeholder="https://... 或 /uploads/..."
                        help="建议使用图库上传（会自动压缩并生成缩略图）"
                      />
                    </div>
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
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>发布时间（可留空，发布时自动取当前时间）</span>
                      <input
                        type="datetime-local"
                        value={publishedAtLocal}
                        onChange={(e) => setPublishedAtLocal(e.target.value)}
                      />
                    </label>
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
                <button onClick={onDelete} className="btn-danger" style={{ justifyContent: "center" }}>
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

export function AdminMediaPage() {
  const { user, loading } = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);

  if (loading) return <div className="container" style={{ padding: "26px 0" }}>加载中…</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  return (
    <AdminLayoutWrapper>
      <div className="glass content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>图库</h2>
            <div className="muted">管理站点上传的图片（支持替换保持 URL 不变）</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-ghost" onClick={() => navigate("/admin/settings")}>防盗链设置</button>
            <button className="btn-ghost" onClick={() => navigate("/admin")}>返回控制台</button>
          </div>
        </div>

        {msg ? <div style={{ marginTop: 14, color: "green" }}>{msg}</div> : null}
        <div style={{ height: 16 }} />
        <MediaLibraryPanel
          showClose={false}
          containerStyle={{ width: "100%", maxHeight: "none" }}
          onSelect={async (url) => {
            try {
              await navigator.clipboard.writeText(url);
              setMsg(`已复制：${url}`);
              setTimeout(() => setMsg(null), 1800);
            } catch {
              setMsg(url);
              setTimeout(() => setMsg(null), 1800);
            }
          }}
        />
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
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-ghost" onClick={() => navigate("/admin/media")}>图库</button>
            <button className="btn-ghost" onClick={() => navigate("/admin")}>返回控制台</button>
          </div>
        </div>

        <div className="grid adminSettingsGrid">
          <div className="card adminSettingsCard" style={{ padding: 30 }}>
            <div className="adminSectionTitle" style={{ fontWeight: 600, fontSize: 18, marginBottom: 20 }}>修改账户信息</div>
            <div style={{ display: 'grid', gap: 15 }}>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="当前授权密码" />
              <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="新用户名 (留空不改)" />
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="新密码 (留空不改, 至少8位)" />
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="确认新密码" />
              <button className="btn-primary" onClick={onSave} disabled={saving} style={{ marginTop: 10 }}>
                {saving ? "保存中..." : "保存更改"}
              </button>
              {msg ? <span style={{ color: 'green' }}>{msg}</span> : null}
              {err ? <span style={{ color: 'red' }}>{err}</span> : null}
            </div>
          </div>

          <div className="card adminSettingsCard" style={{ padding: 30 }}>
            <div className="adminSectionTitle" style={{ fontWeight: 600, fontSize: 18, marginBottom: 20 }}>数据维护</div>

            <div style={{ marginBottom: 30 }}>
              <div className="muted" style={{ marginBottom: 10 }}>备份全部文章和数据</div>
              <button onClick={onDownloadBackup} className="btn-follow">下载数据库备份</button>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
              <div className="muted" style={{ marginBottom: 10 }}>恢复数据 (危险操作)</div>
              <input type="file" onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)} accept=".db,.gz,.db.gz" style={{ display: 'block', marginBottom: 10 }} />
              <button className="btn-danger" onClick={onRestore} disabled={restoreBusy || !restoreFile}>
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
              <button className="btn-danger" onClick={onRestoreFull} disabled={restoreFullBusy || !restoreFullFile}>
                {restoreFullBusy ? "全量恢复中..." : "上传并全量恢复"}
              </button>
              {restoreFullMsg ? <div style={{ marginTop: 10, color: 'blue' }}>{restoreFullMsg}</div> : null}
              {restoreFullErr ? <div style={{ marginTop: 10, color: 'red' }}>{restoreFullErr}</div> : null}
            </div>
          </div>
        </div>

        <div style={{ height: 22 }} />
        <div className="card adminSettingsCard" style={{ padding: 30 }}>
          <div className="adminSectionTitle" style={{ fontWeight: 600, fontSize: 18, marginBottom: 20 }}>站点外观与内容</div>
          {!siteDraft ? (
            <div className="muted">加载站点设置中…</div>
          ) : (
            <div style={{ display: "grid", gap: 22 }}>
              <div>
                <div className="widget-title">顶部导航栏</div>
                <div style={{ display: "grid", gap: 12 }}>
                  <input
                    value={siteDraft.nav.brandText}
                    onChange={(e) => setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, brandText: e.target.value } })}
                    placeholder="左上角品牌文字（例如 YaBlog）"
                  />

                  <div className="muted">导航标签（可编辑文字与图标）</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {siteDraft.nav.links.map((item, i) => (
                      <div
                        key={`${item.path}-${i}`}
                        className="adminNavLinkRow"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.1fr 1.4fr 1fr auto",
                          gap: 10,
                        }}
                      >
                        <input
                          value={item.label}
                          onChange={(e) => {
                            const next = [...siteDraft.nav.links];
                            next[i] = { ...next[i], label: e.target.value };
                            setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, links: next } });
                          }}
                          placeholder="标签文字"
                        />
                        <select
                          value={NAV_PATH_OPTIONS.some((p) => p.path === item.path) ? item.path : ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            const next = [...siteDraft.nav.links];
                            next[i] = { ...next[i], path: v || next[i].path };
                            setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, links: next } });
                          }}
                          title="选择页面路径"
                        >
                          <option value="">自定义路径（在右侧输入）</option>
                          {NAV_PATH_OPTIONS.map((p) => (
                            <option key={p.path} value={p.path}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={item.path}
                          onChange={(e) => {
                            const next = [...siteDraft.nav.links];
                            next[i] = { ...next[i], path: e.target.value };
                            setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, links: next } });
                          }}
                          placeholder="/path 或 https://..."
                          title="路径（内部用 / 开头，外链用 https://）"
                        />
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <select
                            value={item.icon}
                            onChange={(e) => {
                              const next = [...siteDraft.nav.links];
                              next[i] = { ...next[i], icon: e.target.value };
                              setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, links: next } });
                            }}
                            title="图标"
                            style={{ width: 140 }}
                          >
                            {NAV_ICON_OPTIONS.map((opt) => (
                              <option key={opt.key} value={opt.key}>
                                {opt.label} ({opt.key})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => {
                              const next = siteDraft.nav.links.filter((_, idx) => idx !== i);
                              setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, links: next } });
                            }}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() =>
                        setSiteDraft({
                          ...siteDraft,
                          nav: {
                            ...siteDraft.nav,
                            links: [...siteDraft.nav.links, { label: "新标签", path: "/", icon: "link" }],
                          },
                        })
                      }
                    >
                      + 添加导航标签
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="widget-title">浏览器标签栏（Title / Favicon）</div>
                <div style={{ display: "grid", gap: 12 }}>
                  <input
                    value={siteDraft.tab.title}
                    onChange={(e) => setSiteDraft({ ...siteDraft, tab: { ...siteDraft.tab, title: e.target.value } })}
                    placeholder="标签页标题（显示在浏览器最上方）"
                  />
                  <input
                    value={siteDraft.tab.awayTitle}
                    onChange={(e) =>
                      setSiteDraft({ ...siteDraft, tab: { ...siteDraft.tab, awayTitle: e.target.value } })
                    }
                    placeholder="用户切走/最小化时的标题"
                  />
                  <ImageField
                    label="Favicon 图标（可留空）"
                    value={siteDraft.tab.faviconUrl}
                    onChange={(v) => setSiteDraft({ ...siteDraft, tab: { ...siteDraft.tab, faviconUrl: v } })}
                    help="建议使用正方形 PNG/WebP（32x32 或 64x64）。也支持 /uploads/..."
                  />
                  <div className="muted">当用户不在当前网页（标签页不可见）时，会自动把标题切换为“离开标题”。</div>
                </div>
              </div>

              <div>
                <div className="widget-title">底部 Footer</div>
                <div style={{ display: "grid", gap: 10 }}>
                  <textarea
                    value={siteDraft.footer.text}
                    onChange={(e) => setSiteDraft({ ...siteDraft, footer: { ...siteDraft.footer, text: e.target.value } })}
                    rows={3}
                    placeholder="例如：© {year} YaBlog · Designed with Butterfly Style"
                  />
                  <div className="muted">支持占位符：{`{year}`} 会自动替换为当前年份。</div>
                </div>
              </div>

              <div>
                <div className="widget-title">首页文案</div>
                <div style={{ display: "grid", gap: 12 }}>
                  <input
                    value={siteDraft.home.title}
                    onChange={(e) =>
                      setSiteDraft({ ...siteDraft, home: { ...siteDraft.home, title: e.target.value } })
                    }
                    placeholder="首页标题（如 YaBlog）"
                  />
                  <input
                    value={siteDraft.home.subtitle}
                    onChange={(e) =>
                      setSiteDraft({ ...siteDraft, home: { ...siteDraft.home, subtitle: e.target.value } })
                    }
                    placeholder="首页副标题（如 Minimal · Elegant · Powerful）"
                  />
                </div>
              </div>

              <div>
                <div className="widget-title">顶部图片</div>
                <div style={{ display: "grid", gap: 18 }}>
                  <ImageField
                    label="首页顶部图片"
                    value={siteDraft.images.homeHero}
                    onChange={(v) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, homeHero: v } })}
                  />
                  <ImageField
                    label="归档顶部图片"
                    value={siteDraft.images.archiveHero}
                    onChange={(v) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, archiveHero: v } })}
                  />
                  <ImageField
                    label="标签/分类顶部图片"
                    value={siteDraft.images.tagsHero}
                    onChange={(v) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, tagsHero: v } })}
                  />
                  <ImageField
                    label="关于页顶部图片"
                    value={siteDraft.images.aboutHero}
                    onChange={(v) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, aboutHero: v } })}
                  />
                  <ImageField
                    label="文章默认封面"
                    value={siteDraft.images.defaultPostCover}
                    onChange={(v) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, defaultPostCover: v } })}
                  />
                </div>
              </div>

              <div>
                <div className="widget-title">侧边栏作者卡片</div>
                <div style={{ display: "grid", gap: 12 }}>
                  <ImageField
                    label="头像"
                    value={siteDraft.sidebar.avatarUrl}
                    onChange={(v) => setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, avatarUrl: v } })}
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

              <div>
                <div className="widget-title">防盗链</div>
                <div style={{ display: "grid", gap: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={siteDraft.security.hotlink.enabled}
                      onChange={(e) =>
                        setSiteDraft({
                          ...siteDraft,
                          security: { ...siteDraft.security, hotlink: { ...siteDraft.security.hotlink, enabled: e.target.checked } },
                        })
                      }
                      style={{ width: "auto" }}
                    />
                    <span>开启图片防盗链（阻止非允许站点直接引用 /uploads）</span>
                  </label>
                  <textarea
                    value={siteDraft.security.hotlink.allowedOrigins.join("\n")}
                    onChange={(e) =>
                      setSiteDraft({
                        ...siteDraft,
                        security: {
                          ...siteDraft.security,
                          hotlink: {
                            ...siteDraft.security.hotlink,
                            allowedOrigins: e.target.value
                              .split("\n")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          },
                        },
                      })
                    }
                    placeholder={"允许的 Origin（每行一个），例如：\nhttps://yourdomain.com\nhttps://cdn.yourdomain.com"}
                    rows={4}
                  />
                  <div className="muted">不填写则仅允许本站域名引用；无 Referer 的请求默认放行。</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn-primary" onClick={saveSite} disabled={siteBusy}>
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

function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AdminCommentsPage() {
  const { user, loading } = useMe();
  const location = useLocation();
  if (loading) return <div className="container" style={{ padding: "26px 0" }}>加载中…</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return (
    <AdminLayoutWrapper>
      <AdminCommentsPanel />
    </AdminLayoutWrapper>
  );
}

function AdminCommentsPanel() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"" | "pending" | "approved">("pending");
  const [items, setItems] = useState<CommentAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingMd, setEditingMd] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.adminListComments({ status: status || undefined });
      setItems(res.items);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (!prev.size) return prev;
      const visible = new Set(items.map((c) => c.id));
      const next = new Set<number>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next;
    });
  }, [items]);

  const visibleIds = items.map((c) => c.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;
  const toggleOne = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllVisible = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  const clearSelected = () => setSelectedIds(new Set());

  const runSequential = async (ids: number[], fn: (id: number) => Promise<void>) => {
    for (const id of ids) await fn(id);
  };

  return (
    <div className="glass content">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0 }}>评论管理</h2>
          <div className="muted">审核 / 编辑 / 删除</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-ghost" onClick={() => navigate("/admin")}>返回控制台</button>
          <button className="btn-ghost" onClick={refresh} disabled={loading}>刷新</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <div className="muted">状态</div>
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={{ width: 160 }}>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="">全部</option>
        </select>
        <div className="muted">最多显示 500 条</div>
      </div>

      <div className="adminBulkBar" style={{ marginBottom: 18 }}>
        <label className="chkWrap" title="全选当前列表">
          <input type="checkbox" checked={allSelected} onChange={toggleAllVisible} />
          <span className="muted">全选</span>
        </label>
        <div className="muted">{selectedCount ? `已选 ${selectedCount} 条` : "未选择"}</div>
        <div style={{ flex: 1 }} />
        <button className="btn-ghost" disabled={!selectedCount || bulkBusy} onClick={clearSelected}>
          清空
        </button>
        <button
          className="btn-ghost"
          disabled={!selectedCount || bulkBusy}
          onClick={async () => {
            setBulkBusy(true);
            try {
              const ids = Array.from(selectedIds);
              await runSequential(ids, async (id) => {
                await api.adminUpdateComment(id, { status: "approved" });
              });
              await refresh();
            } finally {
              setBulkBusy(false);
            }
          }}
        >
          批量通过
        </button>
        <button
          className="btn-ghost"
          disabled={!selectedCount || bulkBusy}
          onClick={async () => {
            setBulkBusy(true);
            try {
              const ids = Array.from(selectedIds);
              await runSequential(ids, async (id) => {
                await api.adminUpdateComment(id, { status: "pending" });
              });
              await refresh();
            } finally {
              setBulkBusy(false);
            }
          }}
        >
          批量驳回
        </button>
        <button
          className="btn-danger"
          disabled={!selectedCount || bulkBusy}
          onClick={async () => {
            if (!confirm(`确定删除选中的 ${selectedCount} 条评论吗？`)) return;
            setBulkBusy(true);
            try {
              const ids = Array.from(selectedIds);
              await runSequential(ids, async (id) => {
                await api.adminDeleteComment(id);
              });
              clearSelected();
              await refresh();
            } finally {
              setBulkBusy(false);
            }
          }}
        >
          批量删除
        </button>
      </div>

      {err ? <div className="muted" style={{ color: "red", marginBottom: 14 }}>错误：{err}</div> : null}
      {loading ? <div className="muted">加载中…</div> : null}
      {!loading && items.length === 0 ? <div className="muted">暂无评论</div> : null}

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((c) => {
          const isEditing = editingId === c.id;
          const isBusy = busyId === c.id;
          return (
            <div key={c.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleOne(c.id)} />
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.postTitle}
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    <a href={`/post/${c.postSlug}`} target="_blank" rel="noreferrer">/post/{c.postSlug}</a>
                    {" · "}
                    {c.author}
                    {" · "}
                    {shortDate(c.createdAt)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span className="pill" style={{ color: c.status === "approved" ? "green" : "orange" }}>
                    {c.status === "approved" ? "已通过" : "待审核"}
                  </span>
                  <button
                    className="btn-ghost"
                    disabled={isBusy}
                    onClick={async () => {
                      setBusyId(c.id);
                      try {
                        await api.adminUpdateComment(c.id, { status: c.status === "approved" ? "pending" : "approved" });
                        await refresh();
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    {c.status === "approved" ? "取消通过" : "通过"}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      if (isEditing) {
                        setEditingId(null);
                        setEditingMd("");
                        return;
                      }
                      setEditingId(c.id);
                      setEditingMd(c.contentMd);
                    }}
                  >
                    {isEditing ? "关闭编辑" : "编辑"}
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={isBusy}
                    onClick={async () => {
                      if (!confirm("确定删除这条评论吗？")) return;
                      setBusyId(c.id);
                      try {
                        await api.adminDeleteComment(c.id);
                        await refresh();
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>

              <div style={{ height: 10 }} />

              {isEditing ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <MarkdownEditor value={editingMd} onChange={setEditingMd} minHeight={160} />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div className="muted">预览</div>
                    <button
                      className="btn-primary"
                      disabled={isBusy}
                      onClick={async () => {
                        const next = editingMd.trim();
                        if (!next) return;
                        setBusyId(c.id);
                        try {
                          await api.adminUpdateComment(c.id, { contentMd: next });
                          setEditingId(null);
                          setEditingMd("");
                          await refresh();
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    >
                      保存
                    </button>
                  </div>
                  <div className="card markdown" style={{ padding: 14 }}>
                    <Markdown value={editingMd} />
                  </div>
                </div>
              ) : (
                <div className="card markdown" style={{ padding: 14 }}>
                  <Markdown value={c.contentMd} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AdminLinksPage() {
  const { user, loading } = useMe();
  const location = useLocation();
  if (loading) return <div className="container" style={{ padding: "26px 0" }}>加载中…</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return (
    <AdminLayoutWrapper>
      <AdminLinksPanel />
    </AdminLayoutWrapper>
  );
}

function AdminLinksPanel() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"links" | "requests">("links");

  const [links, setLinks] = useState<FriendLink[]>([]);
  const [linksErr, setLinksErr] = useState<string | null>(null);
  const [linksLoading, setLinksLoading] = useState(true);
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<number>>(() => new Set());
  const [linksBulkBusy, setLinksBulkBusy] = useState(false);

  const [reqStatus, setReqStatus] = useState<"pending" | "approved">("pending");
  const [requests, setRequests] = useState<LinkRequest[]>([]);
  const [reqErr, setReqErr] = useState<string | null>(null);
  const [reqLoading, setReqLoading] = useState(true);
  const [selectedReqIds, setSelectedReqIds] = useState<Set<number>>(() => new Set());
  const [reqBulkBusy, setReqBulkBusy] = useState(false);

  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [newLink, setNewLink] = useState<{ title: string; url: string; description: string; iconUrl: string; sortOrder: number }>({
    title: "",
    url: "",
    description: "",
    iconUrl: "",
    sortOrder: 0,
  });

  const refreshLinks = useCallback(async () => {
    setLinksLoading(true);
    setLinksErr(null);
    try {
      const res = await api.adminListLinks();
      setLinks(res.items);
    } catch (e: any) {
      setLinksErr(e?.message ?? String(e));
    } finally {
      setLinksLoading(false);
    }
  }, []);

  const refreshRequests = useCallback(async () => {
    setReqLoading(true);
    setReqErr(null);
    try {
      const res = await api.adminListLinkRequests({ status: reqStatus });
      setRequests(res.items);
    } catch (e: any) {
      setReqErr(e?.message ?? String(e));
    } finally {
      setReqLoading(false);
    }
  }, [reqStatus]);

  useEffect(() => {
    refreshLinks();
  }, [refreshLinks]);

  useEffect(() => {
    refreshRequests();
  }, [refreshRequests]);

  useEffect(() => {
    setSelectedLinkIds((prev) => {
      if (!prev.size) return prev;
      const visible = new Set(links.map((l) => l.id));
      const next = new Set<number>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next;
    });
  }, [links]);

  useEffect(() => {
    setSelectedReqIds((prev) => {
      if (!prev.size) return prev;
      const visible = new Set(requests.map((r) => r.id));
      const next = new Set<number>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next;
    });
  }, [requests]);

  const detectIcon = async (url: string) => {
    const u = url.trim();
    if (!u) return "";
    const res = await api.adminDetectLinkIcon(u);
    return res.iconUrl || "";
  };

  const runSequential = async (ids: number[], fn: (id: number) => Promise<void>) => {
    for (const id of ids) await fn(id);
  };

  return (
    <div className="glass content">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0 }}>友情链接</h2>
          <div className="muted">链接列表 + 友链申请审核</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-ghost" onClick={() => navigate("/admin")}>返回控制台</button>
          <button
            className={tab === "links" ? "btn-primary" : "btn-ghost"}
            onClick={() => setTab("links")}
          >
            链接
          </button>
          <button
            className={tab === "requests" ? "btn-primary" : "btn-ghost"}
            onClick={() => setTab("requests")}
          >
            申请
          </button>
        </div>
      </div>

      {tab === "links" ? (
        <>
          {linksErr ? <div className="muted" style={{ color: "red", marginBottom: 14 }}>错误：{linksErr}</div> : null}

          <div className="card" style={{ padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>新增友情链接</div>
              <button className="btn-ghost" onClick={refreshLinks} disabled={linksLoading}>刷新</button>
            </div>
            <div style={{ height: 12 }} />
            <div style={{ display: "grid", gap: 10 }}>
              <input value={newLink.title} onChange={(e) => setNewLink({ ...newLink, title: e.target.value })} placeholder="标题" />
              <input value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} placeholder="URL（https://...）" />
              <input value={newLink.description} onChange={(e) => setNewLink({ ...newLink, description: e.target.value })} placeholder="描述（可选）" />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input value={newLink.iconUrl} onChange={(e) => setNewLink({ ...newLink, iconUrl: e.target.value })} placeholder="图标 URL（可选）" style={{ flex: 1, minWidth: 260 }} />
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={async () => {
                    setBusyKey("new:icon");
                    try {
                      const iconUrl = await detectIcon(newLink.url);
                      setNewLink((v) => ({ ...v, iconUrl: iconUrl || v.iconUrl }));
                    } catch (e: any) {
                      setLinksErr(e?.message ?? String(e));
                    } finally {
                      setBusyKey(null);
                    }
                  }}
                  disabled={busyKey === "new:icon"}
                >
                  识别图标
                </button>
                <input
                  value={String(newLink.sortOrder)}
                  onChange={(e) => setNewLink({ ...newLink, sortOrder: Number(e.target.value || "0") })}
                  placeholder="排序"
                  style={{ width: 120 }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="btn-primary"
                  disabled={busyKey === "new:create"}
                  onClick={async () => {
                    const title = newLink.title.trim();
                    const url = newLink.url.trim();
                    if (!title || !url) return;
                    setBusyKey("new:create");
                    try {
                      await api.adminCreateLink({
                        title,
                        url,
                        description: newLink.description.trim(),
                        iconUrl: newLink.iconUrl.trim(),
                        sortOrder: newLink.sortOrder || 0,
                      });
                      setNewLink({ title: "", url: "", description: "", iconUrl: "", sortOrder: 0 });
                      await refreshLinks();
                    } catch (e: any) {
                      setLinksErr(e?.message ?? String(e));
                    } finally {
                      setBusyKey(null);
                    }
                  }}
                >
                  添加
                </button>
              </div>
            </div>
          </div>

          <div className="adminBulkBar" style={{ marginBottom: 14 }}>
            <label className="chkWrap" title="全选当前列表">
              <input
                type="checkbox"
                checked={links.length > 0 && links.every((l) => selectedLinkIds.has(l.id))}
                onChange={() => {
                  const all = links.length > 0 && links.every((l) => selectedLinkIds.has(l.id));
                  setSelectedLinkIds((prev) => {
                    const next = new Set(prev);
                    if (all) for (const l of links) next.delete(l.id);
                    else for (const l of links) next.add(l.id);
                    return next;
                  });
                }}
              />
              <span className="muted">全选</span>
            </label>
            <div className="muted">{selectedLinkIds.size ? `已选 ${selectedLinkIds.size} 个` : "未选择"}</div>
            <div style={{ flex: 1 }} />
            <button className="btn-ghost" disabled={!selectedLinkIds.size || linksBulkBusy} onClick={() => setSelectedLinkIds(new Set())}>
              清空
            </button>
            <button
              className="btn-danger"
              disabled={!selectedLinkIds.size || linksBulkBusy}
              onClick={async () => {
                if (!confirm(`确定删除选中的 ${selectedLinkIds.size} 个友情链接吗？`)) return;
                setLinksBulkBusy(true);
                try {
                  const ids = Array.from(selectedLinkIds);
                  await runSequential(ids, async (id) => {
                    await api.adminDeleteLink(id);
                  });
                  setSelectedLinkIds(new Set());
                  await refreshLinks();
                } catch (e: any) {
                  setLinksErr(e?.message ?? String(e));
                } finally {
                  setLinksBulkBusy(false);
                }
              }}
            >
              批量删除
            </button>
          </div>

          {linksLoading ? <div className="muted">加载中…</div> : null}
          {!linksLoading && links.length === 0 ? <div className="muted">暂无友情链接</div> : null}

          <div style={{ display: "grid", gap: 12 }}>
            {links.map((l) => (
              <div key={l.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label className="chkWrap" title="选择此项">
                    <input
                      type="checkbox"
                      checked={selectedLinkIds.has(l.id)}
                      onChange={() =>
                        setSelectedLinkIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(l.id)) next.delete(l.id);
                          else next.add(l.id);
                          return next;
                        })
                      }
                    />
                  </label>
                  <div style={{ width: 36, height: 36, borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {l.iconUrl ? <img src={l.iconUrl} alt="" style={{ width: 22, height: 22 }} /> : <span style={{ opacity: 0.7, fontWeight: 900 }}>{l.title.slice(0, 1)}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <input value={l.title} onChange={(e) => setLinks((arr) => arr.map((x) => x.id === l.id ? { ...x, title: e.target.value } : x))} placeholder="标题" />
                  </div>
                  <div style={{ width: 120 }}>
                    <input
                      value={String(l.sortOrder)}
                      onChange={(e) => setLinks((arr) => arr.map((x) => x.id === l.id ? { ...x, sortOrder: Number(e.target.value || "0") } : x))}
                      placeholder="排序"
                    />
                  </div>
                </div>
                <div style={{ height: 10 }} />
                <input value={l.url} onChange={(e) => setLinks((arr) => arr.map((x) => x.id === l.id ? { ...x, url: e.target.value } : x))} placeholder="URL" />
                <div style={{ height: 10 }} />
                <input value={l.description} onChange={(e) => setLinks((arr) => arr.map((x) => x.id === l.id ? { ...x, description: e.target.value } : x))} placeholder="描述（可选）" />
                <div style={{ height: 10 }} />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input value={l.iconUrl} onChange={(e) => setLinks((arr) => arr.map((x) => x.id === l.id ? { ...x, iconUrl: e.target.value } : x))} placeholder="图标 URL（可选）" style={{ flex: 1, minWidth: 260 }} />
                  <button
                    className="btn-ghost"
                    type="button"
                    disabled={busyKey === `icon:${l.id}`}
                    onClick={async () => {
                      setBusyKey(`icon:${l.id}`);
                      try {
                        const iconUrl = await detectIcon(l.url);
                        setLinks((arr) => arr.map((x) => x.id === l.id ? { ...x, iconUrl: iconUrl || x.iconUrl } : x));
                      } catch (e: any) {
                        setLinksErr(e?.message ?? String(e));
                      } finally {
                        setBusyKey(null);
                      }
                    }}
                  >
                    识别图标
                  </button>
                </div>
                <div style={{ height: 12 }} />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="btn-primary"
                    disabled={busyKey === `save:${l.id}`}
                    onClick={async () => {
                      setBusyKey(`save:${l.id}`);
                      try {
                        await api.adminUpdateLink(l.id, {
                          title: l.title.trim(),
                          url: l.url.trim(),
                          description: l.description?.trim() ?? "",
                          iconUrl: l.iconUrl?.trim() ?? "",
                          sortOrder: l.sortOrder || 0,
                        });
                        await refreshLinks();
                      } catch (e: any) {
                        setLinksErr(e?.message ?? String(e));
                      } finally {
                        setBusyKey(null);
                      }
                    }}
                  >
                    保存
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={busyKey === `del:${l.id}`}
                    onClick={async () => {
                      if (!confirm("确定删除这个友情链接吗？")) return;
                      setBusyKey(`del:${l.id}`);
                      try {
                        await api.adminDeleteLink(l.id);
                        await refreshLinks();
                      } catch (e: any) {
                        setLinksErr(e?.message ?? String(e));
                      } finally {
                        setBusyKey(null);
                      }
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <div className="muted">状态</div>
            <select value={reqStatus} onChange={(e) => setReqStatus(e.target.value as any)} style={{ width: 160 }}>
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
            </select>
            <button className="btn-ghost" onClick={refreshRequests} disabled={reqLoading}>刷新</button>
          </div>

          <div className="adminBulkBar" style={{ marginBottom: 14 }}>
            <label className="chkWrap" title="全选当前列表">
              <input
                type="checkbox"
                checked={requests.length > 0 && requests.every((r) => selectedReqIds.has(r.id))}
                onChange={() => {
                  const all = requests.length > 0 && requests.every((r) => selectedReqIds.has(r.id));
                  setSelectedReqIds((prev) => {
                    const next = new Set(prev);
                    if (all) for (const r of requests) next.delete(r.id);
                    else for (const r of requests) next.add(r.id);
                    return next;
                  });
                }}
              />
              <span className="muted">全选</span>
            </label>
            <div className="muted">{selectedReqIds.size ? `已选 ${selectedReqIds.size} 条` : "未选择"}</div>
            <div style={{ flex: 1 }} />
            <button className="btn-ghost" disabled={!selectedReqIds.size || reqBulkBusy} onClick={() => setSelectedReqIds(new Set())}>
              清空
            </button>
            <button
              className="btn-ghost"
              disabled={!selectedReqIds.size || reqBulkBusy}
              onClick={async () => {
                setReqBulkBusy(true);
                try {
                  const ids = Array.from(selectedReqIds);
                  await runSequential(ids, async (id) => {
                    await api.adminUpdateLinkRequest(id, { status: "approved" });
                  });
                  await refreshRequests();
                } catch (e: any) {
                  setReqErr(e?.message ?? String(e));
                } finally {
                  setReqBulkBusy(false);
                }
              }}
            >
              批量通过
            </button>
            <button
              className="btn-ghost"
              disabled={!selectedReqIds.size || reqBulkBusy}
              onClick={async () => {
                setReqBulkBusy(true);
                try {
                  const ids = Array.from(selectedReqIds);
                  await runSequential(ids, async (id) => {
                    await api.adminUpdateLinkRequest(id, { status: "pending" });
                  });
                  await refreshRequests();
                } catch (e: any) {
                  setReqErr(e?.message ?? String(e));
                } finally {
                  setReqBulkBusy(false);
                }
              }}
            >
              批量驳回
            </button>
            <button
              className="btn-primary"
              disabled={!selectedReqIds.size || reqBulkBusy}
              onClick={async () => {
                if (!confirm(`确定通过并加入友情链接（${selectedReqIds.size} 条）吗？`)) return;
                setReqBulkBusy(true);
                try {
                  const ids = Array.from(selectedReqIds);
                  await runSequential(ids, async (id) => {
                    const r = requests.find((x) => x.id === id);
                    if (!r) return;
                    const iconUrl = await detectIcon(r.url).catch(() => "");
                    await api.adminCreateLink({
                      title: r.name,
                      url: r.url,
                      description: r.description ?? "",
                      iconUrl: iconUrl || "",
                      sortOrder: 0,
                    });
                    await api.adminUpdateLinkRequest(id, { status: "approved" });
                  });
                  setSelectedReqIds(new Set());
                  await Promise.all([refreshLinks(), refreshRequests()]);
                  setTab("links");
                } catch (e: any) {
                  setReqErr(e?.message ?? String(e));
                } finally {
                  setReqBulkBusy(false);
                }
              }}
            >
              通过并加入友情链接
            </button>
            <button
              className="btn-danger"
              disabled={!selectedReqIds.size || reqBulkBusy}
              onClick={async () => {
                if (!confirm(`确定删除选中的 ${selectedReqIds.size} 条申请吗？`)) return;
                setReqBulkBusy(true);
                try {
                  const ids = Array.from(selectedReqIds);
                  await runSequential(ids, async (id) => {
                    await api.adminDeleteLinkRequest(id);
                  });
                  setSelectedReqIds(new Set());
                  await refreshRequests();
                } catch (e: any) {
                  setReqErr(e?.message ?? String(e));
                } finally {
                  setReqBulkBusy(false);
                }
              }}
            >
              批量删除
            </button>
          </div>

          {reqErr ? <div className="muted" style={{ color: "red", marginBottom: 14 }}>错误：{reqErr}</div> : null}
          {reqLoading ? <div className="muted">加载中…</div> : null}
          {!reqLoading && requests.length === 0 ? <div className="muted">暂无申请</div> : null}

          <div style={{ display: "grid", gap: 12 }}>
            {requests.map((r) => (
              <div key={r.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedReqIds.has(r.id)}
                        onChange={() =>
                          setSelectedReqIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.id)) next.delete(r.id);
                            else next.add(r.id);
                            return next;
                          })
                        }
                      />
                      <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <a href={r.url} target="_blank" rel="noreferrer">{r.name}</a>
                      </div>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.url} · {shortDate(r.createdAt)}
                    </div>
                    {r.description ? <div className="muted" style={{ marginTop: 6 }}>{r.description}</div> : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span className="pill" style={{ color: r.status === "approved" ? "green" : "orange" }}>
                      {r.status === "approved" ? "已通过" : "待审核"}
                    </span>
                    <button
                      className="btn-ghost"
                      disabled={busyKey === `req:toggle:${r.id}`}
                      onClick={async () => {
                        setBusyKey(`req:toggle:${r.id}`);
                        try {
                          await api.adminUpdateLinkRequest(r.id, { status: r.status === "approved" ? "pending" : "approved" });
                          await refreshRequests();
                        } catch (e: any) {
                          setReqErr(e?.message ?? String(e));
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                    >
                      {r.status === "approved" ? "取消通过" : "通过"}
                    </button>
                    {r.status !== "approved" ? (
                      <button
                        className="btn-primary"
                        disabled={busyKey === `req:add:${r.id}`}
                        onClick={async () => {
                          setBusyKey(`req:add:${r.id}`);
                          try {
                            const iconUrl = await detectIcon(r.url).catch(() => "");
                            await api.adminCreateLink({
                              title: r.name,
                              url: r.url,
                              description: r.description ?? "",
                              iconUrl: iconUrl || "",
                              sortOrder: 0,
                            });
                            await api.adminUpdateLinkRequest(r.id, { status: "approved" });
                            await Promise.all([refreshLinks(), refreshRequests()]);
                            setTab("links");
                          } catch (e: any) {
                            setReqErr(e?.message ?? String(e));
                          } finally {
                            setBusyKey(null);
                          }
                        }}
                      >
                        通过并加入友情链接
                      </button>
                    ) : null}
                    <button
                      className="btn-ghost"
                      disabled={busyKey === `req:del:${r.id}`}
                      onClick={async () => {
                        if (!confirm("确定删除这条申请吗？")) return;
                        setBusyKey(`req:del:${r.id}`);
                        try {
                          await api.adminDeleteLinkRequest(r.id);
                          await refreshRequests();
                        } catch (e: any) {
                          setReqErr(e?.message ?? String(e));
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>

                {r.message ? (
                  <>
                    <div style={{ height: 10 }} />
                    <div className="card markdown" style={{ padding: 14 }}>
                      <Markdown value={r.message} />
                    </div>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
