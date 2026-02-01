import React from "react";
import ReactDOM from "react-dom/client";
import { hydrateRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { routes } from "./routes";
import "katex/dist/katex.min.css";
import "./styles.css";

declare global {
  interface Window {
    __staticRouterHydrationData?: unknown;
  }
}

const hydrationData = window.__staticRouterHydrationData as any | undefined;
const router = createBrowserRouter(routes, hydrationData ? { hydrationData } : undefined);

const rootEl = document.getElementById("root")!;
const app = (
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

// If SSR provided markup + hydration data, hydrate. Otherwise, client render.
if (hydrationData && rootEl.childNodes.length > 0) {
  hydrateRoot(rootEl, app);
} else {
  ReactDOM.createRoot(rootEl).render(app);
}

// Fade out and remove the HTML boot loader after the first render.
requestAnimationFrame(() => {
  document.body.classList.add("boot-loaded");
  const el = document.getElementById("boot-loader");
  if (el) setTimeout(() => el.remove(), 420);
});
