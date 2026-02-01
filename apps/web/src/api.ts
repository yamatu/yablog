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

export type Captcha = { id: string; question: string };

export type Comment = {
  id: number;
  postId: number;
  author: string;
  contentMd: string;
  status: "pending" | "approved";
  createdAt: string;
  updatedAt: string;
};

export type CommentAdminRow = Comment & { postTitle: string; postSlug: string };

export type Link = {
  id: number;
  title: string;
  url: string;
  description: string;
  iconUrl: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type LinkRequest = {
  id: number;
  name: string;
  url: string;
  description: string;
  message: string;
  status: "pending" | "approved";
  createdAt: string;
};

export type SuspiciousIp = {
  ip: string;
  score: number;
  lastSeen: string;
  counts: Record<string, number>;
};

export type IpBan = {
  ip: string;
  reason: string;
  createdAt: string;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  // Optional image inputs (vision). Use data URLs (data:image/...;base64,...) to avoid server-side storage.
  images?: { dataUrl: string; name?: string }[];
};

export type AiSettings = {
  enabled: boolean;
  mode: "auto" | "http" | "codex";
  model: string;
  apiBase: string;
  apiKey: string;
  timeoutMs: number;
  codex: {
    configToml: string;
    authJson: string;
    envKey: string;
    wireApi: "responses" | "chat";
  };
};

export type CloudflareSettings = {
  enabled: boolean;
  autoPurge: boolean;
  email: string;
  apiKey: string;
  zoneId: string;
};

export type SiteSettings = {
  nav: {
    brandText: string;
    links: { label: string; path: string; icon: string }[];
  };
  tab: {
    title: string;
    awayTitle: string;
    faviconUrl: string;
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
  cdn: {
    cloudflare: {
      cacheEnabled: boolean;
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

export type ApiClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

function defaultApiBaseUrl() {
  // In the browser we prefer same-origin (/api) so Vite dev proxy & reverse proxies work.
  // In SSR (Node) we need an absolute origin.
  if (!import.meta.env.SSR) return "";
  const fromProcess = (globalThis as any)?.process?.env?.VITE_API_ORIGIN;
  const fromVite = (import.meta as any)?.env?.VITE_API_ORIGIN;
  return String(fromProcess || fromVite || "http://localhost:8787").trim();
}

function buildUrl(path: string, params?: Record<string, unknown>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `${path}?${qs}` : path;
}

function resolveUrl(baseUrl: string, input: string | URL) {
  if (input instanceof URL) return input.toString();
  if (/^https?:\/\//i.test(input)) return input;
  const base = (baseUrl ?? "").replace(/\/$/, "");
  if (!base) return input;
  return `${base}${input.startsWith("/") ? "" : "/"}${input}`;
}

async function json<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  input: string | URL,
  init?: RequestInit,
): Promise<T> {
  const url = resolveUrl(baseUrl, input);
  const res = await fetchImpl(url, {
    ...init,
    credentials: init?.credentials ?? "include",
  });
  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => null) as any;
      const err = typeof data?.error === "string" ? data.error : null;
      if (err === "invalid_credentials") throw new Error("用户名或密码错误");
      if (err === "invalid_captcha") throw new Error("验证码错误或已过期");
      if (err === "blocked_host") throw new Error("该站点地址不允许访问（安全限制）");
      if (err === "invalid_url") throw new Error("URL 不合法");
      if (err === "rate_limited") throw new Error("请求过于频繁，请稍后再试");
      if (err === "ip_banned") throw new Error("你的 IP 已被封禁");
      if (err) throw new Error(err);
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function parseApiError(payload: any, status: number) {
  const err = typeof payload?.error === "string" ? payload.error : null;
  if (err === "invalid_credentials") return new Error("用户名或密码错误");
  if (err === "invalid_captcha") return new Error("验证码错误或已过期");
  if (err === "blocked_host") return new Error("该站点地址不允许访问（安全限制）");
  if (err === "invalid_url") return new Error("URL 不合法");
  if (err === "rate_limited") return new Error("请求过于频繁，请稍后再试");
  if (err === "ip_banned") return new Error("你的 IP 已被封禁");
  if (err) return new Error(err);
  return new Error(`HTTP ${status}`);
}

async function xhrJson<T>(
  baseUrl: string,
  url: string,
  opts: {
    method: "POST" | "PUT" | "PATCH" | "DELETE";
    body?: Document | XMLHttpRequestBodyInit | null;
    headers?: Record<string, string>;
    onProgress?: (p: { loaded: number; total: number; percent: number }) => void;
  },
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(opts.method, resolveUrl(baseUrl, url), true);
    xhr.withCredentials = true;
    for (const [k, v] of Object.entries(opts.headers ?? {})) xhr.setRequestHeader(k, v);
    if (opts.onProgress) {
      xhr.upload.onprogress = (ev) => {
        const total = Number(ev.total || 0);
        const loaded = Number(ev.loaded || 0);
        const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((loaded / total) * 100))) : 0;
        opts.onProgress?.({ loaded, total, percent });
      };
    }
    xhr.onerror = () => reject(new Error("网络错误"));
    xhr.ontimeout = () => reject(new Error("请求超时"));
    xhr.onload = () => {
      const status = xhr.status || 0;
      const raw = xhr.responseText ?? "";
      let payload: any = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }
      if (status >= 200 && status < 300) {
        resolve(payload as T);
        return;
      }
      if (payload) reject(parseApiError(payload, status));
      else reject(new Error(raw || `HTTP ${status}`));
    };
    xhr.send(opts.body ?? null);
  });
}

