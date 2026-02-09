import { useCallback, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, Link as FriendLink, LinkRequest } from "../../api";
import { Markdown } from "../../components/Markdown";
import { AdminLayoutWrapper, AdminNav, useMe } from "./AdminLayout";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AdminLinksPage() {
  const { user, loading } = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  if (loading) return <div className="container" style={{ padding: "26px 0" }}>加载中…</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  const onLogout = async () => {
    await api.logout().catch(() => {});
    navigate("/admin/login", { replace: true });
  };
  return (
    <AdminLayoutWrapper>
      <AdminNav onLogout={onLogout} />
      <AdminLinksPanel />
    </AdminLayoutWrapper>
  );
}

function AdminLinksPanel() {
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
    title: "", url: "", description: "", iconUrl: "", sortOrder: 0,
  });

  const refreshLinks = useCallback(async () => {
    setLinksLoading(true); setLinksErr(null);
    try { const res = await api.adminListLinks(); setLinks(res.items); }
    catch (e: any) { setLinksErr(e?.message ?? String(e)); }
    finally { setLinksLoading(false); }
  }, []);

  const refreshRequests = useCallback(async () => {
    setReqLoading(true); setReqErr(null);
    try { const res = await api.adminListLinkRequests({ status: reqStatus }); setRequests(res.items); }
    catch (e: any) { setReqErr(e?.message ?? String(e)); }
    finally { setReqLoading(false); }
  }, [reqStatus]);

  useEffect(() => { refreshLinks(); }, [refreshLinks]);
  useEffect(() => { refreshRequests(); }, [refreshRequests]);

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
    <Card>
      <CardContent className="p-6">
        <div className="flex justify-between items-center gap-3 flex-wrap mb-5">
          <div>
            <h2 className="text-xl font-bold">友情链接</h2>
            <p className="text-sm text-muted-foreground">链接列表 + 友链申请审核</p>
          </div>
          <div className="flex gap-2">
            <Button variant={tab === "links" ? "default" : "outline"} size="sm" onClick={() => setTab("links")}>链接</Button>
            <Button variant={tab === "requests" ? "default" : "outline"} size="sm" onClick={() => setTab("requests")}>申请</Button>
          </div>
        </div>

        {tab === "links" ? (
          <>
            {linksErr ? <div className="text-sm text-destructive mb-3">错误：{linksErr}</div> : null}

            <div className="rounded-xl border border-border p-4 mb-4">
              <div className="flex justify-between items-center gap-3 flex-wrap mb-3">
                <span className="font-bold">新增友情链接</span>
                <Button variant="ghost" size="sm" onClick={refreshLinks} disabled={linksLoading}>刷新</Button>
              </div>
              <div className="grid gap-2">
                <Input value={newLink.title} onChange={(e) => setNewLink({ ...newLink, title: e.target.value })} placeholder="标题" />
                <Input value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} placeholder="URL（https://...）" />
                <Input value={newLink.description} onChange={(e) => setNewLink({ ...newLink, description: e.target.value })} placeholder="描述（可选）" />
                <div className="flex gap-2 flex-wrap">
                  <Input value={newLink.iconUrl} onChange={(e) => setNewLink({ ...newLink, iconUrl: e.target.value })} placeholder="图标 URL（可选）" className="flex-1 min-w-0" />
                  <Button variant="outline" size="sm" disabled={busyKey === "new:icon"} onClick={async () => {
                    setBusyKey("new:icon");
                    try { const iconUrl = await detectIcon(newLink.url); setNewLink((v) => ({ ...v, iconUrl: iconUrl || v.iconUrl })); }
                    catch (e: any) { setLinksErr(e?.message ?? String(e)); }
                    finally { setBusyKey(null); }
                  }}>识别图标</Button>
                  <Input value={String(newLink.sortOrder)} onChange={(e) => setNewLink({ ...newLink, sortOrder: Number(e.target.value || "0") })} placeholder="排序" className="w-[120px]" />
                </div>
                <div className="flex justify-end">
                  <Button disabled={busyKey === "new:create"} onClick={async () => {
                    const title = newLink.title.trim();
                    const url = newLink.url.trim();
                    if (!title || !url) return;
                    setBusyKey("new:create");
                    try {
                      await api.adminCreateLink({ title, url, description: newLink.description.trim(), iconUrl: newLink.iconUrl.trim(), sortOrder: newLink.sortOrder || 0 });
                      setNewLink({ title: "", url: "", description: "", iconUrl: "", sortOrder: 0 });
                      await refreshLinks();
                    } catch (e: any) { setLinksErr(e?.message ?? String(e)); }
                    finally { setBusyKey(null); }
                  }}>添加</Button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border border-border bg-card/80 mb-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={links.length > 0 && links.every((l) => selectedLinkIds.has(l.id))}
                  onCheckedChange={() => {
                    const all = links.length > 0 && links.every((l) => selectedLinkIds.has(l.id));
                    setSelectedLinkIds((prev) => {
                      const next = new Set(prev);
                      if (all) for (const l of links) next.delete(l.id);
                      else for (const l of links) next.add(l.id);
                      return next;
                    });
                  }}
                />
                <span className="text-sm text-muted-foreground">全选</span>
              </div>
              <span className="text-sm text-muted-foreground">{selectedLinkIds.size ? `已选 ${selectedLinkIds.size} 个` : "未选择"}</span>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" disabled={!selectedLinkIds.size || linksBulkBusy} onClick={() => setSelectedLinkIds(new Set())}>清空</Button>
              <Button variant="destructive" size="sm" disabled={!selectedLinkIds.size || linksBulkBusy} onClick={async () => {
                if (!confirm(`确定删除选中的 ${selectedLinkIds.size} 个友情链接吗？`)) return;
                setLinksBulkBusy(true);
                try {
                  await runSequential(Array.from(selectedLinkIds), async (id) => { await api.adminDeleteLink(id); });
                  setSelectedLinkIds(new Set());
                  await refreshLinks();
                } catch (e: any) { setLinksErr(e?.message ?? String(e)); }
                finally { setLinksBulkBusy(false); }
              }}>批量删除</Button>
            </div>

            {linksLoading ? <div className="text-sm text-muted-foreground">加载中…</div> : null}
            {!linksLoading && links.length === 0 ? <div className="text-sm text-muted-foreground">暂无友情链接</div> : null}

            <div className="grid gap-3">
              {links.map((l) => (
                <div key={l.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Checkbox
                      checked={selectedLinkIds.has(l.id)}
                      onCheckedChange={() => setSelectedLinkIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                        return next;
                      })}
                    />
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-accent/10 flex items-center justify-center shrink-0">
                      {l.iconUrl ? <img src={l.iconUrl} alt="" className="w-[22px] h-[22px]" /> : <span className="opacity-70 font-bold">{l.title.slice(0, 1)}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Input value={l.title} onChange={(e) => setLinks((arr) => arr.map((x) => x.id === l.id ? { ...x, title: e.target.value } : x))} placeholder="标题" />
                    </div>
                    <Input value={String(l.sortOrder)} onChange={(e) => setLinks((arr) => arr.map((x) => x.id === l.id ? { ...x, sortOrder: Number(e.target.value || "0") } : x))} placeholder="排序" className="w-[120px]" />
                  </div>
                  <div className="grid gap-2 mt-2">
                    <Input value={l.url} onChange={(e) => setLinks((arr) => arr.map((x) => x.id === l.id ? { ...x, url: e.target.value } : x))} placeholder="URL" />
                    <Input value={l.description} onChange={(e) => setLinks((arr) => arr.map((x) => x.id === l.id ? { ...x, description: e.target.value } : x))} placeholder="描述（可选）" />
                    <div className="flex gap-2 flex-wrap">
                      <Input value={l.iconUrl} onChange={(e) => setLinks((arr) => arr.map((x) => x.id === l.id ? { ...x, iconUrl: e.target.value } : x))} placeholder="图标 URL（可选）" className="flex-1 min-w-0" />
                      <Button variant="outline" size="sm" disabled={busyKey === `icon:${l.id}`} onClick={async () => {
                        setBusyKey(`icon:${l.id}`);
                        try { const iconUrl = await detectIcon(l.url); setLinks((arr) => arr.map((x) => x.id === l.id ? { ...x, iconUrl: iconUrl || x.iconUrl } : x)); }
                        catch (e: any) { setLinksErr(e?.message ?? String(e)); }
                        finally { setBusyKey(null); }
                      }}>识别图标</Button>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" disabled={busyKey === `save:${l.id}`} onClick={async () => {
                        setBusyKey(`save:${l.id}`);
                        try {
                          await api.adminUpdateLink(l.id, { title: l.title.trim(), url: l.url.trim(), description: l.description?.trim() ?? "", iconUrl: l.iconUrl?.trim() ?? "", sortOrder: l.sortOrder || 0 });
                          await refreshLinks();
                        } catch (e: any) { setLinksErr(e?.message ?? String(e)); }
                        finally { setBusyKey(null); }
                      }}>保存</Button>
                      <Button variant="ghost" size="sm" disabled={busyKey === `del:${l.id}`} onClick={async () => {
                        if (!confirm("确定删除这个友情链接吗？")) return;
                        setBusyKey(`del:${l.id}`);
                        try { await api.adminDeleteLink(l.id); await refreshLinks(); }
                        catch (e: any) { setLinksErr(e?.message ?? String(e)); }
                        finally { setBusyKey(null); }
                      }}>删除</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <span className="text-sm text-muted-foreground">状态</span>
              <select value={reqStatus} onChange={(e) => setReqStatus(e.target.value as any)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm" style={{ width: 160 }}>
                <option value="pending">待审核</option>
                <option value="approved">已通过</option>
              </select>
              <Button variant="ghost" size="sm" onClick={refreshRequests} disabled={reqLoading}>刷新</Button>
            </div>

            <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border border-border bg-card/80 mb-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={requests.length > 0 && requests.every((r) => selectedReqIds.has(r.id))}
                  onCheckedChange={() => {
                    const all = requests.length > 0 && requests.every((r) => selectedReqIds.has(r.id));
                    setSelectedReqIds((prev) => {
                      const next = new Set(prev);
                      if (all) for (const r of requests) next.delete(r.id);
                      else for (const r of requests) next.add(r.id);
                      return next;
                    });
                  }}
                />
                <span className="text-sm text-muted-foreground">全选</span>
              </div>
              <span className="text-sm text-muted-foreground">{selectedReqIds.size ? `已选 ${selectedReqIds.size} 条` : "未选择"}</span>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" disabled={!selectedReqIds.size || reqBulkBusy} onClick={() => setSelectedReqIds(new Set())}>清空</Button>
              <Button variant="ghost" size="sm" disabled={!selectedReqIds.size || reqBulkBusy} onClick={async () => {
                setReqBulkBusy(true);
                try { await runSequential(Array.from(selectedReqIds), async (id) => { await api.adminUpdateLinkRequest(id, { status: "approved" }); }); await refreshRequests(); }
                catch (e: any) { setReqErr(e?.message ?? String(e)); }
                finally { setReqBulkBusy(false); }
              }}>批量通过</Button>
              <Button variant="ghost" size="sm" disabled={!selectedReqIds.size || reqBulkBusy} onClick={async () => {
                setReqBulkBusy(true);
                try { await runSequential(Array.from(selectedReqIds), async (id) => { await api.adminUpdateLinkRequest(id, { status: "pending" }); }); await refreshRequests(); }
                catch (e: any) { setReqErr(e?.message ?? String(e)); }
                finally { setReqBulkBusy(false); }
              }}>批量驳回</Button>
              <Button size="sm" disabled={!selectedReqIds.size || reqBulkBusy} onClick={async () => {
                if (!confirm(`确定通过并加入友情链接（${selectedReqIds.size} 条）吗？`)) return;
                setReqBulkBusy(true);
                try {
                  await runSequential(Array.from(selectedReqIds), async (id) => {
                    const r = requests.find((x) => x.id === id);
                    if (!r) return;
                    const iconUrl = await detectIcon(r.url).catch(() => "");
                    await api.adminCreateLink({ title: r.name, url: r.url, description: r.description ?? "", iconUrl: iconUrl || "", sortOrder: 0 });
                    await api.adminUpdateLinkRequest(id, { status: "approved" });
                  });
                  setSelectedReqIds(new Set());
                  await Promise.all([refreshLinks(), refreshRequests()]);
                  setTab("links");
                } catch (e: any) { setReqErr(e?.message ?? String(e)); }
                finally { setReqBulkBusy(false); }
              }}>通过并加入友情链接</Button>
              <Button variant="destructive" size="sm" disabled={!selectedReqIds.size || reqBulkBusy} onClick={async () => {
                if (!confirm(`确定删除选中的 ${selectedReqIds.size} 条申请吗？`)) return;
                setReqBulkBusy(true);
                try {
                  await runSequential(Array.from(selectedReqIds), async (id) => { await api.adminDeleteLinkRequest(id); });
                  setSelectedReqIds(new Set());
                  await refreshRequests();
                } catch (e: any) { setReqErr(e?.message ?? String(e)); }
                finally { setReqBulkBusy(false); }
              }}>批量删除</Button>
            </div>

            {reqErr ? <div className="text-sm text-destructive mb-3">错误：{reqErr}</div> : null}
            {reqLoading ? <div className="text-sm text-muted-foreground">加载中…</div> : null}
            {!reqLoading && requests.length === 0 ? <div className="text-sm text-muted-foreground">暂无申请</div> : null}

            <div className="grid gap-3">
              {requests.map((r) => (
                <div key={r.id} className="rounded-xl border border-border p-4">
                  <div className="flex justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedReqIds.has(r.id)}
                          onCheckedChange={() => setSelectedReqIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                            return next;
                          })}
                        />
                        <a href={r.url} target="_blank" rel="noreferrer" className="font-bold truncate hover:underline">{r.name}</a>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{r.url} · {shortDate(r.createdAt)}</div>
                      {r.description ? <div className="text-sm text-muted-foreground mt-1">{r.description}</div> : null}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={r.status === "approved" ? "default" : "secondary"}>
                        {r.status === "approved" ? "已通过" : "待审核"}
                      </Badge>
                      <Button variant="ghost" size="sm" disabled={busyKey === `req:toggle:${r.id}`} onClick={async () => {
                        setBusyKey(`req:toggle:${r.id}`);
                        try { await api.adminUpdateLinkRequest(r.id, { status: r.status === "approved" ? "pending" : "approved" }); await refreshRequests(); }
                        catch (e: any) { setReqErr(e?.message ?? String(e)); }
                        finally { setBusyKey(null); }
                      }}>{r.status === "approved" ? "取消通过" : "通过"}</Button>
                      {r.status !== "approved" ? (
                        <Button size="sm" disabled={busyKey === `req:add:${r.id}`} onClick={async () => {
                          setBusyKey(`req:add:${r.id}`);
                          try {
                            const iconUrl = await detectIcon(r.url).catch(() => "");
                            await api.adminCreateLink({ title: r.name, url: r.url, description: r.description ?? "", iconUrl: iconUrl || "", sortOrder: 0 });
                            await api.adminUpdateLinkRequest(r.id, { status: "approved" });
                            await Promise.all([refreshLinks(), refreshRequests()]);
                            setTab("links");
                          } catch (e: any) { setReqErr(e?.message ?? String(e)); }
                          finally { setBusyKey(null); }
                        }}>通过并加入友情链接</Button>
                      ) : null}
                      <Button variant="ghost" size="sm" disabled={busyKey === `req:del:${r.id}`} onClick={async () => {
                        if (!confirm("确定删除这条申请吗？")) return;
                        setBusyKey(`req:del:${r.id}`);
                        try { await api.adminDeleteLinkRequest(r.id); await refreshRequests(); }
                        catch (e: any) { setReqErr(e?.message ?? String(e)); }
                        finally { setBusyKey(null); }
                      }}>删除</Button>
                    </div>
                  </div>

                  {r.message ? (
                    <div className="mt-3 rounded-lg border border-border p-3">
                      <div className="markdown" style={{ padding: 0, background: "transparent", border: 0 }}>
                        <Markdown value={r.message} />
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
