import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { AiSettings, api, CloudflareSettings } from "../../api";
import { ImageField } from "../../components/ImageField";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { useSite } from "../../site";
import { AdminLayoutWrapper, AdminNav, useMe } from "./AdminLayout";
import "../../admin.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

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

function StatusMsg({ msg, err }: { msg?: string | null; err?: string | null }) {
  return (
    <>
      {msg ? <span className="text-sm font-medium text-green-600">{msg}</span> : null}
      {err ? <span className="text-sm font-medium text-destructive">{err}</span> : null}
    </>
  );
}

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

      <div className="grid gap-5">
        {/* ═══════════════ Account & Backup (2-col) ═══════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Account */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">修改账户信息</CardTitle>
              <CardDescription>更改管理员用户名或密码</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="currentPassword" className="text-xs text-muted-foreground">当前授权密码</Label>
                <Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="输入当前密码" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="newUsername" className="text-xs text-muted-foreground">新用户名（留空不改）</Label>
                <Input id="newUsername" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="新用户名" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="newPassword" className="text-xs text-muted-foreground">新密码（留空不改，至少 8 位）</Label>
                <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="新密码" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="confirmPassword" className="text-xs text-muted-foreground">确认新密码</Label>
                <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再次输入新密码" />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Button onClick={onSave} disabled={saving} size="sm">{saving ? "保存中..." : "保存更改"}</Button>
                <StatusMsg msg={msg} err={err} />
              </div>
            </CardContent>
          </Card>

          {/* Backup */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">数据维护</CardTitle>
              <CardDescription>数据库备份与恢复</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">备份全部文章和数据</p>
                <Button variant="outline" size="sm" onClick={onDownloadBackup}>下载数据库备份</Button>
                {backupErr ? <p className="text-sm text-destructive mt-2">{backupErr}</p> : null}
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-2">恢复数据（危险操作）</p>
                <input type="file" onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)} accept=".db,.gz,.db.gz" className="block mb-2 text-sm" />
                <div className="flex items-center gap-3">
                  <Button variant="destructive" size="sm" onClick={onRestore} disabled={restoreBusy || !restoreFile}>
                    {restoreBusy ? "恢复中..." : "覆盖并恢复"}
                  </Button>
                  <StatusMsg msg={restoreMsg} err={restoreErr} />
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-2">全量备份/恢复（含图片库 + 哈希校验）</p>
                <div className="flex gap-2 mb-2">
                  <Button variant="outline" size="sm" onClick={onDownloadFullBackup}>下载全量备份</Button>
                </div>
                <input type="file" onChange={(e) => setRestoreFullFile(e.target.files?.[0] ?? null)} accept=".tar.gz,application/gzip" className="block mb-2 text-sm" />
                <div className="flex items-center gap-3">
                  <Button variant="destructive" size="sm" onClick={onRestoreFull} disabled={restoreFullBusy || !restoreFullFile}>
                    {restoreFullBusy ? "全量恢复中..." : "上传并全量恢复"}
                  </Button>
                  <StatusMsg msg={restoreFullMsg} err={restoreFullErr} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══════════════ Site Settings Section ═══════════════ */}
        {!siteDraft ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">加载站点设置中…</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Section header */}
            <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
              <div>
                <h3 className="text-lg font-bold">站点外观与内容</h3>
                <p className="text-sm text-muted-foreground">以下所有设置通过底部「保存站点设置」按钮统一保存</p>
              </div>
            </div>

            {/* ── Navigation & Branding ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">导航栏与品牌</CardTitle>
                <CardDescription>配置顶部导航标签、品牌文字</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="brandText" className="text-xs text-muted-foreground">左上角品牌文字</Label>
                  <Input
                    id="brandText"
                    value={siteDraft.nav.brandText}
                    onChange={(e) => setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, brandText: e.target.value } })}
                    placeholder="例如 YaBlog"
                  />
                </div>

                <Separator />

                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">导航标签</Label>
                  <div className="grid gap-2">
                    {siteDraft.nav.links.map((item, i) => (
                      <div key={`${item.path}-${i}`} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center p-3 rounded-lg border border-border/50 bg-muted/20">
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">文字</span>
                          <Input
                            value={item.label}
                            onChange={(e) => {
                              const next = [...siteDraft.nav.links];
                              next[i] = { ...next[i], label: e.target.value };
                              setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, links: next } });
                            }}
                            placeholder="标签文字"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">路径</span>
                          <div className="flex gap-1.5">
                            <select
                              value={NAV_PATH_OPTIONS.some((p) => p.path === item.path) ? item.path : ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                const next = [...siteDraft.nav.links];
                                next[i] = { ...next[i], path: v || next[i].path };
                                setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, links: next } });
                              }}
                              title="选择页面路径"
                              className={selectCls + " h-8 text-sm"}
                            >
                              <option value="">自定义…</option>
                              {NAV_PATH_OPTIONS.map((p) => (
                                <option key={p.path} value={p.path}>{p.label}</option>
                              ))}
                            </select>
                            <Input
                              value={item.path}
                              onChange={(e) => {
                                const next = [...siteDraft.nav.links];
                                next[i] = { ...next[i], path: e.target.value };
                                setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, links: next } });
                              }}
                              placeholder="/path"
                              className="h-8 text-sm flex-1"
                            />
                          </div>
                        </div>
                        <div className="flex items-end gap-1.5 sm:pb-0 pb-0">
                          <div className="grid gap-1">
                            <span className="text-xs text-muted-foreground">图标</span>
                            <select
                              value={item.icon}
                              onChange={(e) => {
                                const next = [...siteDraft.nav.links];
                                next[i] = { ...next[i], icon: e.target.value };
                                setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, links: next } });
                              }}
                              title="图标"
                              className={selectCls + " h-8 text-sm w-[120px]"}
                            >
                              {NAV_ICON_OPTIONS.map((opt) => (
                                <option key={opt.key} value={opt.key}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="text-destructive h-8" onClick={() => {
                            const next = siteDraft.nav.links.filter((_, idx) => idx !== i);
                            setSiteDraft({ ...siteDraft, nav: { ...siteDraft.nav, links: next } });
                          }}>
                            删除
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() =>
                      setSiteDraft({
                        ...siteDraft,
                        nav: { ...siteDraft.nav, links: [...siteDraft.nav.links, { label: "新标签", path: "/", icon: "link" }] },
                      })
                    }>
                      + 添加导航标签
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Browser Tab / Favicon ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">浏览器标签栏</CardTitle>
                <CardDescription>标签页标题、Favicon 图标</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="tabTitle" className="text-xs text-muted-foreground">标签页标题</Label>
                    <Input
                      id="tabTitle"
                      value={siteDraft.tab.title}
                      onChange={(e) => setSiteDraft({ ...siteDraft, tab: { ...siteDraft.tab, title: e.target.value } })}
                      placeholder="浏览器标签页标题"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="awayTitle" className="text-xs text-muted-foreground">切走时的标题</Label>
                    <Input
                      id="awayTitle"
                      value={siteDraft.tab.awayTitle}
                      onChange={(e) => setSiteDraft({ ...siteDraft, tab: { ...siteDraft.tab, awayTitle: e.target.value } })}
                      placeholder="用户切走/最小化时的标题"
                    />
                  </div>
                </div>
                <ImageField
                  label="Favicon 图标（可留空）"
                  value={siteDraft.tab.faviconUrl}
                  onChange={(v) => setSiteDraft({ ...siteDraft, tab: { ...siteDraft.tab, faviconUrl: v } })}
                  help="建议 32x32 或 64x64 的正方形 PNG/WebP"
                />
                <p className="text-xs text-muted-foreground">用户切走标签页时，标题会自动切换为「切走时的标题」。</p>
              </CardContent>
            </Card>

            {/* ── Home & Footer ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">首页文案</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="homeTitle" className="text-xs text-muted-foreground">标题</Label>
                    <Input
                      id="homeTitle"
                      value={siteDraft.home.title}
                      onChange={(e) => setSiteDraft({ ...siteDraft, home: { ...siteDraft.home, title: e.target.value } })}
                      placeholder="首页大标题"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="homeSubtitle" className="text-xs text-muted-foreground">副标题</Label>
                    <Input
                      id="homeSubtitle"
                      value={siteDraft.home.subtitle}
                      onChange={(e) => setSiteDraft({ ...siteDraft, home: { ...siteDraft.home, subtitle: e.target.value } })}
                      placeholder="Minimal · Elegant · Powerful"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">底部 Footer</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Textarea
                    value={siteDraft.footer.text}
                    onChange={(e) => setSiteDraft({ ...siteDraft, footer: { ...siteDraft.footer, text: e.target.value } })}
                    rows={3}
                    placeholder="© {year} YaBlog · Designed with Butterfly Style"
                  />
                  <p className="text-xs text-muted-foreground">支持占位符：{`{year}`} 自动替换为当前年份</p>
                </CardContent>
              </Card>
            </div>

            {/* ── Hero Images ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">顶部图片</CardTitle>
                <CardDescription>各页面的顶部横幅图片</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ImageField label="首页顶部" value={siteDraft.images.homeHero} onChange={(v) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, homeHero: v } })} />
                  <ImageField label="归档页顶部" value={siteDraft.images.archiveHero} onChange={(v) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, archiveHero: v } })} />
                  <ImageField label="标签/分类顶部" value={siteDraft.images.tagsHero} onChange={(v) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, tagsHero: v } })} />
                  <ImageField label="关于页顶部" value={siteDraft.images.aboutHero} onChange={(v) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, aboutHero: v } })} />
                  <ImageField label="文章默认封面" value={siteDraft.images.defaultPostCover} onChange={(v) => setSiteDraft({ ...siteDraft, images: { ...siteDraft.images, defaultPostCover: v } })} />
                </div>
              </CardContent>
            </Card>

            {/* ── Sidebar Author Card ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">侧边栏作者卡片</CardTitle>
                <CardDescription>头像、昵称、简介、公告、关注按钮、社媒图标</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                {/* Basic info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ImageField label="头像" value={siteDraft.sidebar.avatarUrl} onChange={(v) => setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, avatarUrl: v } })} />
                  <div className="grid gap-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground">昵称</Label>
                      <Input value={siteDraft.sidebar.name} onChange={(e) => setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, name: e.target.value } })} placeholder="昵称" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground">简介</Label>
                      <Input value={siteDraft.sidebar.bio} onChange={(e) => setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, bio: e.target.value } })} placeholder="一句话简介" />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Notice */}
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">公告（支持 Markdown）</Label>
                  <MarkdownEditor
                    value={siteDraft.sidebar.noticeMd}
                    onChange={(v) => setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, noticeMd: v } })}
                    minHeight={200}
                  />
                </div>

                <Separator />

                {/* Follow buttons */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Follow 按钮</Label>
                  <div className="grid gap-2">
                    {siteDraft.sidebar.followButtons.map((b, i) => (
                      <div key={`${b.label}-${i}`} className="flex gap-2 items-center">
                        <Input
                          value={b.label}
                          onChange={(e) => {
                            const next = [...siteDraft.sidebar.followButtons];
                            next[i] = { ...next[i], label: e.target.value };
                            setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, followButtons: next } });
                          }}
                          placeholder="按钮文字"
                          className="h-8 text-sm w-[120px]"
                        />
                        <Input
                          value={b.url}
                          onChange={(e) => {
                            const next = [...siteDraft.sidebar.followButtons];
                            next[i] = { ...next[i], url: e.target.value };
                            setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, followButtons: next } });
                          }}
                          placeholder="链接 URL"
                          className="h-8 text-sm flex-1"
                        />
                        <Button type="button" variant="ghost" size="sm" className="text-destructive h-8 px-2" onClick={() => {
                          const next = siteDraft.sidebar.followButtons.filter((_, idx) => idx !== i);
                          setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, followButtons: next } });
                        }}>
                          删除
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() =>
                      setSiteDraft({
                        ...siteDraft,
                        sidebar: { ...siteDraft.sidebar, followButtons: [...siteDraft.sidebar.followButtons, { label: "新按钮", url: "https://" }] },
                      })
                    }>
                      + 添加按钮
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Social icons */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">社媒图标（type: github / youtube / rss / link）</Label>
                  <div className="grid gap-2">
                    {siteDraft.sidebar.socials.map((s, i) => (
                      <div key={`${s.type}-${i}`} className="flex gap-2 items-center flex-wrap">
                        <Input
                          value={s.type}
                          onChange={(e) => {
                            const next = [...siteDraft.sidebar.socials];
                            next[i] = { ...next[i], type: e.target.value };
                            setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, socials: next } });
                          }}
                          placeholder="type"
                          className="h-8 text-sm w-[100px]"
                        />
                        <Input
                          value={s.url}
                          onChange={(e) => {
                            const next = [...siteDraft.sidebar.socials];
                            next[i] = { ...next[i], url: e.target.value };
                            setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, socials: next } });
                          }}
                          placeholder="https://..."
                          className="h-8 text-sm flex-1 min-w-[180px]"
                        />
                        <Input
                          value={s.label ?? ""}
                          onChange={(e) => {
                            const next = [...siteDraft.sidebar.socials];
                            next[i] = { ...next[i], label: e.target.value || undefined };
                            setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, socials: next } });
                          }}
                          placeholder="提示文字"
                          className="h-8 text-sm w-[120px]"
                        />
                        <Button type="button" variant="ghost" size="sm" className="text-destructive h-8 px-2" onClick={() => {
                          const next = siteDraft.sidebar.socials.filter((_, idx) => idx !== i);
                          setSiteDraft({ ...siteDraft, sidebar: { ...siteDraft.sidebar, socials: next } });
                        }}>
                          删除
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() =>
                      setSiteDraft({
                        ...siteDraft,
                        sidebar: { ...siteDraft.sidebar, socials: [...siteDraft.sidebar.socials, { type: "github", url: "https://github.com/" }] },
                      })
                    }>
                      + 添加社媒
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── About Page ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">关于页</CardTitle>
                <CardDescription>独立页面，不出现在文章列表中</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="aboutTitle" className="text-xs text-muted-foreground">页面标题</Label>
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
              </CardContent>
            </Card>

            {/* ── Hotlink Protection ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">防盗链</CardTitle>
                <CardDescription>阻止外站直接引用 /uploads 下的图片资源</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
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
                  <Label htmlFor="hotlinkEnabled" className="font-normal text-sm">
                    开启图片防盗链
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
                          allowedOrigins: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                        },
                      },
                    })
                  }
                  placeholder={"允许的 Origin（每行一个），例如：\nhttps://yourdomain.com"}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">不填写则仅允许本站域名引用；无 Referer 的请求默认放行。</p>
              </CardContent>
            </Card>

            {/* ── Save Site Settings (prominent) ── */}
            <div className="flex items-center gap-3 flex-wrap p-4 rounded-xl bg-card border border-border">
              <Button onClick={saveSite} disabled={siteBusy}>
                {siteBusy ? "保存中…" : "保存站点设置"}
              </Button>
              <StatusMsg msg={siteMsg} err={siteErr} />
              <span className="text-xs text-muted-foreground">以上所有「站点外观与内容」设置将统一保存</span>
            </div>
          </>
        )}

        {/* ═══════════════ Cloudflare ═══════════════ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cloudflare 缓存</CardTitle>
            <CardDescription>自动刷新 CDN 缓存（通过邮箱 + Global API Key + Zone ID）</CardDescription>
          </CardHeader>
          <CardContent>
            {!cfDraft ? (
              <p className="text-sm text-muted-foreground">加载 Cloudflare 设置中…</p>
            ) : (
              <div className="grid gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <Checkbox id="cfEnabled" checked={cfDraft.enabled} onCheckedChange={(checked) => setCfDraft({ ...cfDraft, enabled: !!checked })} />
                    <Label htmlFor="cfEnabled" className="font-normal text-sm">启用 Cloudflare Purge</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox id="cfAutoPurge" checked={cfDraft.autoPurge} onCheckedChange={(checked) => setCfDraft({ ...cfDraft, autoPurge: !!checked })} disabled={!cfDraft.enabled} />
                    <Label htmlFor="cfAutoPurge" className="font-normal text-sm">内容更新时自动刷新</Label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">邮箱</Label>
                    <Input value={cfDraft.email} onChange={(e) => setCfDraft({ ...cfDraft, email: e.target.value })} placeholder="Cloudflare 邮箱" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Global API Key</Label>
                    <Input type="password" value={cfDraft.apiKey} onChange={(e) => setCfDraft({ ...cfDraft, apiKey: e.target.value })} placeholder="API Key（仅服务器保存）" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Zone ID</Label>
                    <Input value={cfDraft.zoneId} onChange={(e) => setCfDraft({ ...cfDraft, zoneId: e.target.value })} placeholder="Zone Identifier" />
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Button variant="outline" size="sm" onClick={saveCloudflare} disabled={cfBusy}>{cfBusy ? "保存中…" : "保存 CF 设置"}</Button>
                  <Button variant="outline" size="sm" onClick={purgeCloudflare} disabled={cfBusy || !cfDraft.enabled}>{cfBusy ? "处理中…" : "立即刷新缓存"}</Button>
                  <StatusMsg msg={cfMsg} err={cfErr} />
                </div>

                <p className="text-xs text-muted-foreground">
                  提示：若 Cloudflare 开启了 <code className="px-1 py-0.5 bg-muted rounded text-xs">Cache Everything</code>，请对 <code className="px-1 py-0.5 bg-muted rounded text-xs">/admin*</code> 和 <code className="px-1 py-0.5 bg-muted rounded text-xs">/api*</code> 设置 Bypass cache。
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══════════════ AI Settings ═══════════════ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">AI 对话</CardTitle>
            <CardDescription>配置 /ai 页面的 AI 对话功能</CardDescription>
          </CardHeader>
          <CardContent>
            {!aiDraft ? (
              <p className="text-sm text-muted-foreground">加载 AI 设置中…</p>
            ) : (
              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <Checkbox id="aiEnabled" checked={aiDraft.enabled} onCheckedChange={(checked) => setAiDraft({ ...aiDraft, enabled: !!checked })} />
                  <Label htmlFor="aiEnabled" className="font-normal text-sm">启用 AI 对话（/ai 页面）</Label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">模式</Label>
                    <select
                      value={aiDraft.mode}
                      onChange={(e) => setAiDraft({ ...aiDraft, mode: e.target.value as any })}
                      className={selectCls}
                    >
                      <option value="auto">auto（自动切换）</option>
                      <option value="http">http（直连接口）</option>
                      <option value="codex">codex（本机 CLI）</option>
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">模型</Label>
                    <Input value={aiDraft.model} onChange={(e) => setAiDraft({ ...aiDraft, model: e.target.value })} placeholder="gpt-4o-mini" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">API Base URL</Label>
                    <Input value={aiDraft.apiBase} onChange={(e) => setAiDraft({ ...aiDraft, apiBase: e.target.value })} placeholder="https://api.openai.com/v1" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">API Key</Label>
                    <Input type="password" value={aiDraft.apiKey} onChange={(e) => setAiDraft({ ...aiDraft, apiKey: e.target.value })} placeholder="sk-..." />
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">超时（ms）</Label>
                  <Input type="number" value={aiDraft.timeoutMs} onChange={(e) => setAiDraft({ ...aiDraft, timeoutMs: Number(e.target.value) || 60000 })} className="w-[200px]" />
                </div>

                <Separator />

                {/* Codex CLI */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Codex CLI 配置（可选）</Label>
                  <div className="grid gap-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label className="text-xs text-muted-foreground">config.toml</Label>
                        <Textarea
                          value={aiDraft.codex.configToml}
                          onChange={(e) => setAiDraft({ ...aiDraft, codex: { ...aiDraft.codex, configToml: e.target.value } })}
                          rows={6}
                          placeholder={'[providers.openai]\nname="openai"\nbase_url="https://.../v1"'}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs text-muted-foreground">auth.json</Label>
                        <Textarea
                          value={aiDraft.codex.authJson}
                          onChange={(e) => setAiDraft({ ...aiDraft, codex: { ...aiDraft.codex, authJson: e.target.value } })}
                          rows={6}
                          placeholder="{ ... }"
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label className="text-xs text-muted-foreground">env_key</Label>
                        <Input value={aiDraft.codex.envKey} onChange={(e) => setAiDraft({ ...aiDraft, codex: { ...aiDraft.codex, envKey: e.target.value } })} placeholder="GPT_API_KEY" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs text-muted-foreground">wire_api</Label>
                        <select
                          value={aiDraft.codex.wireApi}
                          onChange={(e) => setAiDraft({ ...aiDraft, codex: { ...aiDraft.codex, wireApi: e.target.value as any } })}
                          className={selectCls}
                        >
                          <option value="responses">responses</option>
                          <option value="chat">chat</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Button onClick={saveAi} disabled={aiBusy} size="sm">{aiBusy ? "保存中…" : "保存 AI 设置"}</Button>
                  <StatusMsg msg={aiMsg} err={aiErr} />
                </div>
                <p className="text-xs text-muted-foreground">使用 codex 模式需要服务器环境中存在 <code className="px-1 py-0.5 bg-muted rounded text-xs">codex</code> 命令。</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayoutWrapper>
  );
}
