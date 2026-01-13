import type { Router } from "express";
import { z } from "zod";

import type { Db } from "../db.js";
import { getPostBySlug, listCategories, listPosts, listTags } from "../db.js";

const parseBool = (value: unknown) => {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return undefined;
};

export const mountPublicRoutes = (router: Router, db: Db) => {
  router.get("/posts", (req, res) => {
    const query = z
      .object({
        page: z.string().optional(),
        limit: z.string().optional(),
        q: z.string().optional(),
        tag: z.string().optional(),
        category: z.string().optional(),
        featured: z.string().optional(),
      })
      .parse(req.query);

    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit ?? "10", 10) || 10));
    const featured = parseBool(query.featured);

    const { items, total } = listPosts(db, {
      includeDrafts: false,
      page,
      limit,
      q: query.q,
      tag: query.tag,
      category: query.category,
      featured,
    });

    res.json({ items, total, page, limit });
  });

  router.get("/posts/:slug", (req, res) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const post = getPostBySlug(db, slug);
    if (!post || post.status !== "published") return res.status(404).json({ error: "not_found" });
    res.json({ post });
  });

  router.get("/tags", (_req, res) => {
    res.json({ items: listTags(db) });
  });

  router.get("/categories", (_req, res) => {
    res.json({ items: listCategories(db) });
  });
};

