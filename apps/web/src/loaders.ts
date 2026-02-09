import type { LoaderFunctionArgs } from "react-router-dom";

import { api, SiteSettings, Post } from "./api";

// ── Root Loader (site settings for SSR) ──

export type RootLoaderData = {
  site: SiteSettings | null;
};

export async function rootLoader(): Promise<RootLoaderData> {
  try {
    const res = await api.site();
    return { site: res.site };
  } catch {
    return { site: null };
  }
}

// ── Home ──

export type HomeLoaderData = {
  pinned: Awaited<ReturnType<typeof api.listPosts>>["items"];
  posts: Awaited<ReturnType<typeof api.listPosts>>["items"];
  total: number;
  limit: number;
};

export async function homeLoader(): Promise<HomeLoaderData> {
  const limit = 10;
  const [p, l] = await Promise.all([
    api.listPosts({ pinned: true, limit: 3 }).catch(() => ({ items: [], total: 0, page: 1, limit: 3 })),
    api.listPosts({ featured: false, page: 1, limit }).catch(() => ({ items: [], total: 0, page: 1, limit })),
  ]);
  return {
    pinned: p.items,
    posts: l.items,
    total: l.total,
    limit,
  };
}

// ── Post ──

export type PostLoaderData = {
  slug: string;
  post: Awaited<ReturnType<typeof api.getPost>>["post"];
  comments: Awaited<ReturnType<typeof api.listPostComments>>["items"];
};

export async function postLoader({ params }: LoaderFunctionArgs): Promise<PostLoaderData> {
  const slug = params.slug;
  if (!slug) throw new Response("Not Found", { status: 404 });
  const [p, c] = await Promise.all([
    api.getPost(slug),
    api.listPostComments(slug).catch(() => ({ items: [], total: 0 })),
  ]);
  return {
    slug,
    post: p.post,
    comments: c.items,
  };
}

// ── About ──

export type AboutLoaderData = {
  about: SiteSettings["about"] | null;
  heroImage: string;
};

export async function aboutLoader(): Promise<AboutLoaderData> {
  try {
    const res = await api.about();
    return { about: res.about, heroImage: res.heroImage };
  } catch {
    return { about: null, heroImage: "" };
  }
}

// ── Archive ──

export type ArchiveLoaderData = {
  posts: Post[];
  total: number;
};

export async function archiveLoader(): Promise<ArchiveLoaderData> {
  try {
    const res = await api.listPosts({ page: 1, limit: 12 });
    return { posts: res.items, total: res.total };
  } catch {
    return { posts: [], total: 0 };
  }
}

// ── Tag List ──

export type TagListLoaderData = {
  tags: string[];
};

export async function tagListLoader(): Promise<TagListLoaderData> {
  try {
    const res = await api.listTags();
    return { tags: res.items };
  } catch {
    return { tags: [] };
  }
}

// ── Tag ──

export type TagLoaderData = {
  tag: string;
  posts: Post[];
};

export async function tagLoader({ params }: LoaderFunctionArgs): Promise<TagLoaderData> {
  const tag = params.tag ?? "";
  try {
    const res = await api.listPosts({ tag, limit: 50 });
    return { tag, posts: res.items };
  } catch {
    return { tag, posts: [] };
  }
}

// ── Category List ──

export type CategoryListLoaderData = {
  categories: { name: string; slug: string }[];
};

export async function categoryListLoader(): Promise<CategoryListLoaderData> {
  try {
    const res = await api.listCategories();
    return { categories: res.items };
  } catch {
    return { categories: [] };
  }
}

// ── Category ──

export type CategoryLoaderData = {
  category: string;
  posts: Post[];
};

export async function categoryLoader({ params }: LoaderFunctionArgs): Promise<CategoryLoaderData> {
  const category = params.category ?? "";
  try {
    const res = await api.listPosts({ category, limit: 50 });
    return { category, posts: res.items };
  } catch {
    return { category, posts: [] };
  }
}

// ── Links ──

export type LinksLoaderData = {
  links: Awaited<ReturnType<typeof api.listLinks>>["items"];
  requests: Awaited<ReturnType<typeof api.listLinkRequests>>["items"];
};

export async function linksLoader(): Promise<LinksLoaderData> {
  try {
    const [a, b] = await Promise.all([
      api.listLinks(),
      api.listLinkRequests(),
    ]);
    return { links: a.items, requests: b.items };
  } catch {
    return { links: [], requests: [] };
  }
}
