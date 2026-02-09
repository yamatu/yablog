import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, Post } from "../../api";
import { ImageField } from "../../components/ImageField";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { AdminLayoutWrapper, AdminNav, useMe } from "./AdminLayout";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

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

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  const onLogout = async () => {
    await api.logout().catch(() => {});
    navigate("/admin/login", { replace: true });
  };

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
      <AdminNav onLogout={onLogout} />

      {/* ── Top action bar ── */}
      <div className="flex justify-between items-center gap-3 flex-wrap mb-5 p-4 rounded-xl bg-card border border-border">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/admin")}>← 返回</Button>
          <h2 className="text-lg font-bold">{mode === "new" ? "撰写新文章" : "编辑文章"}</h2>
          {mode === "edit" && (
            <Badge variant={status === "published" ? "default" : "secondary"}>
              {status === "published" ? "已发布" : "草稿"}
            </Badge>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {mode === "edit" && post && (
            <Link to={`/post/${post.slug}`} target="_blank">
              <Button variant="ghost" size="sm">预览页面</Button>
            </Link>
          )}
          <Button variant="outline" onClick={() => onSave()} disabled={saving}>
            {saving ? "保存中…" : "保存草稿"}
          </Button>
          <Button onClick={() => onSave({ publish: true })} disabled={saving}>
            {saving ? "保存中…" : "保存并发布"}
          </Button>
        </div>
      </div>

      {/* ── Title input (hero style) ── */}
      <div className="mb-5">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="在此输入文章标题..."
          className="text-2xl font-bold h-14 px-5 bg-card border border-border rounded-xl focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {/* ── 2-column layout: Editor + Sidebar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[5fr_2fr] gap-5 items-start">
        {/* Main editor */}
        <div className="min-w-0">
          <MarkdownEditor value={contentMd} onChange={setContentMd} placeholder="开始写作..." minHeight={600} />
        </div>

        {/* Sidebar settings */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-5">
          {/* Article settings */}
          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">文章设置</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Slug (URL 路径)</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="example-post" className="h-8 text-sm" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">摘要</Label>
                <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="文章简介..." rows={2} className="text-sm" />
              </div>
              <ImageField
                label="封面图片"
                value={coverImage}
                onChange={setCoverImage}
                placeholder="https://... 或 /uploads/..."
                help="建议使用图库上传"
              />
            </CardContent>
          </Card>

          {/* Categories & Tags */}
          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">分类与标签</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">分类（逗号分隔）</Label>
                <Input value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="技术, 生活" className="h-8 text-sm" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">标签（逗号分隔）</Label>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="React, Node.js" className="h-8 text-sm" />
              </div>
            </CardContent>
          </Card>

          {/* Publish status */}
          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">发布状态</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 grid gap-3">
              <div className="flex items-center gap-2">
                <Checkbox checked={featured} onCheckedChange={(c) => setFeatured(!!c)} id="featured" />
                <Label htmlFor="featured" className="text-sm cursor-pointer">置顶文章</Label>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">发布时间</Label>
                <Input type="datetime-local" value={publishedAtLocal} onChange={(e) => setPublishedAtLocal(e.target.value)} className="h-8 text-sm" />
                <p className="text-xs text-muted-foreground">留空则发布时自动取当前时间</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">排序权重</Label>
                <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} className="h-8 text-sm" />
                <p className="text-xs text-muted-foreground">数字越大越靠前</p>
              </div>
            </CardContent>
          </Card>

          {/* Delete button */}
          {mode === "edit" ? (
            <Button variant="destructive" size="sm" onClick={onDelete} className="w-full">
              删除此文章
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── Error display ── */}
      {err ? (
        <div className="mt-5 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm">
          错误：{err}
        </div>
      ) : null}
    </AdminLayoutWrapper>
  );
}
