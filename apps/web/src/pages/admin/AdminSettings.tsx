import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { AiSettings, api, CloudflareSettings, User } from "../../api";
import { ImageField } from "../../components/ImageField";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { useSite } from "../../site";
import { AdminLayoutWrapper, AdminNav, useMe } from "./AdminLayout";
import "../../admin.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

const NAV_ICON_OPTIONS = [
  { key: "home", label: "Home" },
  { key: "archive", label: "Archive" },
  { key: "tag", label: "Tag" },
  { key: "category", label: "Category" },
  { key: "ai", label: "AI" },
  { key: "info", label: "Info" },
  { key: "search", label: "Search" },
  { key: "link", label: "Link" },
];

const NAV_PATH_OPTIONS = [
  { path: "/", label: "首页 /" },
  { path: "/archive", label: "归档 /archive" },
  { path: "/tags", label: "标签 /tags" },
  { path: "/categories", label: "分类 /categories" },
  { path: "/ai", label: "AI /ai" },
  { path: "/links", label: "友链 /links" },
  { path: "/about", label: "关于 /about" },
];

export function AdminSettingsPage() {
  const { user, loading, refresh } = useMe();
  const { site, refresh: refreshSite } = useSite();
  const location = useLocation();
  const navigate = useNavigate();

  /* ── Account ── */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  /* ── Backup / Restore ── */
  const [backupErr, setBackupErr] = useState<string | null>(null);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreFullBusy, setRestoreFullBusy] = useState(false);
  const [restoreFullFile, setRestoreFullFile] = useState<File | null>(null);
  const [restoreFullMsg, setRestoreFullMsg] = useState<string | null>(null);
  const [restoreFullErr, setRestoreFullErr] = useState<string | null>(null);

  /* ── Site ── */
  const [siteDraft, setSiteDraft] = useState(site);
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteMsg, setSiteMsg] = useState<string | null>(null);
  const [siteErr, setSiteErr] = useState<string | null>(null);

  /* ── AI ── */
  const [aiDraft, setAiDraft] = useState<AiSettings | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);

  /* ── Cloudflare ── */
  const [cfDraft, setCfDraft] = useState<CloudflareSettings | null>(null);
  const [cfBusy, setCfBusy] = useState(false);
  const [cfMsg, setCfMsg] = useState<string | null>(null);
  const [cfErr, setCfErr] = useState<string | null>(null);

  /* ── Fetch site settings ── */
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

  /* ── Fetch AI settings ── */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.adminGetAi();
        if (!alive) return;
        setAiDraft(res.ai);
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ── Fetch Cloudflare settings ── */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.adminGetCloudflare();
        if (!alive) return;
        setCfDraft(res.cloudflare);
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ── Auth guard ── */
  if (loading) return <div className="container" style={{ padding: "26px 0" }}>加载中…</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  /* ── Handlers ── */

  const onLogout = async () => {
    await api.logout().catch(() => {});
    navigate("/admin/login", { replace: true });
  };

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

  const saveAi = async () => {
    if (!aiDraft) return;
    setAiErr(null);
    setAiMsg(null);
    setAiBusy(true);
    try {
      await api.adminUpdateAi(aiDraft);
      setAiMsg("AI 设置已保存");
    } catch (e: any) {
      setAiErr(e?.message ?? String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const saveCloudflare = async () => {
    if (!cfDraft) return;
    setCfErr(null);
    setCfMsg(null);
    setCfBusy(true);
    try {
      await api.adminUpdateCloudflare(cfDraft);
      setCfMsg("Cloudflare 设置已保存");
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      if (raw.includes("cloudflare_email_required")) setCfErr("请输入 Cloudflare 邮箱");
      else if (raw.includes("cloudflare_api_key_required")) setCfErr("请输入 Cloudflare Global API Key");
      else if (raw.includes("cloudflare_zone_required")) setCfErr("请输入 Zone ID（域名区域）");
      else setCfErr(raw);
    } finally {
      setCfBusy(false);
    }
  };

  const purgeCloudflare = async () => {
    setCfErr(null);
    setCfMsg(null);
    setCfBusy(true);
    try {
      await api.adminCloudflarePurge();
      setCfMsg("已请求 Cloudflare 刷新缓存（Purge Everything）");
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      if (raw.includes("cloudflare_disabled")) setCfErr("Cloudflare 未启用");
      else if (raw.includes("cloudflare_not_configured")) setCfErr("Cloudflare 未配置（邮箱/API Key/Zone ID）");
      else setCfErr(raw);
    } finally {
      setCfBusy(false);
    }
  };

  /* ── Render ── */
  return (
    <AdminLayoutWrapper>
      <AdminNav onLogout={onLogout} />

      <h2 className="text-2xl font-bold mb-6">系统设置</h2>

      {/* ── Account & Backup (2-col grid) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Account Card */}
        <Card>
          <CardHeader>
            <CardTitle>修改账户信息</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="currentPassword">当前授权密码</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="当前授权密码"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="newUsername">新用户名 (留空不改)</Label>
              <Input
                id="newUsername"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="新用户名 (留空不改)"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="newPassword">新密码 (留空不改, 至少8位)</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="新密码 (留空不改, 至少8位)"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">确认新密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="确认新密码"
              />
            </div>
            <Button onClick={onSave} disabled={saving}>
              {saving ? "保存中..." : "保存更改"}
            </Button>
            {msg ? <span className="text-sm text-green-600">{msg}</span> : null}
            {err ? <span className="text-sm text-red-600">{err}</span> : null}
          </CardContent>
        </Card>

        {/* Backup Card */}
        <Card>
          <CardHeader>
            <CardTitle>数据维护</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {/* DB backup */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">备份全部文章和数据</p>
              <Button variant="outline" onClick={onDownloadBackup}>下载数据库备份</Button>
              {backupErr ? <p className="text-sm text-red-600 mt-2">{backupErr}</p> : null}
            </div>

            <Separator />

            {/* DB restore */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">恢复数据 (危险操作)</p>
              <input
                type="file"
                onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                accept=".db,.gz,.db.gz"
                className="block mb-2 text-sm"
              />
              <Button variant="destructive" onClick={onRestore} disabled={restoreBusy || !restoreFile}>
                {restoreBusy ? "恢复中..." : "覆盖并恢复数据"}
              </Button>
              {restoreMsg ? <p className="text-sm text-blue-600 mt-2">{restoreMsg}</p> : null}
              {restoreErr ? <p className="text-sm text-red-600 mt-2">{restoreErr}</p> : null}
            </div>

            <Separator />

            {/* Full backup / restore */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">全量备份/恢复（包含图片库，带哈希校验）</p>
              <Button variant="outline" onClick={onDownloadFullBackup}>下载全量备份</Button>
              <div className="h-3" />
              <input
                type="file"
                onChange={(e) => setRestoreFullFile(e.target.files?.[0] ?? null)}
                accept=".tar.gz,application/gzip"
                className="block mb-2 text-sm"
              />
              <Button variant="destructive" onClick={onRestoreFull} disabled={restoreFullBusy || !restoreFullFile}>
                {restoreFullBusy ? "全量恢复中..." : "上传并全量恢复"}
              </Button>
              {restoreFullMsg ? <p className="text-sm text-blue-600 mt-2">{restoreFullMsg}</p> : null}
              {restoreFullErr ? <p className="text-sm text-red-600 mt-2">{restoreFullErr}</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Site Settings ── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>站点外观与内容</CardTitle>
        </CardHeader>
        <CardContent>
          {!siteDraft ? (
            <p className="text-sm text-muted-foreground">加载站点设置中…</p>
          ) : (
            <div className="grid gap-6">
              {/* Nav links */}
              <div>
                <Label className="text-base font-semibold">顶部导航栏</Label>
                <div className="grid gap-3 mt-3">
                  <div className="grid gap-2">
                    <Label htmlFor="brandText">左上角品牌文字</Label>
                    <Input
                      id="brandText"
                      value={siteDraft.nav.brandText}
                      onChange={(e) => setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, brandText: e.target.value } })}
                      placeholder="左上角品牌文字（例如 YaBlog）"
                    />
                  </div>

                  <p className="text-sm text-muted-foreground">导航标签（可编辑文字与图标）</p>
                  <div className="grid gap-3">
                    {siteDraft.nav.links.map((item, i) => (
                      <div
                        key={`${item.path}-${i}`}
                        className="grid grid-cols-[1.1fr_1.4fr_1fr_auto] gap-2 items-center"
                      >
                        <Input
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
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="">自定义路径（在右侧输入）</option>
                          {NAV_PATH_OPTIONS.map((p) => (
                            <option key={p.path} value={p.path}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                        <Input
                          value={item.path}
                          onChange={(e) => {
                            const next = [...siteDraft.nav.links];
                            next[i] = { ...next[i], path: e.target.value };
                            setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, links: next } });
                          }}
                          placeholder="/path 或 https://..."
                          title="路径（内部用 / 开头，外链用 https://）"
                        />
                        <div className="flex gap-2 justify-end">
                          <select
                            value={item.icon}
                            onChange={(e) => {
                              const next = [...siteDraft.nav.links];
                              next[i] = { ...next[i], icon: e.target.value };
                              setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, links: next } });
                            }}
                            title="图标"
                            className="flex h-9 w-[140px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            {NAV_ICON_OPTIONS.map((opt) => (
                              <option key={opt.key} value={opt.key}>
                                {opt.label} ({opt.key})
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const next = siteDraft.nav.links.filter((_, idx) => idx !== i);
                              setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, links: next } });
                            }}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-fit"
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
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Tab / Favicon */}
              <div>
                <Label className="text-base font-semibold">浏览器标签栏（Title / Favicon）</Label>
                <div className="grid gap-3 mt-3">
                  <div className="grid gap-2">
                    <Label htmlFor="tabTitle">标签页标题</Label>
                    <Input
                      id="tabTitle"
                      value={siteDraft.tab.title}
                      onChange={(e) => setSiteDraft({ ...siteDraft, tab: { ...siteDraft.tab, title: e.target.value } })}
                      placeholder="标签页标题（显示在浏览器最上方）"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="awayTitle">用户切走/最小化时的标题</Label>
                    <Input
                      id="awayTitle"
                      value={siteDraft.tab.awayTitle}
                      onChange={(e) =>
                        setSiteDraft({ ...siteDraft, tab: { ...siteDraft.tab, awayTitle: e.target.value } })
                      }
                      placeholder="用户切走/最小化时的标题"
                    />
                  </div>
                  <ImageField
                    label="Favicon 图标（可留空）"
                    value={siteDraft.tab.faviconUrl}
                    onChange={(v) => setSiteDraft({ ...siteDraft, tab: { ...siteDraft.tab, faviconUrl: v } })}
                    help="建议使用正方形 PNG/WebP（32x32 或 64x64）。也支持 /uploads/..."
                  />
                  <p className="text-sm text-muted-foreground">当用户不在当前网页（标签页不可见）时，会自动把标题切换为"离开标题"。</p>
                </div>
              </div>

              <Separator />

              {/* Footer */}
              <div>
                <Label className="text-base font-semibold">底部 Footer</Label>
                <div className="grid gap-3 mt-3">
                  <Textarea
                    value={siteDraft.footer.text}
                    onChange={(e) => setSiteDraft({ ...siteDraft, footer: { ...siteDraft.footer, text: e.target.value } })}
                    rows={3}
                    placeholder="例如：© {year} YaBlog · Designed with Butterfly Style"
                  />
                  <p className="text-sm text-muted-foreground">支持占位符：{`{year}`} 会自动替换为当前年份。</p>
                </div>
              </div>

              <Separator />

              {/* Home copy */}
              <div>
                <Label className="text-base font-semibold">首页文案</Label>
                <div className="grid gap-3 mt-3">
                  <div className="grid gap-2">
                    <Label htmlFor="homeTitle">首页标题</Label>
                    <Input
                      id="homeTitle"
                      value={siteDraft.home.title}
                      onChange={(e) =>
                        setSiteDraft({ ...siteDraft, home: { ...siteDraft.home, title: e.target.value } })
                      }
                      placeholder="首页标题（如 YaBlog）"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="homeSubtitle">首页副标题</Label>
                    <Input
                      id="homeSubtitle"
                      value={siteDraft.home.subtitle}
                      onChange={(e) =>
                        setSiteDraft({ ...siteDraft, home: { ...siteDraft.home, subtitle: e.target.value } })
                      }
                      placeholder="首页副标题（如 Minimal · Elegant · Powerful）"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Hero images */}
              <div>
                <Label className="text-base font-semibold">顶部图片</Label>
                <div className="grid gap-4 mt-3">
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

              <Separator />

              {/* Sidebar author card */}
              <div>
                <Label className="text-base font-semibold">侧边栏作者卡片</Label>
                <div className="grid gap-3 mt-3">
                  <ImageField
                    label="头像"
                    value={siteDraft.sidebar.avatarUrl}
                    onChange={(v) => setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, avatarUrl: v } })}
                  />
                  <div className="grid gap-2">
                    <Label htmlFor="sidebarName">昵称</Label>
                    <Input
                      id="sidebarName"
                      value={siteDraft.sidebar.name}
                      onChange={(e) =>
                        setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, name: e.target.value } })
                      }
                      placeholder="昵称"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sidebarBio">简介</Label>
                    <Input
                      id="sidebarBio"
                      value={siteDraft.sidebar.bio}
                      onChange={(e) =>
                        setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, bio: e.target.value } })
                      }
                      placeholder="简介"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>公告（支持 Markdown）</Label>
                    <MarkdownEditor
                      value={siteDraft.sidebar.noticeMd}
                      onChange={(v) => setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, noticeMd: v } })}
                      minHeight={260}
                    />
                  </div>

                  {/* Follow buttons */}
                  <div>
                    <Label className="text-sm text-muted-foreground">Follow 按钮</Label>
                    <div className="grid gap-3 mt-2">
                      {siteDraft.sidebar.followButtons.map((b, i) => (
                        <div key={`${b.label}-${i}`} className="grid grid-cols-[1fr_1.6fr_auto] gap-2 items-center">
                          <Input
                            value={b.label}
                            onChange={(e) => {
                              const next = [...siteDraft.sidebar.followButtons];
                              next[i] = { ...next[i], label: e.target.value };
                              setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, followButtons: next } });
                            }}
                            placeholder="按钮文字"
                          />
                          <Input
                            value={b.url}
                            onChange={(e) => {
                              const next = [...siteDraft.sidebar.followButtons];
                              next[i] = { ...next[i], url: e.target.value };
                              setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, followButtons: next } });
                            }}
                            placeholder="链接（/about 或 https://...）"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const next = siteDraft.sidebar.followButtons.filter((_, idx) => idx !== i);
                              setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, followButtons: next } });
                            }}
                          >
                            删除
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-fit"
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
                      </Button>
                    </div>
                  </div>

                  {/* Social icons */}
                  <div>
                    <Label className="text-sm text-muted-foreground">社媒图标（type 可用：github / youtube / rss / link）</Label>
                    <div className="grid gap-3 mt-2">
                      {siteDraft.sidebar.socials.map((s, i) => (
                        <div key={`${s.type}-${i}`} className="grid grid-cols-[0.8fr_1.8fr_1fr_auto] gap-2 items-center">
                          <Input
                            value={s.type}
                            onChange={(e) => {
                              const next = [...siteDraft.sidebar.socials];
                              next[i] = { ...next[i], type: e.target.value };
                              setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, socials: next } });
                            }}
                            placeholder="type"
                          />
                          <Input
                            value={s.url}
                            onChange={(e) => {
                              const next = [...siteDraft.sidebar.socials];
                              next[i] = { ...next[i], url: e.target.value };
                              setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, socials: next } });
                            }}
                            placeholder="https://..."
                          />
                          <Input
                            value={s.label ?? ""}
                            onChange={(e) => {
                              const next = [...siteDraft.sidebar.socials];
                              next[i] = { ...next[i], label: e.target.value || undefined };
                              setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, socials: next } });
                            }}
                            placeholder="提示文字（可空）"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const next = siteDraft.sidebar.socials.filter((_, idx) => idx !== i);
                              setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, socials: next } });
                            }}
                          >
                            删除
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-fit"
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
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* About page */}
              <div>
                <Label className="text-base font-semibold">关于页（独立，不出现在文章列表）</Label>
                <div className="grid gap-3 mt-3">
                  <div className="grid gap-2">
                    <Label htmlFor="aboutTitle">关于页标题</Label>
                    <Input
                      id="aboutTitle"
                      value={siteDraft.about.title}
                      onChange={(e) => setSiteDraft({ ...siteDraft, about: { ...siteDraft.about, title: e.target.value } })}
                      placeholder="关于页标题"
                    />
                  </div>
                  <MarkdownEditor
                    value={siteDraft.about.contentMd}
                    onChange={(v) => setSiteDraft({ ...siteDraft, about: { ...siteDraft.about, contentMd: v } })}
                    minHeight={360}
                  />
                </div>
              </div>

              <Separator />

              {/* Hotlink protection */}
              <div>
                <Label className="text-base font-semibold">防盗链</Label>
                <div className="grid gap-3 mt-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Checkbox
                      id="hotlinkEnabled"
                      checked={siteDraft.security.hotlink.enabled}
                      onCheckedChange={(checked) =>
                        setSiteDraft({
                          ...siteDraft,
                          security: { ...siteDraft.security, hotlink: { ...siteDraft.security.hotlink, enabled: !!checked } },
                        })
                      }
                    />
                    <Label htmlFor="hotlinkEnabled" className="font-normal">
                      开启图片防盗链（阻止非允许站点直接引用 /uploads）
                    </Label>
                  </div>
                  <Textarea
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
                  <p className="text-sm text-muted-foreground">不填写则仅允许本站域名引用；无 Referer 的请求默认放行。</p>
                </div>
              </div>

              <Separator />

              {/* Cloudflare cache */}
              <div>
                <Label className="text-base font-semibold">Cloudflare 缓存自动刷新</Label>
                {!cfDraft ? (
                  <p className="text-sm text-muted-foreground mt-2">加载 Cloudflare 设置中…</p>
                ) : (
                  <div className="grid gap-3 mt-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Checkbox
                        id="cfEnabled"
                        checked={cfDraft.enabled}
                        onCheckedChange={(checked) => setCfDraft({ ...cfDraft, enabled: !!checked })}
                      />
                      <Label htmlFor="cfEnabled" className="font-normal">
                        启用 Cloudflare Purge（通过邮箱 + Global API Key + Zone ID 自动刷新缓存）
                      </Label>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <Checkbox
                        id="cfAutoPurge"
                        checked={cfDraft.autoPurge}
                        onCheckedChange={(checked) => setCfDraft({ ...cfDraft, autoPurge: !!checked })}
                        disabled={!cfDraft.enabled}
                      />
                      <Label htmlFor="cfAutoPurge" className="font-normal">
                        网页内容更新时自动刷新（发布/修改文章、站点设置、替换图片等）
                      </Label>
                    </div>

                    <Input
                      value={cfDraft.email}
                      onChange={(e) => setCfDraft({ ...cfDraft, email: e.target.value })}
                      placeholder="Cloudflare 邮箱（Email）"
                    />
                    <Input
                      type="password"
                      value={cfDraft.apiKey}
                      onChange={(e) => setCfDraft({ ...cfDraft, apiKey: e.target.value })}
                      placeholder="Cloudflare Global API Key（敏感，仅保存在服务器）"
                    />
                    <Input
                      value={cfDraft.zoneId}
                      onChange={(e) => setCfDraft({ ...cfDraft, zoneId: e.target.value })}
                      placeholder="Zone ID（域名区域 / Zone Identifier）"
                    />

                    <div className="flex gap-3 items-center flex-wrap">
                      <Button variant="outline" onClick={saveCloudflare} disabled={cfBusy}>
                        {cfBusy ? "保存中…" : "保存 Cloudflare 设置"}
                      </Button>
                      <Button variant="outline" onClick={purgeCloudflare} disabled={cfBusy || !cfDraft.enabled}>
                        {cfBusy ? "处理中…" : "立即刷新缓存"}
                      </Button>
                      {cfMsg ? <span className="text-sm text-green-600">{cfMsg}</span> : null}
                      {cfErr ? <span className="text-sm text-red-600">{cfErr}</span> : null}
                    </div>

                    <p className="text-sm text-muted-foreground">
                      重要：若 Cloudflare 开了 <code>Cache Everything</code> 或忽略源站缓存头，请在 Cloudflare 里对{" "}
                      <code>/admin*</code>、<code>/api*</code> 设置 <code>Bypass cache</code>，否则后台仍可能被缓存。
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Save site button */}
              <div className="flex gap-3 items-center flex-wrap">
                <Button onClick={saveSite} disabled={siteBusy}>
                  {siteBusy ? "保存中…" : "保存站点设置"}
                </Button>
                {siteMsg ? <span className="text-sm text-green-600">{siteMsg}</span> : null}
                {siteErr ? <span className="text-sm text-red-600">{siteErr}</span> : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── AI Settings ── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>AI 对话</CardTitle>
        </CardHeader>
        <CardContent>
          {!aiDraft ? (
            <p className="text-sm text-muted-foreground">加载 AI 设置中…</p>
          ) : (
            <div className="grid gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Checkbox
                  id="aiEnabled"
                  checked={aiDraft.enabled}
                  onCheckedChange={(checked) => setAiDraft({ ...aiDraft, enabled: !!checked })}
                />
                <Label htmlFor="aiEnabled" className="font-normal">
                  启用 AI 对话（/ai 页面）
                </Label>
              </div>

              <div className="grid gap-2">
                <Label>模式（auto 会根据 apiBase/报错自动切换到 Codex CLI）</Label>
                <select
                  value={aiDraft.mode}
                  onChange={(e) => setAiDraft({ ...aiDraft, mode: e.target.value as any })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="auto">auto</option>
                  <option value="http">http（直连 OpenAI/兼容接口）</option>
                  <option value="codex">codex（本机 codex exec）</option>
                </select>
              </div>

              <div className="grid gap-3">
                <Input
                  value={aiDraft.model}
                  onChange={(e) => setAiDraft({ ...aiDraft, model: e.target.value })}
                  placeholder="模型（例如 gpt-4o-mini）"
                />
                <Input
                  value={aiDraft.apiBase}
                  onChange={(e) => setAiDraft({ ...aiDraft, apiBase: e.target.value })}
                  placeholder="apiBase（例如 https://api.openai.com/v1 或你的兼容接口 /v1）"
                />
                <Input
                  type="password"
                  value={aiDraft.apiKey}
                  onChange={(e) => setAiDraft({ ...aiDraft, apiKey: e.target.value })}
                  placeholder="apiKey（服务器端保存，仅后台可见）"
                />
                <Input
                  type="number"
                  value={aiDraft.timeoutMs}
                  onChange={(e) => setAiDraft({ ...aiDraft, timeoutMs: Number(e.target.value) || 60000 })}
                  placeholder="超时（ms）"
                />
              </div>

              <Separator />

              <div>
                <Label className="text-sm text-muted-foreground">Codex CLI（可选：粘贴 config.toml / auth.json；不填则用自动生成的最小 config.toml）</Label>
                <div className="grid gap-3 mt-2">
                  <div className="grid gap-2">
                    <Label>codex config.toml</Label>
                    <Textarea
                      value={aiDraft.codex.configToml}
                      onChange={(e) => setAiDraft({ ...aiDraft, codex: { ...aiDraft.codex, configToml: e.target.value } })}
                      rows={8}
                      placeholder={'[providers.openai]\nname="openai"\nbase_url="https://.../v1"\nenv_key="GPT_API_KEY"\nwire_api="responses"'}
                      className="font-mono"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>codex auth.json</Label>
                    <Textarea
                      value={aiDraft.codex.authJson}
                      onChange={(e) => setAiDraft({ ...aiDraft, codex: { ...aiDraft.codex, authJson: e.target.value } })}
                      rows={6}
                      placeholder="{ ... }"
                      className="font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      value={aiDraft.codex.envKey}
                      onChange={(e) => setAiDraft({ ...aiDraft, codex: { ...aiDraft.codex, envKey: e.target.value } })}
                      placeholder="env_key（默认 GPT_API_KEY）"
                    />
                    <select
                      value={aiDraft.codex.wireApi}
                      onChange={(e) => setAiDraft({ ...aiDraft, codex: { ...aiDraft.codex, wireApi: e.target.value as any } })}
                      title="wire_api"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="responses">responses</option>
                      <option value="chat">chat</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 items-center flex-wrap">
                <Button onClick={saveAi} disabled={aiBusy}>
                  {aiBusy ? "保存中…" : "保存 AI 设置"}
                </Button>
                {aiMsg ? <span className="text-sm text-green-600">{aiMsg}</span> : null}
                {aiErr ? <span className="text-sm text-red-600">{aiErr}</span> : null}
              </div>
              <p className="text-sm text-muted-foreground">提示：使用 codex 模式需要服务器环境里存在 `codex` 命令（Codex CLI）。</p>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayoutWrapper>
  );
}
