import type { Router } from "express";
import dns from "node:dns/promises";
import net from "node:net";
import slugify from "slugify";
import { z } from "zod";

import type { Db } from "../db.js";
import {
  createPost,
  createLinkAdmin,
  deletePost,
  deleteCommentAdmin,
  deleteLinkAdmin,
  deleteLinkRequestAdmin,
  getPostBySlug,
  listCommentsAdmin,
  listLinkRequestsAdmin,
  listLinksAdmin,
  listPosts,
  updateCommentAdmin,
  updateLinkAdmin,
  updateLinkRequestAdmin,
  updatePost,
  upsertTagsAndCategories,
} from "../db.js";

const postPayloadSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(250).optional(),
  summary: z.string().max(500).optional().nullable(),
  contentMd: z.string().min(1),
  coverImage: z.string().max(2000).optional().nullable(),
  status: z.enum(["draft", "published"]).default("draft"),
  featured: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
  tags: z.array(z.string().max(64)).optional().default([]),
  categories: z.array(z.string().max(64)).optional().default([]),
  publishedAt: z.string().datetime().optional().nullable(),
});

const uniqueSlug = (db: Db, rawSlug: string, excludePostId?: number) => {
  const base = slugify(rawSlug, { lower: true, strict: true, trim: true }) || "post";
  let slug = base;
  let n = 2;

  // naive uniqueness check: try until no conflicts
  // (SQLite UNIQUE constraint is still the final authority)
  while (true) {
    const found = getPostBySlug(db, slug);
    if (!found) return slug;
    if (excludePostId && found.id === excludePostId) return slug;
    slug = `${base}-${n++}`;
  }
};

