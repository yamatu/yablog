import { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MdCheckBox,
  MdCode,
  MdDataObject,
  MdEdit,
  MdFormatBold,
  MdFormatItalic,
  MdFormatListBulleted,
  MdFormatListNumbered,
  MdFormatQuote,
  MdHorizontalRule,
  MdImage,
  MdLink,
  MdLooksOne,
  MdLooks3,
  MdLooksTwo,
  MdStrikethroughS,
  MdTableChart,
  MdViewSidebar,
  MdVisibility,
} from "react-icons/md";

type ViewMode = "edit" | "split" | "preview";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getLineBounds(text: string, start: number, end: number) {
  const s = clamp(start, 0, text.length);
  const e = clamp(end, 0, text.length);
  const lineStart = text.lastIndexOf("\n", s - 1) + 1;
  const lineEndIdx = text.indexOf("\n", e);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  return { lineStart, lineEnd };
}

function splitLinesKeepingNewlines(block: string) {
  const lines = block.split("\n");
  return lines;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeight = 360,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [view, setView] = useState<ViewMode>("split");

  const wordCount = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [value]);

  const setWithSelection = (next: string, selStart: number, selEnd: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  const applyInlineWrap = (prefix: string, suffix = prefix, placeholderText = "text") => {
    const el = textareaRef.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    const selected = value.slice(s, e) || placeholderText;
    const next = `${value.slice(0, s)}${prefix}${selected}${suffix}${value.slice(e)}`;
    const innerStart = s + prefix.length;
    const innerEnd = innerStart + selected.length;
    setWithSelection(next, innerStart, innerEnd);
  };

  const applyLinePrefix = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    const { lineStart, lineEnd } = getLineBounds(value, s, e);
    const block = value.slice(lineStart, lineEnd);
    const lines = splitLinesKeepingNewlines(block).map((line) => (line ? `${prefix}${line}` : prefix.trimEnd()));
    const nextBlock = lines.join("\n");
    const next = `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`;
    setWithSelection(next, lineStart, lineStart + nextBlock.length);
  };

  const applyHeading = (level: 1 | 2 | 3) => {
    applyLinePrefix(`${"#".repeat(level)} `);
  };

  const applyLink = () => {
    const el = textareaRef.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    const selected = value.slice(s, e) || "链接文本";
    const url = "https://";
    const snippet = `[${selected}](${url})`;
    const next = `${value.slice(0, s)}${snippet}${value.slice(e)}`;
    const urlStart = s + 2 + selected.length + 2;
    const urlEnd = urlStart + url.length;
    setWithSelection(next, urlStart, urlEnd);
  };

  const applyImage = () => {
    const el = textareaRef.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    const alt = value.slice(s, e) || "描述";
    const url = "https://";
    const snippet = `![${alt}](${url})`;
    const next = `${value.slice(0, s)}${snippet}${value.slice(e)}`;
    const urlStart = s + 3 + alt.length + 2;
    const urlEnd = urlStart + url.length;
    setWithSelection(next, urlStart, urlEnd);
  };

  const applyCodeBlock = () => {
    const el = textareaRef.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    const selected = value.slice(s, e);
    const lang = "ts";
    const body = selected || "console.log('hello');";
    const snippet = `\n\`\`\`${lang}\n${body}\n\`\`\`\n`;
    const next = `${value.slice(0, s)}${snippet}${value.slice(e)}`;
    const bodyStart = s + 1 + 3 + lang.length + 1;
    const bodyEnd = bodyStart + body.length;
    setWithSelection(next, bodyStart, bodyEnd);
  };

  const applyTable = () => {
    const el = textareaRef.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    const snippet = `\n| 标题 | 标题 |\n| --- | --- |\n| 内容 | 内容 |\n`;
    const next = `${value.slice(0, s)}${snippet}${value.slice(e)}`;
    const cellStart = s + 3;
    const cellEnd = cellStart + 2;
    setWithSelection(next, cellStart, cellEnd);
  };

  const applyHr = () => {
    const el = textareaRef.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    const snippet = `\n---\n`;
    const next = `${value.slice(0, s)}${snippet}${value.slice(e)}`;
    const cursor = s + snippet.length;
    setWithSelection(next, cursor, cursor);
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="toolbar" role="toolbar" aria-label="Markdown 工具栏">
        <div className="toolGroup">
          <button type="button" className="toolBtn" onClick={() => applyHeading(1)} data-tooltip="H1 标题">
            <MdLooksOne />
          </button>
          <button type="button" className="toolBtn" onClick={() => applyHeading(2)} data-tooltip="H2 标题">
            <MdLooksTwo />
          </button>
          <button type="button" className="toolBtn" onClick={() => applyHeading(3)} data-tooltip="H3 标题">
            <MdLooks3 />
          </button>
        </div>
        <div className="toolDivider" />
        <div className="toolGroup">
          <button type="button" className="toolBtn" onClick={() => applyInlineWrap("**")} data-tooltip="加粗">
            <MdFormatBold />
          </button>
          <button type="button" className="toolBtn" onClick={() => applyInlineWrap("*")} data-tooltip="斜体">
            <MdFormatItalic />
          </button>
          <button type="button" className="toolBtn" onClick={() => applyInlineWrap("~~")} data-tooltip="删除线">
            <MdStrikethroughS />
          </button>
          <button type="button" className="toolBtn" onClick={() => applyInlineWrap("`")} data-tooltip="行内代码">
            <MdCode />
          </button>
          <button type="button" className="toolBtn" onClick={applyCodeBlock} data-tooltip="代码块">
            <MdDataObject />
          </button>
        </div>
        <div className="toolDivider" />
        <div className="toolGroup">
          <button type="button" className="toolBtn" onClick={applyLink} data-tooltip="超链接">
            <MdLink />
          </button>
          <button type="button" className="toolBtn" onClick={applyImage} data-tooltip="图片">
            <MdImage />
          </button>
        </div>
        <div className="toolDivider" />
        <div className="toolGroup">
          <button
            type="button"
            className="toolBtn"
            onClick={() => applyLinePrefix("> ")}
            data-tooltip="引用"
          >
            <MdFormatQuote />
          </button>
          <button
            type="button"
            className="toolBtn"
            onClick={() => applyLinePrefix("- ")}
            data-tooltip="无序列表"
          >
            <MdFormatListBulleted />
          </button>
          <button
            type="button"
            className="toolBtn"
            onClick={() => applyLinePrefix("1. ")}
            data-tooltip="有序列表"
          >
            <MdFormatListNumbered />
          </button>
          <button
            type="button"
            className="toolBtn"
            onClick={() => applyLinePrefix("- [ ] ")}
            data-tooltip="任务列表"
          >
            <MdCheckBox />
          </button>
          <button type="button" className="toolBtn" onClick={applyTable} data-tooltip="表格">
            <MdTableChart />
          </button>
          <button type="button" className="toolBtn" onClick={applyHr} data-tooltip="分割线">
            <MdHorizontalRule />
          </button>
        </div>
        <div className="toolDivider" />
        <div className="toolGroup">
          <button
            type="button"
            className={`toolBtn ${view === "edit" ? "toolBtnActive" : ""}`}
            onClick={() => setView("edit")}
            data-tooltip="仅编辑"
          >
            <MdEdit />
          </button>
          <button
            type="button"
            className={`toolBtn ${view === "split" ? "toolBtnActive" : ""}`}
            onClick={() => setView("split")}
            data-tooltip="分屏"
          >
            <MdViewSidebar />
          </button>
          <button
            type="button"
            className={`toolBtn ${view === "preview" ? "toolBtnActive" : ""}`}
            onClick={() => setView("preview")}
            data-tooltip="仅预览"
          >
            <MdVisibility />
          </button>
        </div>
      </div>

      <div className={`editorGrid ${view === "split" ? "editorGridSplit" : ""}`}>
        {view !== "preview" ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            style={{
              minHeight,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              width: "100%",
              resize: "vertical",
            }}
          />
        ) : null}

        {view !== "edit" ? (
          <div
            className="markdown"
            style={{
              minHeight,
              padding: 14,
              borderRadius: 16,
              background: "color-mix(in oklab, var(--card2) 78%, transparent)",
              border: "1px solid color-mix(in oklab, var(--border) 82%, transparent)",
              overflow: "auto",
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value || ""}</ReactMarkdown>
            {!value.trim() ? <div className="muted">预览区：开始输入内容吧。</div> : null}
          </div>
        ) : null}
      </div>

      <div className="meta">
        <span className="pill">字数：{wordCount}</span>
        <span className="pill">GFM：表格 / 任务列表 / 删除线</span>
      </div>
    </div>
  );
}
