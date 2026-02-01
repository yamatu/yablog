import type { LoaderFunctionArgs } from "react-router-dom";

import { api } from "./api";

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
