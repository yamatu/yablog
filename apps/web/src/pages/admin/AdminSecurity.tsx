import { useCallback, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, IpBan, SuspiciousIp } from "../../api";
import { AdminLayoutWrapper, AdminNav, useMe } from "./AdminLayout";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export function AdminSecurityPage() {
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
      <AdminSecurityPanel />
    </AdminLayoutWrapper>
  );
}

function AdminSecurityPanel() {
  const [tab, setTab] = useState<"suspicious" | "bans">("suspicious");

  const [suspicious, setSuspicious] = useState<SuspiciousIp[]>([]);
  const [susRedisEnabled, setSusRedisEnabled] = useState<boolean>(false);
  const [susErr, setSusErr] = useState<string | null>(null);
  const [susLoading, setSusLoading] = useState(true);
  const [susSelected, setSusSelected] = useState<Set<string>>(() => new Set());

  const [bans, setBans] = useState<IpBan[]>([]);
  const [banErr, setBanErr] = useState<string | null>(null);
  const [banLoading, setBanLoading] = useState(true);
  const [banSelected, setBanSelected] = useState<Set<string>>(() => new Set());

  const [reason, setReason] = useState("abuse");
  const [manualIps, setManualIps] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshSuspicious = useCallback(async () => {
    setSusLoading(true); setSusErr(null);
    try { const res = await api.adminListSuspiciousIps({ limit: 200 }); setSusRedisEnabled(res.redisEnabled); setSuspicious(res.items); }
    catch (e: any) { setSusErr(e?.message ?? String(e)); }
    finally { setSusLoading(false); }
  }, []);

  const refreshBans = useCallback(async () => {
    setBanLoading(true); setBanErr(null);
    try { const res = await api.adminListIpBans(); setBans(res.items); }
    catch (e: any) { setBanErr(e?.message ?? String(e)); }
    finally { setBanLoading(false); }
  }, []);

  useEffect(() => { refreshSuspicious(); refreshBans(); }, [refreshSuspicious, refreshBans]);

  useEffect(() => {
    setSusSelected((prev) => {
      if (!prev.size) return prev;
      const visible = new Set(suspicious.map((s) => s.ip));
      const next = new Set<string>();
      for (const ip of prev) if (visible.has(ip)) next.add(ip);
      return next;
    });
  }, [suspicious]);

  useEffect(() => {
    setBanSelected((prev) => {
      if (!prev.size) return prev;
      const visible = new Set(bans.map((b) => b.ip));
      const next = new Set<string>();
      for (const ip of prev) if (visible.has(ip)) next.add(ip);
      return next;
    });
  }, [bans]);

  const doBan = async (ips: string[]) => {
    if (!ips.length) return;
    setBusy(true);
    try { await api.adminBanIps({ ips, reason: reason.trim() }); setSusSelected(new Set()); await refreshBans(); }
    catch (e: any) { setBanErr(e?.message ?? String(e)); }
    finally { setBusy(false); }
  };

  const doUnban = async (ips: string[]) => {
    if (!ips.length) return;
    setBusy(true);
    try { await api.adminUnbanIps({ ips }); setBanSelected(new Set()); await refreshBans(); }
    catch (e: any) { setBanErr(e?.message ?? String(e)); }
    finally { setBusy(false); }
  };

  const suspiciousAllSelected = suspicious.length > 0 && suspicious.every((s) => susSelected.has(s.ip));
  const bansAllSelected = bans.length > 0 && bans.every((b) => banSelected.has(b.ip));

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex justify-between items-center gap-3 flex-wrap mb-5">
          <div>
            <h2 className="text-xl font-bold">安全中心</h2>
            <p className="text-sm text-muted-foreground">可疑 IP 统计（Redis）与批量封禁/导出</p>
          </div>
          <div className="flex gap-2">
            <Button variant={tab === "suspicious" ? "default" : "outline"} size="sm" onClick={() => setTab("suspicious")}>可疑 IP</Button>
            <Button variant={tab === "bans" ? "default" : "outline"} size="sm" onClick={() => setTab("bans")}>封禁列表</Button>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4 mb-4">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-sm text-muted-foreground">封禁原因</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason（可选）" className="w-[260px]" />
            <div className="flex-1" />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => { refreshSuspicious(); refreshBans(); }}>刷新全部</Button>
            <Button variant="outline" size="sm" disabled={busy || !susRedisEnabled}
              onClick={() => window.location.assign("/api/admin/security/suspicious.csv?limit=2000")}
              title="导出 CSV（可用于 nginx/waf 规则）">导出可疑 IP CSV</Button>
          </div>
          <span className="text-sm text-muted-foreground">手动封禁（每行一个 IP）</span>
          <div className="flex gap-2 flex-wrap items-start mt-2">
            <Textarea value={manualIps} onChange={(e) => setManualIps(e.target.value)}
              placeholder={"例如：\n1.2.3.4\n2606:4700:4700::1111"} rows={3} className="flex-1 min-w-0" />
            <Button variant="destructive" disabled={busy || !manualIps.trim()} onClick={async () => {
              const ips = manualIps.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
              await doBan(ips); setManualIps("");
            }}>批量封禁</Button>
          </div>
          {banErr ? <div className="text-sm text-destructive mt-2">{banErr}</div> : null}
        </div>

        {tab === "suspicious" ? (
          <>
            {!susRedisEnabled ? (
              <div className="rounded-xl border border-border p-4 mb-3">
                <span className="text-sm text-muted-foreground">未开启 Redis（`REDIS_URL` 为空），可疑 IP 统计不可用。</span>
              </div>
            ) : null}
            {susErr ? <div className="text-sm text-destructive mb-3">错误：{susErr}</div> : null}
            {susLoading ? <div className="text-sm text-muted-foreground">加载中…</div> : null}

            <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border border-border bg-card/80 mb-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={suspiciousAllSelected} onCheckedChange={() => {
                  setSusSelected(() => {
                    const next = new Set<string>();
                    if (!suspiciousAllSelected) for (const s of suspicious) next.add(s.ip);
                    return next;
                  });
                }} />
                <span className="text-sm text-muted-foreground">全选</span>
              </div>
              <span className="text-sm text-muted-foreground">{susSelected.size ? `已选 ${susSelected.size} 个` : "未选择"}</span>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" disabled={!susSelected.size || busy} onClick={() => setSusSelected(new Set())}>清空</Button>
              <Button variant="destructive" size="sm" disabled={!susSelected.size || busy} onClick={async () => {
                if (!confirm(`确定封禁选中的 ${susSelected.size} 个 IP 吗？`)) return;
                await doBan(Array.from(susSelected));
              }}>封禁所选</Button>
            </div>

            <div className="grid gap-2">
              {suspicious.map((s) => {
                const topCounts = Object.entries(s.counts ?? {})
                  .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                  .slice(0, 4)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" · ");
                return (
                  <div key={s.ip} className="flex items-center gap-3 flex-wrap p-3 rounded-xl border border-border">
                    <Checkbox checked={susSelected.has(s.ip)} onCheckedChange={() =>
                      setSusSelected((prev) => { const next = new Set(prev); if (next.has(s.ip)) next.delete(s.ip); else next.add(s.ip); return next; })
                    } />
                    <span className="font-bold min-w-[220px]">{s.ip}</span>
                    <Badge variant="secondary">score {s.score}</Badge>
                    <span className="text-xs text-muted-foreground">{s.lastSeen ? new Date(s.lastSeen).toLocaleString("zh-CN") : ""}</span>
                    <span className="text-xs text-muted-foreground flex-1 min-w-[240px] truncate">{topCounts}</span>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setManualIps(s.ip); setTab("bans"); }}>复制到封禁</Button>
                  </div>
                );
              })}
              {!susLoading && susRedisEnabled && suspicious.length === 0 ? <div className="text-sm text-muted-foreground">暂无可疑 IP</div> : null}
            </div>
          </>
        ) : (
          <>
            {banLoading ? <div className="text-sm text-muted-foreground">加载中…</div> : null}
            {banErr ? <div className="text-sm text-destructive mb-3">错误：{banErr}</div> : null}

            <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border border-border bg-card/80 mb-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={bansAllSelected} onCheckedChange={() => {
                  setBanSelected(() => {
                    const next = new Set<string>();
                    if (!bansAllSelected) for (const b of bans) next.add(b.ip);
                    return next;
                  });
                }} />
                <span className="text-sm text-muted-foreground">全选</span>
              </div>
              <span className="text-sm text-muted-foreground">{banSelected.size ? `已选 ${banSelected.size} 个` : "未选择"}</span>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" disabled={!banSelected.size || busy} onClick={() => setBanSelected(new Set())}>清空</Button>
              <Button size="sm" disabled={!banSelected.size || busy} onClick={async () => {
                if (!confirm(`确定解封选中的 ${banSelected.size} 个 IP 吗？`)) return;
                await doUnban(Array.from(banSelected));
              }}>批量解封</Button>
            </div>

            <div className="grid gap-2">
              {bans.map((b) => (
                <div key={b.ip} className="flex items-center gap-3 flex-wrap p-3 rounded-xl border border-border">
                  <Checkbox checked={banSelected.has(b.ip)} onCheckedChange={() =>
                    setBanSelected((prev) => { const next = new Set(prev); if (next.has(b.ip)) next.delete(b.ip); else next.add(b.ip); return next; })
                  } />
                  <span className="font-bold min-w-[220px]">{b.ip}</span>
                  <span className="text-xs text-muted-foreground">{b.createdAt ? new Date(b.createdAt).toLocaleString("zh-CN") : ""}</span>
                  <span className="text-muted-foreground flex-1 min-w-[240px] truncate text-sm">{b.reason || "—"}</span>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => doUnban([b.ip])}>解封</Button>
                </div>
              ))}
              {!banLoading && bans.length === 0 ? <div className="text-sm text-muted-foreground">暂无封禁</div> : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