export function createApiClient(opts?: ApiClientOptions) {
  const baseUrl = (opts?.baseUrl ?? defaultApiBaseUrl()).trim();
  const fetchImpl = opts?.fetchImpl ?? (globalThis.fetch as typeof fetch);

  const j = <T,>(input: string | URL, init?: RequestInit) => json<T>(fetchImpl, baseUrl, input, init);
  const x = <T,>(url: string, o: Parameters<typeof xhrJson<T>>[2]) => xhrJson<T>(baseUrl, url, o);

  return {
    health: () => j<{ ok: true }>("/api/health"),

  // Use POST to avoid aggressive CDN caching (e.g. Cloudflare "Cache Everything").
    // Use POST to avoid aggressive CDN caching (e.g. Cloudflare "Cache Everything").
    captcha: () => j<Captcha>("/api/captcha", { method: "POST" }),

    search: (args: { q: string; page?: number; limit?: number }) =>
      j<{
        items: Post[];
        total: number;
        page: number;
        limit: number;
        recommendations: Post[];
      }>(buildUrl("/api/search", args)),

    listPosts: (args: {
    page?: number;
    limit?: number;
    q?: string;
    tag?: string;
    category?: string;
    featured?: boolean;
    pinned?: boolean;
    }) => j<{ items: Post[]; total: number; page: number; limit: number }>(buildUrl("/api/posts", args)),

    getPost: (slug: string) => j<{ post: Post }>(`/api/posts/${encodeURIComponent(slug)}`),

    listPostComments: (slug: string) =>
      j<{ items: Comment[]; total: number }>(`/api/posts/${encodeURIComponent(slug)}/comments`),

    createPostComment: (
    slug: string,
    payload: { author: string; contentMd: string; captchaId: string; captchaAnswer: string },
  ) =>
      j<{ ok: true; id: number; status: "pending" }>(`/api/posts/${encodeURIComponent(slug)}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      }),

    listTags: () => j<{ items: string[] }>("/api/tags"),
    listCategories: () => j<{ items: { name: string; slug: string }[] }>("/api/categories"),

    listLinks: () => j<{ items: Link[] }>("/api/links"),
    listLinkRequests: () => j<{ items: LinkRequest[] }>("/api/links/requests"),

    createLinkRequest: (payload: {
    name: string;
    url: string;
    description?: string;
    message?: string;
    captchaId: string;
    captchaAnswer: string;
  }) =>
      j<{ ok: true; id: number; status: "pending" }>("/api/links/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      }),

    login: (args: { username: string; password: string }) =>
      j<{ ok: true; user: { id: number; username: string; createdAt: string } }>(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      },
    ),

    logout: () => j<{ ok: true }>("/api/auth/logout", { method: "POST" }),
    me: () => j<{ user: User }>("/api/auth/me"),

    site: () => j<{ site: SiteSettings }>("/api/site"),
    about: () => j<{ about: SiteSettings["about"]; heroImage: string }>("/api/about"),
    chat: (args: { messages: ChatMessage[] }) =>
      j<{ assistant: string }>("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
      }),

    adminListPosts: (args: { page?: number; limit?: number; q?: string; status?: string }) =>
      j<{ items: Post[]; total: number; page: number; limit: number }>(buildUrl("/api/admin/posts", args)),

    adminCreatePost: (payload: PostUpsertPayload) =>
      j<{ id: number; slug: string }>("/api/admin/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      }),

    adminUpdatePost: (id: number, payload: PostUpsertPayload) =>
      j<{ ok: true; slug: string }>(`/api/admin/posts/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      }),

    adminDeletePost: (id: number) => j<{ ok: true }>(`/api/admin/posts/${id}`, { method: "DELETE" }),

    adminUpdateAccount: (payload: {
    currentPassword: string;
    newUsername?: string;
    newPassword?: string;
  }) =>
      j<{ ok: true; user: User }>("/api/admin/account", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      }),

    adminRestoreBackup: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
      return j<{ ok: true; restarting: boolean }>("/api/admin/restore", {
      method: "POST",
      body: fd,
    });
  },

    adminRestoreFullBackup: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
      return j<{ ok: true; restarting: boolean }>("/api/admin/restore/full", {
      method: "POST",
      body: fd,
    });
  },

    adminGetSite: () => j<{ site: SiteSettings }>("/api/admin/site"),
    adminUpdateSite: (site: SiteSettings) =>
      j<{ ok: true }>("/api/admin/site", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site }),
      }),

    adminGetAi: () => j<{ ai: AiSettings }>("/api/admin/ai"),
    adminUpdateAi: (ai: AiSettings) =>
      j<{ ok: true }>("/api/admin/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ai }),
      }),

    adminGetCloudflare: () => j<{ cloudflare: CloudflareSettings }>("/api/admin/cloudflare"),
    adminUpdateCloudflare: (cloudflare: CloudflareSettings) =>
      j<{ ok: true }>("/api/admin/cloudflare", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cloudflare }),
      }),
    adminCloudflarePurge: () => j<{ ok: true }>("/api/admin/cloudflare/purge", { method: "POST" }),

    adminUploadImage: (file: File, opts?: { replace?: string; onProgress?: (p: { loaded: number; total: number; percent: number }) => void }) => {
    const fd = new FormData();
    fd.append("file", file);
      const url = buildUrl("/api/admin/upload", opts?.replace ? { replace: opts.replace } : undefined);
      return x<{ ok: true; url: string }>(url, { method: "POST", body: fd, onProgress: opts?.onProgress });
  },

    adminUploadImages: (files: File[], opts?: { onProgress?: (p: { loaded: number; total: number; percent: number }) => void }) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
      return x<{ ok: true; urls: string[]; failed: { name: string; error: string }[] }>(`/api/admin/upload/batch`, {
      method: "POST",
      body: fd,
      onProgress: opts?.onProgress,
    });
  },

    adminListUploads: () =>
      j<{
      items: {
        name: string;
        url: string;
        thumbUrl: string | null;
        size: number;
        updatedAt: string;
      }[];
      }>("/api/admin/uploads"),

    adminDeleteUpload: (name: string) =>
      j<{ ok: true }>(`/api/admin/uploads/${encodeURIComponent(name)}`, { method: "DELETE" }),

    adminUpdatePostOrder: (id: number, payload: { featured?: boolean; sortOrder?: number }) =>
      j<{ ok: true }>(`/api/admin/posts/${id}/order`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      }),

    adminListComments: (args: { status?: "pending" | "approved"; postId?: number }) =>
      j<{ items: CommentAdminRow[] }>(buildUrl("/api/admin/comments", {
        status: args.status,
        postId: args.postId,
      })),

    adminUpdateComment: (id: number, payload: { status?: "pending" | "approved"; contentMd?: string }) =>
      j<{ ok: true }>(`/api/admin/comments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      }),

    adminDeleteComment: (id: number) => j<{ ok: true }>(`/api/admin/comments/${id}`, { method: "DELETE" }),

    adminListLinks: () => j<{ items: Link[] }>("/api/admin/links"),

    adminCreateLink: (payload: { title: string; url: string; description?: string; iconUrl?: string; sortOrder?: number }) =>
      j<{ ok: true; id: number }>("/api/admin/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      }),

    adminUpdateLink: (
    id: number,
    payload: { title: string; url: string; description?: string; iconUrl?: string; sortOrder?: number },
  ) =>
      j<{ ok: true }>(`/api/admin/links/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      }),

    adminDeleteLink: (id: number) => j<{ ok: true }>(`/api/admin/links/${id}`, { method: "DELETE" }),

    adminListLinkRequests: (args: { status?: "pending" | "approved" }) =>
      j<{ items: LinkRequest[] }>(buildUrl("/api/admin/link-requests", { status: args.status })),

    adminUpdateLinkRequest: (id: number, payload: { status: "pending" | "approved" }) =>
      j<{ ok: true }>(`/api/admin/link-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      }),

    adminDeleteLinkRequest: (id: number) =>
      j<{ ok: true }>(`/api/admin/link-requests/${id}`, { method: "DELETE" }),

    adminDetectLinkIcon: (url: string) =>
      j<{ iconUrl: string }>(buildUrl("/api/admin/link-icon", { url })),

    adminListSuspiciousIps: (args?: { limit?: number }) =>
      j<{ redisEnabled: boolean; items: SuspiciousIp[] }>(buildUrl("/api/admin/security/suspicious", { limit: args?.limit })),

    adminListIpBans: () => j<{ items: IpBan[] }>("/api/admin/security/bans"),

    adminBanIps: (payload: { ips: string[]; reason?: string }) =>
      j<{ ok: true; added: number; invalid: string[] }>("/api/admin/security/bans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      }),

    adminUnbanIps: (payload: { ips: string[] }) =>
      j<{ ok: true; removed: number; invalid: string[] }>("/api/admin/security/bans/unban", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      }),
  };
}

export const api = createApiClient();
