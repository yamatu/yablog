import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { MdContentCopy, MdDone } from "react-icons/md";

const normalizeCssLength = (v: string) => {
  const s = v.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return `${s}px`;
  if (/^\d+(\.\d+)?(px|%|rem|em|vw|vh)$/.test(s)) return s;
  return null;
};

const parseSizing = (title?: string | null) => {
  const raw = (title ?? "").trim();
  if (!raw) return { width: null as string | null, height: null as string | null };

  // Examples:
  // ![](url "w=600")
  // ![](url "w=80% h=300")
  // ![](url "width=600 height=auto")
  const pick = (key: string) => {
    const m = raw.match(new RegExp(`(?:^|\\s)${key}=([^\\s]+)`, "i"));
    return m?.[1] ?? null;
  };
  const w = pick("w") ?? pick("width");
  const h = pick("h") ?? pick("height");
  return { width: w ? normalizeCssLength(w) : null, height: h ? normalizeCssLength(h) : null };
};

export function Markdown({
  value,
  components,
  onImageClick,
}: {
  value: string;
  components?: Components;
  onImageClick?: (src: string) => void;
}) {
  const CodeBlock = ({
    className,
    children,
    inline,
  }: {
    className?: string;
    children?: any;
    inline?: boolean;
  }) => {
    const raw = String(children ?? "");
    const text = raw.endsWith("\n") ? raw.slice(0, -1) : raw;

    if (inline) {
      return <code className={`inlineCode ${className ?? ""}`.trim()}>{text}</code>;
    }

    const lang = (className ?? "").match(/language-([\w-]+)/i)?.[1] ?? "";
    const [copied, setCopied] = useState(false);
    const preRef = useRef<HTMLPreElement | null>(null);
    const [overflow, setOverflow] = useState(false);

    const onCopy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      } catch {
        // ignore
      }
    };

    useEffect(() => {
      const el = preRef.current;
      if (!el) return;

      const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
      check();

      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(check);
        ro.observe(el);
      }
      window.addEventListener("resize", check, { passive: true });
      return () => {
        ro?.disconnect();
        window.removeEventListener("resize", check);
      };
    }, [text]);

    return (
      <div className="codeBlock" data-overflow={overflow ? "1" : "0"}>
        <div className="codeBlockBar">
          <div className="codeBlockLang">{lang || "code"}</div>
          <button className="codeCopyBtn" type="button" onClick={onCopy} title="复制代码">
            {copied ? <MdDone /> : <MdContentCopy />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        <pre ref={preRef}>
          <code className={className}>{text}</code>
        </pre>
      </div>
    );
  };

  const defaults: Components = {
    img: ({ style, title, ...props }) => {
      const { width, height } = parseSizing(title);
      const src = String((props as any)?.src ?? "");
      const clickable = Boolean(onImageClick && src);
      const img = (
        <img
          {...props}
          loading="lazy"
          title={title ?? undefined}
          style={{
            maxWidth: "100%",
            height: "auto",
            display: "block",
            margin: "14px auto",
            ...(style as any),
            ...(width ? { width } : null),
            ...(height ? { height } : null),
            ...(clickable ? { cursor: "zoom-in" } : null),
          }}
        />
      );
      if (!clickable) return img;
      return (
        <button
          type="button"
          title="点击放大"
          onClick={() => onImageClick?.(src)}
          style={{ padding: 0, border: "none", background: "transparent", width: "100%" }}
        >
          {img}
        </button>
      );
    },
    pre: ({ children }) => <>{children}</>,
    code: (props: any) => <CodeBlock {...props} />,
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{ ...defaults, ...(components ?? {}) }}
    >
      {value}
    </ReactMarkdown>
  );
}
