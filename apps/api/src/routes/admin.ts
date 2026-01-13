import type { Router } from "express";
import slugify from "slugify";
import { z } from "zod";

import type { Db } from "../db.js";
import {
  createPost,
  deletePost,
  getPostBySlug,
  listPosts,
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
      payload.status === "published"
        ? (payload.publishedAt ?? new Date().toISOString())
        : null;

    const postId = createPost(db, {
      title: payload.title,
      slug,
      summary: payload.summary ?? null,
      contentMd: payload.contentMd,
      coverImage: payload.coverImage ?? null,
      status: payload.status,
      featured: payload.featured ? 1 : 0,
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
      payload.status === "published"
        ? (payload.publishedAt ?? new Date().toISOString())
        : null;

    updatePost(db, {
      id,
      title: payload.title,
      slug,
      summary: payload.summary ?? null,
      contentMd: payload.contentMd,
      coverImage: payload.coverImage ?? null,
      status: payload.status,
      featured: payload.featured ? 1 : 0,
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

  router.delete("/posts/:id", (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    deletePost(db, id);
    res.json({ ok: true });
  });
};

