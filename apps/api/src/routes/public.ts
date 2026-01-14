import type { Router } from "express";
import { z } from "zod";

import type { Cache } from "../cache.js";
import type { Db } from "../db.js";
import {
  createCaptcha,
  createComment,
  getPostBySlug,
  listApprovedCommentsByPostSlug,
  listCategories,
  listLinkRequestsPublic,
  listLinksPublic,
  listPosts,
  listTags,
  recommendPosts,
  searchPosts,
  createLinkRequest,
  verifyCaptcha,
} from "../db.js";

const parseBool = (value: unknown) => {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return undefined;
};

export const mountPublicRoutes = (router: Router, db: Db, cache: Cache) => {
  router.get("/captcha", (_req, res) => {
    const a = 1 + Math.floor(Math.random() * 9);
    const b = 1 + Math.floor(Math.random() * 9);
    const { id } = createCaptcha(db, { answer: String(a + b), ttlMs: 10 * 60 * 1000 });
    res.json({ id, question: `${a} + ${b} = ?` });
  });

  router.get("/search", async (req, res) => {
    const query = z
      .object({
        q: z.string().optional(),
        page: z.string().optional(),
        limit: z.string().optional(),
      })
      .parse(req.query);

    const q = (query.q ?? "").trim();
    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit ?? "10", 10) || 10));

    if (!q) return res.json({ items: [], total: 0, page, limit, recommendations: [] });

    const data = await cache.wrapJSON(
      "search",
      { q, page, limit },
      20,
      () => {
        const { items, total } = searchPosts(db, { q, page, limit, includeDrafts: false });
        const recommendations = recommendPosts(db, { base: items, limit: 6 });
        return { items, total, page, limit, recommendations };
      },
    );
    res.json(data);
  });

  router.get("/posts/:slug/comments", async (req, res) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const post = getPostBySlug(db, slug);
    if (!post || post.status !== "published") return res.status(404).json({ error: "not_found" });
    const data = await cache.wrapJSON("comments", { slug }, 30, () => listApprovedCommentsByPostSlug(db, slug));
    res.json(data);
  });

  router.post("/posts/:slug/comments", (req, res) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const post = getPostBySlug(db, slug);
    if (!post || post.status !== "published") return res.status(404).json({ error: "not_found" });

    const body = z
      .object({
        author: z.string().min(1).max(40),
        contentMd: z.string().min(1).max(2000),
        captchaId: z.string().min(1),
        captchaAnswer: z.string().min(1).max(20),
      })
      .parse(req.body);

    const cap = verifyCaptcha(db, { id: body.captchaId, answer: body.captchaAnswer });
    if (!cap.ok) return res.status(400).json({ error: "invalid_captcha" });

    const id = createComment(db, {
      postId: post.id,
      author: body.author,
      contentMd: body.contentMd,
      ip: req.ip,
      userAgent: req.get("user-agent") ?? null,
    });
    res.json({ ok: true, id, status: "pending" });
  });

  router.get("/posts", async (req, res) => {
    const query = z
      .object({
        page: z.string().optional(),
        limit: z.string().optional(),
        q: z.string().optional(),
        tag: z.string().optional(),
        category: z.string().optional(),
        featured: z.string().optional(),
        pinned: z.string().optional(),
      })
      .parse(req.query);

    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit ?? "10", 10) || 10));
    const featured = parseBool(query.pinned ?? query.featured);

    const data = await cache.wrapJSON(
      "posts",
      { page, limit, q: query.q ?? "", tag: query.tag ?? "", category: query.category ?? "", featured: featured ?? null },
      30,
      () => {
        const { items, total } = listPosts(db, {
          includeDrafts: false,
          page,
          limit,
          q: query.q,
          tag: query.tag,
          category: query.category,
          featured,
        });
        return { items, total, page, limit };
      },
    );
    res.json(data);
  });

  router.get("/posts/:slug", async (req, res) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const post = await cache.wrapJSON("posts", { slug }, 60, () => getPostBySlug(db, slug));
    if (!post || post.status !== "published") return res.status(404).json({ error: "not_found" });
    res.json({ post });
  });

  router.get("/tags", async (_req, res) => {
    const data = await cache.wrapJSON("tags", { v: 1 }, 300, () => ({ items: listTags(db) }));
    res.json(data);
  });

  router.get("/categories", async (_req, res) => {
    const data = await cache.wrapJSON("categories", { v: 1 }, 300, () => ({ items: listCategories(db) }));
    res.json(data);
  });

  router.get("/links", async (_req, res) => {
    const data = await cache.wrapJSON("links", { v: 1 }, 120, () => ({ items: listLinksPublic(db) }));
    res.json(data);
  });

  router.get("/links/requests", async (_req, res) => {
    const data = await cache.wrapJSON("linkRequests", { v: 1 }, 60, () => ({ items: listLinkRequestsPublic(db) }));
    res.json(data);
  });

  router.post("/links/requests", (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).max(40),
        url: z.string().url().max(2000),
        description: z.string().max(200).optional().default(""),
        message: z.string().max(1000).optional().default(""),
        captchaId: z.string().min(1),
        captchaAnswer: z.string().min(1).max(20),
      })
      .parse(req.body);

    const cap = verifyCaptcha(db, { id: body.captchaId, answer: body.captchaAnswer });
    if (!cap.ok) return res.status(400).json({ error: "invalid_captcha" });

    const id = createLinkRequest(db, {
      name: body.name,
      url: body.url,
      description: body.description ?? "",
      message: body.message ?? "",
      ip: req.ip,
      userAgent: req.get("user-agent") ?? null,
    });
    res.json({ ok: true, id, status: "pending" });
  });
};
