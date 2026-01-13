import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { config } from "./config.js";

export type Db = Database.Database;

export type User = {
  id: number;
  username: string;
  createdAt: string;
};

export type Post = {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  contentMd: string;
  coverImage: string | null;
  status: "draft" | "published";
  featured: 0 | 1;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  tags: string[];
  categories: string[];
};

const nowIso = () => new Date().toISOString();

export const openDb = (): Db => {
  const dir = path.dirname(config.databasePath);
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(config.databasePath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  return db;
};

export const initDb = (db: Db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      summary TEXT,
      content_md TEXT NOT NULL,
      cover_image TEXT,
      status TEXT NOT NULL CHECK (status IN ('draft','published')),
      featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS post_tags (
      post_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (post_id, tag_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS post_categories (
      post_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (post_id, category_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );
  `);
};

export const getUserByUsername = (db: Db, username: string) => {
  return db
    .prepare(
      "SELECT id, username, password_hash as passwordHash, created_at as createdAt FROM users WHERE username = ?",
    )
    .get(username) as
    | (User & {
        passwordHash: string;
      })
    | undefined;
};

export const hasAnyUsers = (db: Db) => {
  const row = db.prepare("SELECT COUNT(1) as c FROM users").get() as { c: number };
  return row.c > 0;
};

export const ensureAdminUser = (
  db: Db,
  args: { username: string; passwordHash: string },
) => {
  db.prepare(
    "INSERT OR IGNORE INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
  ).run(args.username, args.passwordHash, nowIso());
};

const mapPostRow = (row: any, tags: string[], categories: string[]): Post => ({
  id: row.id,
  title: row.title,
  slug: row.slug,
  summary: row.summary,
  contentMd: row.contentMd,
  coverImage: row.coverImage,
  status: row.status,
  featured: row.featured,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  publishedAt: row.publishedAt,
  tags,
  categories,
});

const getTagsForPost = (db: Db, postId: number): string[] => {
  const rows = db
    .prepare(
      `
      SELECT t.name as name
      FROM post_tags pt
      JOIN tags t ON t.id = pt.tag_id
      WHERE pt.post_id = ?
      ORDER BY t.name ASC
      `,
    )
    .all(postId) as { name: string }[];
  return rows.map((r) => r.name);
};

const getCategoriesForPost = (db: Db, postId: number): string[] => {
  const rows = db
    .prepare(
      `
      SELECT c.name as name
      FROM post_categories pc
      JOIN categories c ON c.id = pc.category_id
      WHERE pc.post_id = ?
      ORDER BY c.name ASC
      `,
    )
    .all(postId) as { name: string }[];
  return rows.map((r) => r.name);
};

export const getPostBySlug = (db: Db, slug: string): Post | null => {
  const row = db
    .prepare(
      `
      SELECT
        id,
        title,
        slug,
        summary,
        content_md as contentMd,
        cover_image as coverImage,
        status,
        featured,
        created_at as createdAt,
        updated_at as updatedAt,
        published_at as publishedAt
      FROM posts
      WHERE slug = ?
      LIMIT 1
      `,
    )
    .get(slug) as
    | {
        id: number;
        title: string;
        slug: string;
        summary: string | null;
        contentMd: string;
        coverImage: string | null;
        status: "draft" | "published";
        featured: 0 | 1;
        createdAt: string;
        updatedAt: string;
        publishedAt: string | null;
      }
    | undefined;
  if (!row) return null;
  const tags = getTagsForPost(db, row.id);
  const categories = getCategoriesForPost(db, row.id);
  return mapPostRow(row, tags, categories);
};

export const listPosts = (
  db: Db,
  args: {
    includeDrafts: boolean;
    featured?: boolean;
    tag?: string;
    category?: string;
    q?: string;
    page: number;
    limit: number;
  },
): { items: Post[]; total: number } => {
  const clauses: string[] = [];
  const params: any[] = [];

  if (!args.includeDrafts) {
    clauses.push("p.status = 'published'");
  }
  if (typeof args.featured === "boolean") {
    clauses.push("p.featured = ?");
    params.push(args.featured ? 1 : 0);
  }
  if (args.q) {
    clauses.push("(p.title LIKE ? OR p.summary LIKE ? OR p.content_md LIKE ?)");
    params.push(`%${args.q}%`, `%${args.q}%`, `%${args.q}%`);
  }

  let join = "";
  if (args.tag) {
    join += `
      JOIN post_tags pt ON pt.post_id = p.id
      JOIN tags t ON t.id = pt.tag_id
    `;
    clauses.push("t.name = ?");
    params.push(args.tag);
  }
  if (args.category) {
    join += `
      JOIN post_categories pc ON pc.post_id = p.id
      JOIN categories c ON c.id = pc.category_id
    `;
    clauses.push("c.name = ?");
    params.push(args.category);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const offset = (args.page - 1) * args.limit;

  const totalRow = db
    .prepare(
      `
      SELECT COUNT(DISTINCT p.id) as total
      FROM posts p
      ${join}
      ${where}
      `,
    )
    .get(...params) as { total: number };

  const rows = db
    .prepare(
      `
      SELECT DISTINCT
        p.id,
        p.title,
        p.slug,
        p.summary,
        p.content_md as contentMd,
        p.cover_image as coverImage,
        p.status,
        p.featured,
        p.created_at as createdAt,
        p.updated_at as updatedAt,
        p.published_at as publishedAt
      FROM posts p
      ${join}
      ${where}
      ORDER BY COALESCE(p.published_at, p.updated_at) DESC
      LIMIT ?
      OFFSET ?
      `,
    )
    .all(...params, args.limit, offset);

  const items = (rows as any[]).map((row) => {
    const tags = getTagsForPost(db, row.id);
    const categories = getCategoriesForPost(db, row.id);
    return mapPostRow(row, tags, categories);
  });

  return { items, total: totalRow.total };
};

export const upsertTagsAndCategories = (
  db: Db,
  args: { postId: number; tags: string[]; categories: { name: string; slug: string }[] },
) => {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM post_tags WHERE post_id = ?").run(args.postId);
    db.prepare("DELETE FROM post_categories WHERE post_id = ?").run(args.postId);

    for (const tag of args.tags) {
      if (!tag.trim()) continue;
      db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(tag.trim());
      const tagRow = db.prepare("SELECT id FROM tags WHERE name = ?").get(tag.trim()) as {
        id: number;
      };
      db.prepare("INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)").run(
        args.postId,
        tagRow.id,
      );
    }

    for (const category of args.categories) {
      const name = category.name.trim();
      const slug = category.slug.trim();
      if (!name || !slug) continue;
      db.prepare("INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)").run(name, slug);
      const catRow = db
        .prepare("SELECT id FROM categories WHERE name = ?")
        .get(name) as { id: number };
      db.prepare(
        "INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?, ?)",
      ).run(args.postId, catRow.id);
    }
  });

  tx();
};

export const createPost = (
  db: Db,
  args: {
    title: string;
    slug: string;
    summary: string | null;
    contentMd: string;
    coverImage: string | null;
    status: "draft" | "published";
    featured: 0 | 1;
    publishedAt: string | null;
  },
) => {
  const createdAt = nowIso();
  const updatedAt = createdAt;
  const info = db
    .prepare(
      `
      INSERT INTO posts
        (title, slug, summary, content_md, cover_image, status, featured, created_at, updated_at, published_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      args.title,
      args.slug,
      args.summary,
      args.contentMd,
      args.coverImage,
      args.status,
      args.featured,
      createdAt,
      updatedAt,
      args.publishedAt,
    );
  return info.lastInsertRowid as number;
};

export const updatePost = (
  db: Db,
  args: {
    id: number;
    title: string;
    slug: string;
    summary: string | null;
    contentMd: string;
    coverImage: string | null;
    status: "draft" | "published";
    featured: 0 | 1;
    publishedAt: string | null;
  },
) => {
  db.prepare(
    `
    UPDATE posts SET
      title = ?,
      slug = ?,
      summary = ?,
      content_md = ?,
      cover_image = ?,
      status = ?,
      featured = ?,
      updated_at = ?,
      published_at = ?
    WHERE id = ?
    `,
  ).run(
    args.title,
    args.slug,
    args.summary,
    args.contentMd,
    args.coverImage,
    args.status,
    args.featured,
    nowIso(),
    args.publishedAt,
    args.id,
  );
};

export const deletePost = (db: Db, id: number) => {
  db.prepare("DELETE FROM posts WHERE id = ?").run(id);
};

export const listTags = (db: Db): string[] => {
  const rows = db.prepare("SELECT name FROM tags ORDER BY name ASC").all() as {
    name: string;
  }[];
  return rows.map((r) => r.name);
};

export const listCategories = (db: Db): { name: string; slug: string }[] => {
  return db
    .prepare("SELECT name, slug FROM categories ORDER BY name ASC")
    .all() as { name: string; slug: string }[];
};
