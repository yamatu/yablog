import React from "react";
import { renderToString } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from "react-router-dom/server";

import { ssrRoutes } from "./routes.ssr";
import { buildSeoHead, renderSeoHead, type SeoLoaderData } from "./seo";

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

  const head = buildSeoHead({ url, loaderData: context.loaderData as SeoLoaderData });

  return {
    type: "render" as const,
    appHtml,
    hydrationData,
    headTags: renderSeoHead(head),
  };
}
