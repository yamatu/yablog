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
  const ipKey = (ip: string | undefined | null) => (ip ?? "").replace("::ffff:", "") || "unknown";
  const peek = async <T,>(ns: string, raw: unknown): Promise<T | null> => {
    const k = await cache.key(ns, raw);
    const hit = await cache.getJSON<any>(k);
    if (hit === null) return null;
    if (hit && typeof hit === "object" && hit.__wrap === 1 && "value" in hit) return hit.value as T;
    return hit as T;
  };

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

    const ip = ipKey(req.ip);
    const [rlIp, rlGlobal] = await Promise.all([
      cache.rateLimit({ bucket: "search", key: ip, limit: 60, windowSec: 60 }),
      cache.rateLimit({ bucket: "search:g", key: "global", limit: 800, windowSec: 60 }),
    ]);

    if (!rlIp.allowed || !rlGlobal.allowed) {
      const cached = await peek<any>("search", { q, page, limit });
      if (cached) {
        void cache.recordSuspicious({ ip, bucket: "search", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "cache" });
        res.setHeader("x-rate-limited", "1");
        res.setHeader("x-cache", "hit");
        res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
        return res.json(cached);
      }
      void cache.recordSuspicious({ ip, bucket: "search", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "block" });
      res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
      return res.status(429).json({ error: "rate_limited" });
    }

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
    const ip = ipKey(req.ip);
    const [rlIp, rlGlobal] = await Promise.all([
      cache.rateLimit({ bucket: "comments", key: ip, limit: 120, windowSec: 60 }),
      cache.rateLimit({ bucket: "comments:g", key: "global", limit: 1600, windowSec: 60 }),
    ]);

    if (!rlIp.allowed || !rlGlobal.allowed) {
      const cached = await peek<any>("comments", { slug });
      if (cached) {
        void cache.recordSuspicious({ ip, bucket: "comments", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "cache" });
        res.setHeader("x-rate-limited", "1");
        res.setHeader("x-cache", "hit");
        res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
        return res.json(cached);
      }
      void cache.recordSuspicious({ ip, bucket: "comments", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "block" });
      res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
      return res.status(429).json({ error: "rate_limited" });
    }
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

    const raw = { page, limit, q: query.q ?? "", tag: query.tag ?? "", category: query.category ?? "", featured: featured ?? null };
    const ip = ipKey(req.ip);
    const [rlIp, rlGlobal] = await Promise.all([
      cache.rateLimit({ bucket: "posts", key: ip, limit: 120, windowSec: 60 }),
      cache.rateLimit({ bucket: "posts:g", key: "global", limit: 2000, windowSec: 60 }),
    ]);

    if (!rlIp.allowed || !rlGlobal.allowed) {
      const cached = await peek<any>("posts", raw);
      if (cached) {
        void cache.recordSuspicious({ ip, bucket: "posts", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "cache" });
        res.setHeader("x-rate-limited", "1");
        res.setHeader("x-cache", "hit");
        res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
        return res.json(cached);
      }
      void cache.recordSuspicious({ ip, bucket: "posts", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "block" });
      res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
      return res.status(429).json({ error: "rate_limited" });
    }

    const data = await cache.wrapJSON(
      "posts",
      raw,
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
    const ip = ipKey(req.ip);
    const [rlIp, rlGlobal] = await Promise.all([
      cache.rateLimit({ bucket: "post", key: ip, limit: 240, windowSec: 60 }),
      cache.rateLimit({ bucket: "post:g", key: "global", limit: 3000, windowSec: 60 }),
    ]);
    if (!rlIp.allowed || !rlGlobal.allowed) {
      const cached = await peek<any>("posts", { slug });
      if (cached) {
        void cache.recordSuspicious({ ip, bucket: "post", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "cache" });
        res.setHeader("x-rate-limited", "1");
        res.setHeader("x-cache", "hit");
        res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
        if (!cached || cached.status !== "published") return res.status(404).json({ error: "not_found" });
        return res.json({ post: cached });
      }
      void cache.recordSuspicious({ ip, bucket: "post", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "block" });
      res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
      return res.status(429).json({ error: "rate_limited" });
    }
    const post = await cache.wrapJSON("posts", { slug }, 60, () => getPostBySlug(db, slug));
    if (!post || post.status !== "published") return res.status(404).json({ error: "not_found" });
    res.json({ post });
  });

  router.get("/tags", async (_req, res) => {
    const ip = ipKey(_req.ip);
    const [rlIp, rlGlobal] = await Promise.all([
      cache.rateLimit({ bucket: "tags", key: ip, limit: 240, windowSec: 60 }),
      cache.rateLimit({ bucket: "tags:g", key: "global", limit: 3000, windowSec: 60 }),
    ]);
    if (!rlIp.allowed || !rlGlobal.allowed) {
      const cached = await peek<any>("tags", { v: 1 });
      if (cached) {
        void cache.recordSuspicious({ ip, bucket: "tags", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "cache" });
        res.setHeader("x-rate-limited", "1");
        res.setHeader("x-cache", "hit");
        res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
        return res.json(cached);
      }
      void cache.recordSuspicious({ ip, bucket: "tags", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "block" });
      res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
      return res.status(429).json({ error: "rate_limited" });
    }
    const data = await cache.wrapJSON("tags", { v: 1 }, 300, () => ({ items: listTags(db) }));
    res.json(data);
  });

  router.get("/categories", async (_req, res) => {
    const ip = ipKey(_req.ip);
    const [rlIp, rlGlobal] = await Promise.all([
      cache.rateLimit({ bucket: "categories", key: ip, limit: 240, windowSec: 60 }),
      cache.rateLimit({ bucket: "categories:g", key: "global", limit: 3000, windowSec: 60 }),
    ]);
    if (!rlIp.allowed || !rlGlobal.allowed) {
      const cached = await peek<any>("categories", { v: 1 });
      if (cached) {
        void cache.recordSuspicious({ ip, bucket: "categories", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "cache" });
        res.setHeader("x-rate-limited", "1");
        res.setHeader("x-cache", "hit");
        res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
        return res.json(cached);
      }
      void cache.recordSuspicious({ ip, bucket: "categories", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "block" });
      res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
      return res.status(429).json({ error: "rate_limited" });
    }
    const data = await cache.wrapJSON("categories", { v: 1 }, 300, () => ({ items: listCategories(db) }));
    res.json(data);
  });

  router.get("/links", async (_req, res) => {
    const ip = ipKey(_req.ip);
    const [rlIp, rlGlobal] = await Promise.all([
      cache.rateLimit({ bucket: "links", key: ip, limit: 240, windowSec: 60 }),
      cache.rateLimit({ bucket: "links:g", key: "global", limit: 2000, windowSec: 60 }),
    ]);
    if (!rlIp.allowed || !rlGlobal.allowed) {
      const cached = await peek<any>("links", { v: 1 });
      if (cached) {
        void cache.recordSuspicious({ ip, bucket: "links", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "cache" });
        res.setHeader("x-rate-limited", "1");
        res.setHeader("x-cache", "hit");
        res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
        return res.json(cached);
      }
      void cache.recordSuspicious({ ip, bucket: "links", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "block" });
      res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
      return res.status(429).json({ error: "rate_limited" });
    }
    const data = await cache.wrapJSON("links", { v: 1 }, 120, () => ({ items: listLinksPublic(db) }));
    res.json(data);
  });

  router.get("/links/requests", async (_req, res) => {
    const ip = ipKey(_req.ip);
    const [rlIp, rlGlobal] = await Promise.all([
      cache.rateLimit({ bucket: "linkRequests", key: ip, limit: 240, windowSec: 60 }),
      cache.rateLimit({ bucket: "linkRequests:g", key: "global", limit: 2000, windowSec: 60 }),
    ]);
    if (!rlIp.allowed || !rlGlobal.allowed) {
      const cached = await peek<any>("linkRequests", { v: 1 });
      if (cached) {
        void cache.recordSuspicious({ ip, bucket: "linkRequests", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "cache" });
        res.setHeader("x-rate-limited", "1");
        res.setHeader("x-cache", "hit");
        res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
        return res.json(cached);
      }
      void cache.recordSuspicious({ ip, bucket: "linkRequests", kind: (!rlGlobal.allowed ? "global_" : "ip_") + "block" });
      res.setHeader("retry-after", String((!rlGlobal.allowed ? rlGlobal.resetSec : rlIp.resetSec) || 60));
      return res.status(429).json({ error: "rate_limited" });
    }
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
