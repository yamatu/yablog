import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import "katex/dist/katex.min.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Fade out and remove the HTML boot loader after the first render.
requestAnimationFrame(() => {
  document.body.classList.add("boot-loaded");
  const el = document.getElementById("boot-loader");
  if (el) setTimeout(() => el.remove(), 420);
});
