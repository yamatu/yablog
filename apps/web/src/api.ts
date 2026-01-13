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

export type User = { userId: number; username: string };

export type PostUpsertPayload = {
  title: string;
  contentMd: string;
  slug?: string;
  summary?: string;
  coverImage?: string | null;
  status?: "draft" | "published";
  featured?: boolean;
  tags?: string[];
  categories?: string[];
  publishedAt?: string | null;
};

async function json<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: "include" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => json<{ ok: true }>("/api/health"),

  listPosts: (args: {
    page?: number;
    limit?: number;
    q?: string;
    tag?: string;
    category?: string;
    featured?: boolean;
  }) => {
    const url = new URL("/api/posts", window.location.origin);
    for (const [k, v] of Object.entries(args)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
    return json<{ items: Post[]; total: number; page: number; limit: number }>(url);
  },

  getPost: (slug: string) => json<{ post: Post }>(`/api/posts/${encodeURIComponent(slug)}`),

  listTags: () => json<{ items: string[] }>("/api/tags"),
  listCategories: () => json<{ items: { name: string; slug: string }[] }>("/api/categories"),

  login: (args: { username: string; password: string }) =>
    json<{ ok: true; user: { id: number; username: string; createdAt: string } }>(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      },
    ),

  logout: () => json<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => json<{ user: User }>("/api/auth/me"),

  adminListPosts: (args: { page?: number; limit?: number; q?: string; status?: string }) => {
    const url = new URL("/api/admin/posts", window.location.origin);
    for (const [k, v] of Object.entries(args)) {
      if (!v) continue;
      url.searchParams.set(k, String(v));
    }
    return json<{ items: Post[]; total: number; page: number; limit: number }>(url);
  },

  adminCreatePost: (payload: PostUpsertPayload) =>
    json<{ id: number; slug: string }>("/api/admin/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),

  adminUpdatePost: (id: number, payload: PostUpsertPayload) =>
    json<{ ok: true; slug: string }>(`/api/admin/posts/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),

  adminDeletePost: (id: number) =>
    json<{ ok: true }>(`/api/admin/posts/${id}`, { method: "DELETE" }),

  adminUpdateAccount: (payload: {
    currentPassword: string;
    newUsername?: string;
    newPassword?: string;
  }) =>
    json<{ ok: true; user: User }>("/api/admin/account", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),

  adminRestoreBackup: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return json<{ ok: true; restarting: boolean }>("/api/admin/restore", {
      method: "POST",
      body: fd,
    });
  },
};
