import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { api, Post, User } from "../../api";
import { MarkdownEditor } from "../../components/MarkdownEditor";

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

export function AdminIndexPage() {
  const { user, loading } = useMe();
  const location = useLocation();
  if (loading) return <div className="container" style={{ padding: "26px 0" }}>加载中…</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <AdminDashboard user={user} />;
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
    <div className="container" style={{ padding: "26px 0 50px" }}>
      <div className="glass content" style={{ maxWidth: 520, margin: "0 auto" }}>
        <h2 style={{ marginTop: 0 }}>后台登录</h2>
        <div className="muted">请输入后台账号密码</div>
        <div style={{ height: 16 }} />
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
          />
          <button disabled={loading}>{loading ? "登录中…" : "登录"}</button>
          {err ? <div className="muted">登录失败：{err}</div> : null}
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
    await api.logout().catch(() => {});
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="container" style={{ padding: "26px 0 50px" }}>
      <div className="glass content">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>后台</h2>
            <div className="muted">已登录：{user.username}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => navigate("/admin/new")}>新建文章</button>
            <button onClick={() => navigate("/admin/settings")}>设置</button>
            <button onClick={onLogout}>退出</button>
          </div>
        </div>

        <div style={{ height: 14 }} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索标题/内容…" />
          <button onClick={refresh} disabled={loading}>
            {loading ? "刷新中…" : "刷新"}
          </button>
          {err ? <span className="muted">错误：{err}</span> : null}
        </div>

        <div style={{ height: 14 }} />
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((p) => (
            <div key={p.id} className="card" style={{ cursor: "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 650 }}>{p.title}</div>
                  <div className="meta">
                    <span className="pill">{p.status}</span>
                    {p.featured ? <span className="pill">精选</span> : null}
                    <span className="pill">/{p.slug}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <Link to={`/post/${p.slug}`} className="pill">
                    预览
                  </Link>
                  <Link to={`/admin/edit/${p.id}`} className="pill">
                    编辑
                  </Link>
                </div>
              </div>
            </div>
          ))}
          {!items.length && !loading ? <div className="muted">暂无文章</div> : null}
        </div>
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
  const [contentMd, setContentMd] = useState("# Hello YaBlog\n\n开始写作吧。");
  const [tags, setTags] = useState("");
  const [categories, setCategories] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [featured, setFeatured] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === "new") return;
    if (!id) return;
    // simple fetch via admin list; acceptable for MVP
    (async () => {
      try {
        const res = await api.adminListPosts({ limit: 100 });
        const found = res.items.find((p) => p.id === id) ?? null;
        setPost(found);
        if (found) {
          setTitle(found.title);
          setSlug(found.slug);
          setSummary(found.summary ?? "");
          setContentMd(found.contentMd);
          setTags(found.tags.join(","));
          setCategories(found.categories.join(","));
          setStatus(found.status);
          setFeatured(Boolean(found.featured));
        }
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, [id, mode]);

  if (loading) return <div className="container" style={{ padding: "26px 0" }}>加载中…</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  const onSave = async () => {
    setErr(null);
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        summary: summary.trim() || undefined,
        contentMd,
        tags: tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        categories: categories
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        status,
        featured,
      };

      if (mode === "new") {
        const res = await api.adminCreatePost(payload);
        navigate(`/admin/edit/${res.id}`, { replace: true });
      } else {
        if (!id) throw new Error("missing id");
        await api.adminUpdatePost(id, payload);
      }
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
    <div className="container" style={{ padding: "26px 0 50px" }}>
      <div className="glass content">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>{mode === "new" ? "新建文章" : "编辑文章"}</h2>
            <div className="muted">支持 Markdown（GFM）。</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => navigate("/admin")}>返回列表</button>
            {mode === "edit" ? (
              <Link to={post ? `/post/${post.slug}` : "/"} className="pill">
                预览
              </Link>
            ) : null}
          </div>
        </div>

        <div style={{ height: 14 }} />
        <div style={{ display: "grid", gap: 12 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="标题" />
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug（可空）" />
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="摘要（可空）"
          />
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="标签：a,b,c" />
          <input
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            placeholder="分类：tech,life"
          />

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label className="pill" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={status === "published"}
                onChange={(e) => setStatus(e.target.checked ? "published" : "draft")}
              />
              发布
            </label>
            <label className="pill" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
              />
              首页精选
            </label>
          </div>

          <MarkdownEditor value={contentMd} onChange={setContentMd} placeholder="Markdown 内容" minHeight={420} />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={onSave} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </button>
            {mode === "edit" ? (
              <button onClick={onDelete} disabled={saving} style={{ borderColor: "rgba(255, 120, 120, 0.35)" }}>
                删除
              </button>
            ) : null}
            {err ? <span className="muted">错误：{err}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminSettingsPage() {
  const { user, loading, refresh } = useMe();
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

  if (loading) return <div className="container" style={{ padding: "26px 0" }}>加载中…</div>;
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

  return (
    <div className="container" style={{ padding: "26px 0 50px" }}>
      <div className="glass content">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>设置</h2>
            <div className="muted">账号：{user.username}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => navigate("/admin")}>返回</button>
          </div>
        </div>

        <div style={{ height: 16 }} />
        <div className="editorGrid" style={{ gap: 12 }}>
          <div className="muted" style={{ fontWeight: 650 }}>
            修改账号/密码
          </div>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="当前密码"
          />
          <input
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="新用户名（可空）"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="新密码（可空，至少 8 位）"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="确认新密码"
          />

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={onSave} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </button>
            {msg ? <span className="muted">{msg}</span> : null}
            {err ? <span className="muted">错误：{err}</span> : null}
          </div>
        </div>

        <div style={{ height: 22 }} />
        <div className="editorGrid" style={{ gap: 12 }}>
          <div className="muted" style={{ fontWeight: 650 }}>
            数据库备份/恢复
          </div>
          <div className="muted">备份会下载一个压缩文件（.db.gz）。恢复会上传该文件并触发服务重启。</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={onDownloadBackup}>下载压缩备份</button>
            {backupErr ? <span className="muted">错误：{backupErr}</span> : null}
          </div>

          <input
            type="file"
            accept=".db,.gz,.db.gz,application/gzip"
            onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={onRestore} disabled={restoreBusy || !restoreFile}>
              {restoreBusy ? "恢复中…" : "上传并恢复"}
            </button>
            {restoreMsg ? <span className="muted">{restoreMsg}</span> : null}
            {restoreErr ? <span className="muted">错误：{restoreErr}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
