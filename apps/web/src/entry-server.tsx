import React from "react";
import { renderToString } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from "react-router-dom/server";

import { ssrRoutes } from "./routes.ssr";
import type { HomeLoaderData, PostLoaderData } from "./loaders";

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function makeHead({
  url,
  loaderData,
}: {
  url: URL;
  loaderData: Record<string, unknown> | null | undefined;
}) {
  const path = url.pathname;
  const origin = url.origin;

  if (path === "/") {
    const title = "YaBlog";
    const desc = "YaBlog - A modern blog.";
    return {
      title,
      headTags: `\n<title>${escapeHtml(title)}</title>\n<meta name="description" content="${escapeHtml(desc)}" />\n<link rel="canonical" href="${escapeHtml(origin + "/")}" />\n`,
    };
  }

  if (path.startsWith("/post/")) {
    const data = (loaderData?.post ?? null) as PostLoaderData | null;
    const post = data?.post;
    if (!post) {
      const title = "文章未找到";
      return {
        title,
        headTags: `\n<title>${escapeHtml(title)}</title>\n<meta name="robots" content="noindex" />\n`,
      };
    }

    const title = post.title;
    const canonical = `${origin}/post/${encodeURIComponent(post.slug)}`;
    const desc = (post.summary || post.contentMd.slice(0, 160).replace(/\n/g, " ")).trim();
    let image = (post.coverImage || "").trim();
    if (image && image.startsWith("/")) image = origin + image;

    const publishedTime = post.publishedAt || post.createdAt;
    const modifiedTime = post.updatedAt;

    return {
      title,
      headTags: `\n<title>${escapeHtml(title)}</title>\n<meta name="description" content="${escapeHtml(desc)}" />\n<link rel="canonical" href="${escapeHtml(canonical)}" />\n<meta property="og:type" content="article" />\n<meta property="og:title" content="${escapeHtml(title)}" />\n<meta property="og:description" content="${escapeHtml(desc)}" />\n<meta property="og:url" content="${escapeHtml(canonical)}" />\n${image ? `<meta property="og:image" content="${escapeHtml(image)}" />\n` : ""}<meta property="article:published_time" content="${escapeHtml(publishedTime)}" />\n<meta property="article:modified_time" content="${escapeHtml(modifiedTime)}" />\n<meta name="twitter:card" content="summary_large_image" />\n<meta name="twitter:title" content="${escapeHtml(title)}" />\n<meta name="twitter:description" content="${escapeHtml(desc)}" />\n${image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />\n` : ""}`,
    };
  }

  return { title: "YaBlog", headTags: "" };
}

export async function render(requestUrl: string, opts?: { headers?: Record<string, string> }) {
  const url = new URL(requestUrl);

  const { query, dataRoutes } = createStaticHandler(ssrRoutes);
  const request = new Request(url.toString(), {
    method: "GET",
    headers: opts?.headers,
  });

  const context = await query(request);
  if (context instanceof Response) {
    return { type: "response" as const, response: context };
  }

  const router = createStaticRouter(dataRoutes, context);
  const appHtml = renderToString(
    <StaticRouterProvider router={router} context={context} hydrate={false} />
  );

  const hydrationData = {
    loaderData: context.loaderData,
    actionData: context.actionData,
    errors: null,
  };

  const head = makeHead({ url, loaderData: context.loaderData });

  return {
    type: "render" as const,
    appHtml,
    hydrationData,
    headTags: head.headTags,
  };
}
