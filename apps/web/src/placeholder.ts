function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export function placeholderImageDataUrl(seed: string, text?: string) {
  const h = hashString(seed);
  const hue = h % 360;
  const hue2 = (hue + 35) % 360;
  const label = (text ?? "").trim().slice(0, 10);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue}, 70%, 55%)" stop-opacity="0.65"/>
      <stop offset="1" stop-color="hsl(${hue2}, 75%, 60%)" stop-opacity="0.65"/>
    </linearGradient>
    <radialGradient id="r" cx="35%" cy="25%" r="85%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.18"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#g)"/>
  <rect width="1600" height="900" fill="url(#r)"/>
  <g opacity="0.25">
    <circle cx="1220" cy="180" r="140" fill="#fff"/>
    <circle cx="1320" cy="270" r="70" fill="#fff"/>
    <circle cx="260" cy="720" r="180" fill="#fff"/>
  </g>
  ${
    label
      ? `<text x="70" y="820" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="72" font-weight="700" fill="#ffffff" opacity="0.75">${esc(label)}</text>`
      : ""
  }
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

