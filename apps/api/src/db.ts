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
  sortOrder: number;
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
      sort_order INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
};

const hasColumn = (db: Db, table: string, column: string) => {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
};

export const migrateDb = (db: Db) => {
  if (!hasColumn(db, "posts", "sort_order")) {
    db.exec("ALTER TABLE posts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  }
  // settings table created in initDb; nothing else needed here yet
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

export const getUserById = (db: Db, id: number) => {
  return db
    .prepare(
      "SELECT id, username, password_hash as passwordHash, created_at as createdAt FROM users WHERE id = ?",
    )
    .get(id) as
    | (User & {
        passwordHash: string;
      })
    | undefined;
};

export const getFirstUser = (db: Db) => {
  return db
    .prepare(
      "SELECT id, username, password_hash as passwordHash, created_at as createdAt FROM users ORDER BY id ASC LIMIT 1",
    )
    .get() as
    | (User & {
        passwordHash: string;
      })
    | undefined;
};

export const updateUserCredentials = (
  db: Db,
  args: { id: number; username: string; passwordHash: string },
) => {
  db.prepare("UPDATE users SET username = ?, password_hash = ? WHERE id = ?").run(
    args.username,
    args.passwordHash,
    args.id,
  );
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
  sortOrder: row.sortOrder ?? 0,
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
        sort_order as sortOrder,
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
        sortOrder: number;
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
  // reserved slug(s) for standalone pages
  clauses.push("p.slug != 'about'");
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
        p.sort_order as sortOrder,
        p.created_at as createdAt,
        p.updated_at as updatedAt,
        p.published_at as publishedAt
      FROM posts p
      ${join}
      ${where}
      ORDER BY p.featured DESC, p.sort_order DESC, COALESCE(p.published_at, p.updated_at) DESC
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
    sortOrder: number;
    publishedAt: string | null;
  },
) => {
  const createdAt = nowIso();
  const updatedAt = createdAt;
  const info = db
    .prepare(
      `
      INSERT INTO posts
        (title, slug, summary, content_md, cover_image, status, featured, sort_order, created_at, updated_at, published_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      args.sortOrder,
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
    sortOrder: number;
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
      sort_order = ?,
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
    args.sortOrder,
    nowIso(),
    args.publishedAt,
    args.id,
  );
};

export type SiteSettings = {
  images: {
    homeHero: string;
    archiveHero: string;
    tagsHero: string;
    aboutHero: string;
    defaultPostCover: string;
  };
  sidebar: {
    avatarUrl: string;
    name: string;
    bio: string;
    noticeMd: string;
    followButtons: { label: string; url: string }[];
    socials: { type: string; url: string; label?: string }[];
  };
  about: {
    title: string;
    contentMd: string;
  };
};

export const defaultSiteSettings = (): SiteSettings => ({
  images: {
    homeHero: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=80",
    archiveHero: "https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=1920&q=80",
    tagsHero: "https://images.unsplash.com/photo-1516251193007-45ef944ab0c6?auto=format&fit=crop&w=1920&q=80",
    aboutHero: "https://images.unsplash.com/photo-1520975708790-7b8f4e6f4b2a?auto=format&fit=crop&w=1920&q=80",
    defaultPostCover:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80",
  },
  sidebar: {
    avatarUrl: "https://api.dicebear.com/7.x/notionists/svg?seed=YaBlog",
    name: "Admin",
    bio: "记录生活，热爱代码",
    noticeMd: "欢迎来到我的博客！",
    followButtons: [{ label: "Follow Me", url: "/about" }],
    socials: [
      { type: "github", url: "https://github.com/" },
      { type: "youtube", url: "https://youtube.com/" },
    ],
  },
  about: {
    title: "关于我",
    contentMd: "在后台「设置」里编辑关于页面内容。",
  },
});

export const getSiteSettings = (db: Db): SiteSettings => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get("site_settings") as
    | { value: string }
    | undefined;
  if (!row) return defaultSiteSettings();
  try {
    return JSON.parse(row.value) as SiteSettings;
  } catch {
    return defaultSiteSettings();
  }
};

export const setSiteSettings = (db: Db, settings: SiteSettings) => {
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).run("site_settings", JSON.stringify(settings), nowIso());
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