export const mountAdminRoutes = (router: Router, db: Db) => {
  router.get("/posts", (req, res) => {
    const query = z
      .object({
        page: z.string().optional(),
        limit: z.string().optional(),
        q: z.string().optional(),
        status: z.enum(["draft", "published"]).optional(),
      })
      .parse(req.query);

    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? "20", 10) || 20));

    const { items, total } = listPosts(db, {
      includeDrafts: true,
      page,
      limit,
      q: query.q,
      featured: undefined,
      tag: undefined,
      category: undefined,
    });

    const filtered = query.status ? items.filter((p) => p.status === query.status) : items;
    res.json({ items: filtered, total, page, limit });
  });

  router.post("/posts", (req, res) => {
    const payload = postPayloadSchema.parse(req.body);
    const slug = uniqueSlug(db, payload.slug ?? payload.title);
    const publishedAt =
      payload.publishedAt ?? (payload.status === "published" ? new Date().toISOString() : null);

    const postId = createPost(db, {
      title: payload.title,
      slug,
      summary: payload.summary ?? null,
      contentMd: payload.contentMd,
      coverImage: payload.coverImage ?? null,
      status: payload.status,
      featured: payload.featured ? 1 : 0,
      sortOrder: payload.sortOrder ?? 0,
      publishedAt,
    });

    upsertTagsAndCategories(db, {
      postId,
      tags: payload.tags,
      categories: payload.categories.map((name) => ({
        name,
        slug: slugify(name, { lower: true, strict: true, trim: true }) || name,
      })),
    });

    res.json({ id: postId, slug });
  });

  router.put("/posts/:id", (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const payload = postPayloadSchema.parse(req.body);
    const slug = uniqueSlug(db, payload.slug ?? payload.title, id);
    const publishedAt =
      payload.publishedAt ?? (payload.status === "published" ? new Date().toISOString() : null);

    updatePost(db, {
      id,
      title: payload.title,
      slug,
      summary: payload.summary ?? null,
      contentMd: payload.contentMd,
      coverImage: payload.coverImage ?? null,
      status: payload.status,
      featured: payload.featured ? 1 : 0,
      sortOrder: payload.sortOrder ?? 0,
      publishedAt,
    });

    upsertTagsAndCategories(db, {
      postId: id,
      tags: payload.tags,
      categories: payload.categories.map((name) => ({
        name,
        slug: slugify(name, { lower: true, strict: true, trim: true }) || name,
      })),
    });

    res.json({ ok: true, slug });
  });

  router.patch("/posts/:id/order", (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const payload = z
      .object({
        featured: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
      .refine((v) => v.featured !== undefined || v.sortOrder !== undefined, {
        message: "featured or sortOrder required",
      })
      .parse(req.body);

    const row = db
      .prepare("SELECT id, title, slug, summary, content_md as contentMd, cover_image as coverImage, status, featured, sort_order as sortOrder, published_at as publishedAt FROM posts WHERE id = ?")
      .get(id) as any;
    if (!row) return res.status(404).json({ error: "not_found" });

    const nextFeatured = payload.featured !== undefined ? (payload.featured ? 1 : 0) : row.featured;
    const nextSortOrder = payload.sortOrder !== undefined ? payload.sortOrder : row.sortOrder;

    db.prepare("UPDATE posts SET featured = ?, sort_order = ?, updated_at = ? WHERE id = ?").run(
      nextFeatured,
      nextSortOrder,
      new Date().toISOString(),
      id,
    );

    res.json({ ok: true });
  });

  router.delete("/posts/:id", (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    deletePost(db, id);
    res.json({ ok: true });
  });

  router.get("/comments", (req, res) => {
    const q = z
      .object({
        status: z.enum(["pending", "approved"]).optional(),
        postId: z.string().optional(),
      })
      .parse(req.query);
    const postId = q.postId ? Number.parseInt(q.postId, 10) : undefined;
    res.json({ items: listCommentsAdmin(db, { status: q.status, postId }) });
  });

  router.patch("/comments/:id", (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const body = z
      .object({
        status: z.enum(["pending", "approved"]).optional(),
        contentMd: z.string().min(1).max(2000).optional(),
      })
      .refine((v) => v.status !== undefined || v.contentMd !== undefined, { message: "status or contentMd required" })
      .parse(req.body);
    const ok = updateCommentAdmin(db, { id, status: body.status, contentMd: body.contentMd });
    if (!ok) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  });

  router.delete("/comments/:id", (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    deleteCommentAdmin(db, id);
    res.json({ ok: true });
  });

  router.get("/links", (_req, res) => {
    res.json({ items: listLinksAdmin(db) });
  });

  const linkSchema = z.object({
    title: z.string().min(1).max(80),
    url: z.string().url().max(2000),
    description: z.string().max(200).optional().default(""),
    iconUrl: z.string().max(2000).optional().default(""),
    sortOrder: z.number().int().optional().default(0),
  });

  router.post("/links", (req, res) => {
    const body = linkSchema.parse(req.body);
    const id = createLinkAdmin(db, {
      title: body.title,
      url: body.url,
      description: body.description ?? "",
      iconUrl: body.iconUrl ?? "",
      sortOrder: body.sortOrder ?? 0,
    });
    res.json({ ok: true, id });
  });

  router.put("/links/:id", (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const body = linkSchema.parse(req.body);
    updateLinkAdmin(db, {
      id,
      title: body.title,
      url: body.url,
      description: body.description ?? "",
      iconUrl: body.iconUrl ?? "",
      sortOrder: body.sortOrder ?? 0,
    });
    res.json({ ok: true });
  });

  router.delete("/links/:id", (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    deleteLinkAdmin(db, id);
    res.json({ ok: true });
  });

  router.get("/link-requests", (req, res) => {
    const q = z.object({ status: z.enum(["pending", "approved"]).optional() }).parse(req.query);
    res.json({ items: listLinkRequestsAdmin(db, q.status) });
  });

  router.patch("/link-requests/:id", (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const body = z.object({ status: z.enum(["pending", "approved"]) }).parse(req.body);
    updateLinkRequestAdmin(db, { id, status: body.status });
    res.json({ ok: true });
  });

  router.delete("/link-requests/:id", (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    deleteLinkRequestAdmin(db, id);
    res.json({ ok: true });
  });

  const isPrivateIpv4 = (ip: string) => {
    const parts = ip.split(".").map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  };

  const isPrivateIp = (ip: string) => {
    const v = net.isIP(ip);
    if (v === 4) return isPrivateIpv4(ip);
    if (v === 6) {
      const s = ip.toLowerCase();
      if (s === "::1") return true;
      if (s.startsWith("fc") || s.startsWith("fd")) return true; // unique local
      if (s.startsWith("fe80")) return true; // link-local
      return false;
    }
    return true;
  };

  const safeResolveHost = async (hostname: string) => {
    if (hostname === "localhost") return false;
    if (net.isIP(hostname)) return !isPrivateIp(hostname);
    const addrs4 = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addrs6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const all = [...addrs4, ...addrs6];
    if (!all.length) return false;
    return all.every((ip) => !isPrivateIp(ip));
  };

  router.get("/link-icon", async (req, res) => {
    const q = z.object({ url: z.string().url().max(2000) }).parse(req.query);
    const u = new URL(q.url);
    if (!(u.protocol === "http:" || u.protocol === "https:")) return res.status(400).json({ error: "invalid_url" });
    const okHost = await safeResolveHost(u.hostname);
    if (!okHost) return res.status(400).json({ error: "blocked_host" });

    const origin = `${u.protocol}//${u.host}`;
    const root = `${origin}/`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);

    const fallback = `${origin}/favicon.ico`;
    try {
      const resp = await fetch(root, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "user-agent": "yablog/1.0" },
      });
      clearTimeout(t);
      if (!resp.ok) return res.json({ iconUrl: fallback });
      const ct = resp.headers.get("content-type") ?? "";
      if (!ct.includes("text/html")) return res.json({ iconUrl: fallback });
      const html = (await resp.text()).slice(0, 512_000);
      const m =
        html.match(/<link[^>]+rel=["'](?:shortcut\\s+)?icon["'][^>]*>/i) ??
        html.match(/<link[^>]+rel=["']icon["'][^>]*>/i);
      if (!m) return res.json({ iconUrl: fallback });
      const tag = m[0];
      const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
      if (!hrefMatch) return res.json({ iconUrl: fallback });
      const href = hrefMatch[1];
      const iconUrl = new URL(href, root).toString();
      return res.json({ iconUrl });
    } catch {
      clearTimeout(t);
      return res.json({ iconUrl: fallback });
    }
  });
};
