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

export type User = { userId: number; username: string };

export type SiteSettings = {
  nav: {
    brandText: string;
    links: { label: string; path: string; icon: string }[];
  };
  footer: {
    text: string;
  };
  home: {
    title: string;
    subtitle: string;
  };
  security: {
    hotlink: {
      enabled: boolean;
      allowedOrigins: string[];
    };
  };
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

export type PostUpsertPayload = {
  title: string;
  contentMd: string;
  slug?: string;
  summary?: string;
  coverImage?: string | null;
  status?: "draft" | "published";
  featured?: boolean;
  sortOrder?: number;
  tags?: string[];
  categories?: string[];
  publishedAt?: string | null;
};

async function json<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: "include" });
  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => null) as any;
      const err = typeof data?.error === "string" ? data.error : null;
      if (err === "invalid_credentials") throw new Error("用户名或密码错误");
      if (err) throw new Error(err);
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => json<{ ok: true }>("/api/health"),

  search: (args: { q: string; page?: number; limit?: number }) => {
    const url = new URL("/api/search", window.location.origin);
    for (const [k, v] of Object.entries(args)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
    return json<{
      items: Post[];
      total: number;
      page: number;
      limit: number;
      recommendations: Post[];
    }>(url);
  },

  listPosts: (args: {
    page?: number;
    limit?: number;
    q?: string;
    tag?: string;
    category?: string;
    featured?: boolean;
    pinned?: boolean;
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

  site: () => json<{ site: SiteSettings }>("/api/site"),
  about: () => json<{ about: SiteSettings["about"]; heroImage: string }>("/api/about"),

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

  adminRestoreFullBackup: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return json<{ ok: true; restarting: boolean }>("/api/admin/restore/full", {
      method: "POST",
      body: fd,
    });
  },

  adminGetSite: () => json<{ site: SiteSettings }>("/api/admin/site"),
  adminUpdateSite: (site: SiteSettings) =>
    json<{ ok: true }>("/api/admin/site", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site }),
    }),

  adminUploadImage: (file: File, opts?: { replace?: string }) => {
    const fd = new FormData();
    fd.append("file", file);
    const url = new URL("/api/admin/upload", window.location.origin);
    if (opts?.replace) url.searchParams.set("replace", opts.replace);
    return json<{ ok: true; url: string }>(url, {
      method: "POST",
      body: fd,
    });
  },

  adminListUploads: () =>
    json<{
      items: {
        name: string;
        url: string;
        thumbUrl: string | null;
        size: number;
        updatedAt: string;
      }[];
    }>("/api/admin/uploads"),

  adminDeleteUpload: (name: string) =>
    json<{ ok: true }>(`/api/admin/uploads/${encodeURIComponent(name)}`, { method: "DELETE" }),

  adminUpdatePostOrder: (id: number, payload: { featured?: boolean; sortOrder?: number }) =>
    json<{ ok: true }>(`/api/admin/posts/${id}/order`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
};
