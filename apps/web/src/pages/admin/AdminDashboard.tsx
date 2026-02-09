import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Post, User } from "../../api";
import { AdminLayoutWrapper, AdminNav, useMe, RequireAuth } from "./AdminLayout";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

export function AdminIndexPage() {
  return (
    <RequireAuth>
      <AdminLayoutWrapper>
        <AdminDashboardInner />
      </AdminLayoutWrapper>
    </RequireAuth>
  );
}

function AdminDashboardInner() {
  const { user } = useMe();
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

  useEffect(() => { refresh(); }, [refresh]);

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
    await api.logout().catch(() => {});
    navigate("/admin/login", { replace: true });
  };

  const visibleIds = items.map((p) => p.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;
  const toggleOne = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const toggleAllVisible = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) { for (const id of visibleIds) next.delete(id); }
      else { for (const id of visibleIds) next.add(id); }
      return next;
    });
  const clearSelected = () => setSelectedIds(new Set());

  const runSequential = async (ids: number[], fn: (id: number) => Promise<void>) => {
    for (const id of ids) await fn(id);
  };

  return (
    <>
      <AdminNav onLogout={onLogout} />

      <Card>
        <CardContent className="p-6">
          <div className="flex justify-between items-center gap-3 flex-wrap mb-6">
            <div>
              <h2 className="text-xl font-bold">文章管理</h2>
              {user && <p className="text-sm text-muted-foreground">欢迎回来，{user.username}</p>}
            </div>
            <Button onClick={() => navigate("/admin/new")}>+ 新建文章</Button>
          </div>

          <div className="flex gap-2 mb-4">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索文章..." className="flex-1" />
            <Button variant="outline" onClick={refresh} disabled={loading}>
              {loading ? "..." : "搜索"}
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border border-border bg-card/80 mb-4">
            <div className="flex items-center gap-2">
              <Checkbox checked={allSelected} onCheckedChange={toggleAllVisible} />
              <span className="text-sm text-muted-foreground">全选</span>
            </div>
            <span className="text-sm text-muted-foreground">{selectedCount ? `已选 ${selectedCount} 篇` : "未选择"}</span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" disabled={!selectedCount || bulkBusy} onClick={clearSelected}>清空</Button>
            <Button variant="ghost" size="sm" disabled={!selectedCount || bulkBusy} onClick={async () => {
              setBulkBusy(true);
              try {
                await runSequential(Array.from(selectedIds), async (id) => { await api.adminUpdatePostOrder(id, { featured: true }); });
                await refresh();
              } finally { setBulkBusy(false); }
            }}>批量置顶</Button>
            <Button variant="ghost" size="sm" disabled={!selectedCount || bulkBusy} onClick={async () => {
              setBulkBusy(true);
              try {
                await runSequential(Array.from(selectedIds), async (id) => { await api.adminUpdatePostOrder(id, { featured: false }); });
                await refresh();
              } finally { setBulkBusy(false); }
            }}>取消置顶</Button>
            <Button variant="destructive" size="sm" disabled={!selectedCount || bulkBusy} onClick={async () => {
              if (!confirm(`确定删除选中的 ${selectedCount} 篇文章吗？此操作不可恢复。`)) return;
              setBulkBusy(true);
              try {
                await runSequential(Array.from(selectedIds), async (id) => { await api.adminDeletePost(id); });
                clearSelected();
                await refresh();
              } finally { setBulkBusy(false); }
            }}>批量删除</Button>
          </div>

          {err ? <div className="text-sm text-destructive mb-4">错误：{err}</div> : null}

          <div className="flex flex-col gap-2">
            {items.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-accent/5 transition-colors adminPostRow">
                <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleOne(p.id)} />
                <div className="flex-1 min-w-0 adminPostMain">
                  <div className="font-semibold text-base truncate adminPostTitle">{p.title}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap adminPostMeta">
                    <Badge variant={p.status === "published" ? "default" : "secondary"}>
                      {p.status === "published" ? "已发布" : "草稿"}
                    </Badge>
                    {p.featured ? <Badge variant="outline" className="text-primary border-primary">置顶</Badge> : null}
                    <span className="text-xs text-muted-foreground">排序 {p.sortOrder ?? 0}</span>
                    <span className="text-xs text-muted-foreground adminPostSlug">/{p.slug}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 adminPostActions">
                  <Button variant="ghost" size="sm" onClick={async () => {
                    await api.adminUpdatePostOrder(p.id, { featured: !Boolean(p.featured) });
                    refresh();
                  }} title="置顶/取消置顶">
                    {p.featured ? "取消置顶" : "置顶"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={async () => {
                    await api.adminUpdatePostOrder(p.id, { sortOrder: (p.sortOrder ?? 0) + 1 });
                    refresh();
                  }} title="排序 +1">↑</Button>
                  <Button variant="ghost" size="sm" onClick={async () => {
                    await api.adminUpdatePostOrder(p.id, { sortOrder: (p.sortOrder ?? 0) - 1 });
                    refresh();
                  }} title="排序 -1">↓</Button>
                  <Link to={`/post/${p.slug}`} target="_blank">
                    <Button variant="ghost" size="sm">查看</Button>
                  </Link>
                  <Link to={`/admin/edit/${p.id}`}>
                    <Button variant="outline" size="sm">编辑</Button>
                  </Link>
                </div>
              </div>
            ))}
            {!items.length && !loading ? <div className="text-center text-muted-foreground py-10">暂无文章</div> : null}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
