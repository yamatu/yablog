import { useCallback, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, CommentAdminRow } from "../../api";
import { Markdown } from "../../components/Markdown";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { AdminLayoutWrapper, AdminNav, useMe } from "./AdminLayout";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AdminCommentsPage() {
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
      <AdminCommentsPanel />
    </AdminLayoutWrapper>
  );
}

function AdminCommentsPanel() {
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

  useEffect(() => { refresh(); }, [refresh]);

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
    <Card>
      <CardContent className="p-6">
        <div className="flex justify-between items-center gap-3 flex-wrap mb-5">
          <div>
            <h2 className="text-xl font-bold">评论管理</h2>
            <p className="text-sm text-muted-foreground">审核 / 编辑 / 删除</p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>刷新</Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-sm text-muted-foreground">状态</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm" style={{ width: 160 }}>
            <option value="pending">待审核</option>
            <option value="approved">已通过</option>
            <option value="">全部</option>
          </select>
          <span className="text-xs text-muted-foreground">最多显示 500 条</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border border-border bg-card/80 mb-4">
          <div className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleAllVisible} />
            <span className="text-sm text-muted-foreground">全选</span>
          </div>
          <span className="text-sm text-muted-foreground">{selectedCount ? `已选 ${selectedCount} 条` : "未选择"}</span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" disabled={!selectedCount || bulkBusy} onClick={clearSelected}>清空</Button>
          <Button variant="ghost" size="sm" disabled={!selectedCount || bulkBusy} onClick={async () => {
            setBulkBusy(true);
            try {
              await runSequential(Array.from(selectedIds), async (id) => { await api.adminUpdateComment(id, { status: "approved" }); });
              await refresh();
            } finally { setBulkBusy(false); }
          }}>批量通过</Button>
          <Button variant="ghost" size="sm" disabled={!selectedCount || bulkBusy} onClick={async () => {
            setBulkBusy(true);
            try {
              await runSequential(Array.from(selectedIds), async (id) => { await api.adminUpdateComment(id, { status: "pending" }); });
              await refresh();
            } finally { setBulkBusy(false); }
          }}>批量驳回</Button>
          <Button variant="destructive" size="sm" disabled={!selectedCount || bulkBusy} onClick={async () => {
            if (!confirm(`确定删除选中的 ${selectedCount} 条评论吗？`)) return;
            setBulkBusy(true);
            try {
              await runSequential(Array.from(selectedIds), async (id) => { await api.adminDeleteComment(id); });
              clearSelected();
              await refresh();
            } finally { setBulkBusy(false); }
          }}>批量删除</Button>
        </div>

        {err ? <div className="text-sm text-destructive mb-3">错误：{err}</div> : null}
        {loading ? <div className="text-sm text-muted-foreground">加载中…</div> : null}
        {!loading && items.length === 0 ? <div className="text-sm text-muted-foreground">暂无评论</div> : null}

        <div className="grid gap-3">
          {items.map((c) => {
            const isEditing = editingId === c.id;
            const isBusy = busyId === c.id;
            return (
              <div key={c.id} className="rounded-xl border border-border p-4">
                <div className="flex justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
                      <span className="font-bold truncate">{c.postTitle}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      <a href={`/post/${c.postSlug}`} target="_blank" rel="noreferrer" className="hover:underline">/post/{c.postSlug}</a>
                      {" · "}{c.author}{" · "}{shortDate(c.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={c.status === "approved" ? "default" : "secondary"}>
                      {c.status === "approved" ? "已通过" : "待审核"}
                    </Badge>
                    <Button variant="ghost" size="sm" disabled={isBusy} onClick={async () => {
                      setBusyId(c.id);
                      try {
                        await api.adminUpdateComment(c.id, { status: c.status === "approved" ? "pending" : "approved" });
                        await refresh();
                      } finally { setBusyId(null); }
                    }}>{c.status === "approved" ? "取消通过" : "通过"}</Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                      if (isEditing) { setEditingId(null); setEditingMd(""); return; }
                      setEditingId(c.id); setEditingMd(c.contentMd);
                    }}>{isEditing ? "关闭编辑" : "编辑"}</Button>
                    <Button variant="ghost" size="sm" disabled={isBusy} onClick={async () => {
                      if (!confirm("确定删除这条评论吗？")) return;
                      setBusyId(c.id);
                      try { await api.adminDeleteComment(c.id); await refresh(); }
                      finally { setBusyId(null); }
                    }}>删除</Button>
                  </div>
                </div>

                <div className="mt-3">
                  {isEditing ? (
                    <div className="grid gap-2">
                      <MarkdownEditor value={editingMd} onChange={setEditingMd} minHeight={160} />
                      <div className="flex justify-between items-center gap-2 flex-wrap">
                        <span className="text-sm text-muted-foreground">预览</span>
                        <Button size="sm" disabled={isBusy} onClick={async () => {
                          const next = editingMd.trim();
                          if (!next) return;
                          setBusyId(c.id);
                          try {
                            await api.adminUpdateComment(c.id, { contentMd: next });
                            setEditingId(null); setEditingMd("");
                            await refresh();
                          } finally { setBusyId(null); }
                        }}>保存</Button>
                      </div>
                      <div className="rounded-lg border border-border p-3">
                        <div className="markdown" style={{ padding: 0, background: "transparent", border: 0 }}>
                          <Markdown value={editingMd} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border p-3">
                      <div className="markdown" style={{ padding: 0, background: "transparent", border: 0 }}>
                        <Markdown value={c.contentMd} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
