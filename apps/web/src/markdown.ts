export type TocItem = {
  id: string;
  level: 1 | 2 | 3;
  text: string;
};

export function createSlugger() {
  const used = new Map<string, number>();
  return (raw: string) => {
    let base = raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}-]+/gu, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (!base) base = "section";
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };
}

export function stripInlineMarkdown(input: string) {
  return input
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function buildToc(markdown: string): TocItem[] {
  const slug = createSlugger();
  const items: TocItem[] = [];
  const lines = markdown.split("\n");
  let inFence = false;
  let fenceMarker: "```" | "~~~" | null = null;

  for (const line of lines) {
    const fence = line.match(/^\s*(```|~~~)/)?.[1] as "```" | "~~~" | undefined;
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence;
      } else if (fenceMarker === fence) {
        inFence = false;
        fenceMarker = null;
      }
      continue;
    }
    if (inFence) continue;

    const m = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const level = m[1].length as 1 | 2 | 3;
    const text = stripInlineMarkdown(m[2]);
    if (!text) continue;
    items.push({ level, text, id: slug(text) });
  }

  return items;
}

export function extractImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const lines = markdown.split("\n");
  let inFence = false;
  let fenceMarker: "```" | "~~~" | null = null;

  const add = (raw: string) => {
    const u = String(raw || "").trim();
    if (!u) return;
    const cleaned = u.replace(/^<|>$/g, "");
    if (!cleaned) return;
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    urls.push(cleaned);
  };

  for (const line of lines) {
    const fence = line.match(/^\s*(```|~~~)/)?.[1] as "```" | "~~~" | undefined;
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence;
      } else if (fenceMarker === fence) {
        inFence = false;
        fenceMarker = null;
      }
      continue;
    }
    if (inFence) continue;

    // Markdown image: ![alt](url "title")
    for (const m of line.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      const inner = (m[1] ?? "").trim();
      if (!inner) continue;
      const first = inner.split(/\s+/)[0] ?? "";
      add(first);
    }

    // HTML: <img src="...">
    for (const m of line.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
      add(m[1] ?? "");
    }
  }

  return urls;
}
