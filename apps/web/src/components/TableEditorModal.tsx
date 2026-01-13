import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MdAdd, MdClose, MdDelete, MdTableChart } from "react-icons/md";

type Align = "left" | "center" | "right";

type TableData = {
  rows: string[][];
  align: Align[];
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const normalizeGrid = (grid: string[][], rows: number, cols: number) => {
  const out: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const row = grid[r] ? [...grid[r]] : [];
    while (row.length < cols) row.push("");
    out.push(row.slice(0, cols));
  }
  return out;
};

const splitRow = (line: string) => {
  const trimmed = line.trim();
  const core = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const core2 = core.endsWith("|") ? core.slice(0, -1) : core;
  return core2.split("|").map((c) => c.trim());
};

export const parseMarkdownTable = (md: string): TableData | null => {
  const lines = md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  if (!lines[0].includes("|") || !lines[1].includes("|")) return null;

  const header = splitRow(lines[0]);
  const sep = splitRow(lines[1]);
  const cols = Math.max(header.length, sep.length);
  if (cols < 2) return null;

  const isSep = (cell: string) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, ""));
  if (!sep.slice(0, cols).every((c) => isSep(c))) return null;

  const align: Align[] = [];
  for (let i = 0; i < cols; i++) {
    const c = (sep[i] ?? "").replace(/\s+/g, "");
    if (c.startsWith(":") && c.endsWith(":")) align.push("center");
    else if (c.endsWith(":")) align.push("right");
    else align.push("left");
  }

  const body: string[][] = [];
  for (const l of lines.slice(2)) {
    if (!l.includes("|")) break;
    body.push(splitRow(l));
  }

  const rows = [header, ...body];
  return { rows: normalizeGrid(rows, rows.length, cols), align };
};

export const toMarkdownTable = (data: TableData) => {
  const rows = data.rows;
  const cols = rows[0]?.length ?? 0;
  if (!cols) return "";

  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
  const renderRow = (cells: string[]) => `| ${cells.map(esc).join(" | ")} |`;
  const renderSep = () =>
    `| ${data.align
      .slice(0, cols)
      .map((a) => (a === "center" ? ":---:" : a === "right" ? "---:" : "---"))
      .join(" | ")} |`;

  const header = renderRow(rows[0]);
  const sep = renderSep();
  const body = rows.slice(1).map(renderRow);
  return [header, sep, ...body].join("\n");
};

export function TableEditorModal({
  open,
  onClose,
  initialMarkdown,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  initialMarkdown?: string;
  onInsert: (markdown: string) => void;
}) {
  const parsed = useMemo(() => (initialMarkdown ? parseMarkdownTable(initialMarkdown) : null), [initialMarkdown]);

  const [rowsCount, setRowsCount] = useState(3);
  const [colsCount, setColsCount] = useState(3);
  const [grid, setGrid] = useState<string[][]>([
    ["标题1", "标题2", "标题3"],
    ["内容", "内容", "内容"],
    ["内容", "内容", "内容"],
  ]);
  const [align, setAlign] = useState<Align[]>(["left", "left", "left"]);

  useEffect(() => {
    if (!open) return;
    if (parsed) {
      setRowsCount(parsed.rows.length);
      setColsCount(parsed.rows[0]?.length ?? 2);
      setGrid(parsed.rows);
      setAlign(parsed.align.length ? parsed.align : Array(parsed.rows[0]?.length ?? 2).fill("left"));
    } else {
      setRowsCount(3);
      setColsCount(3);
      setGrid([
        ["标题1", "标题2", "标题3"],
        ["内容", "内容", "内容"],
        ["内容", "内容", "内容"],
      ]);
      setAlign(["left", "left", "left"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const normalized = useMemo(() => {
    const safeRows = clamp(rowsCount, 2, 30);
    const safeCols = clamp(colsCount, 2, 12);
    const nextGrid = normalizeGrid(grid, safeRows, safeCols);
    const nextAlign = [...align];
    while (nextAlign.length < safeCols) nextAlign.push("left");
    return { safeRows, safeCols, nextGrid, nextAlign: nextAlign.slice(0, safeCols) };
  }, [rowsCount, colsCount, grid, align]);

  const md = useMemo(() => toMarkdownTable({ rows: normalized.nextGrid, align: normalized.nextAlign }), [normalized]);

  if (!open) return null;

  return createPortal(
    <div
      className="adminRoot"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} className="glass" style={{ width: "min(1100px, 96vw)", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <MdTableChart />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>表格编辑器</div>
              <div className="muted">可视化编辑后插入为 Markdown 表格</div>
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose} title="关闭">
            <MdClose size={20} />
          </button>
        </div>

        <div style={{ height: 16 }} />

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="muted">行</span>
              <input
                type="number"
                value={rowsCount}
                onChange={(e) => setRowsCount(Number(e.target.value) || 2)}
                min={2}
                max={30}
                style={{ width: 110 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="muted">列</span>
              <input
                type="number"
                value={colsCount}
                onChange={(e) => setColsCount(Number(e.target.value) || 2)}
                min={2}
                max={12}
                style={{ width: 110 }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="muted">对齐</span>
              {normalized.nextAlign.map((a, idx) => (
                <select
                  key={idx}
                  value={a}
                  onChange={(e) => {
                    const v = e.target.value as Align;
                    const next = [...normalized.nextAlign];
                    next[idx] = v;
                    setAlign(next);
                  }}
                  style={{ width: 110 }}
                  title={`第 ${idx + 1} 列对齐`}
                >
                  <option value="left">左</option>
                  <option value="center">中</option>
                  <option value="right">右</option>
                </select>
              ))}
            </div>

            <div style={{ flex: 1 }} />

            <button
              className="btn-ghost"
              onClick={() => {
                setRowsCount((n) => clamp(n + 1, 2, 30));
              }}
              title="增加一行"
            >
              <MdAdd /> 行
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setColsCount((n) => clamp(n + 1, 2, 12));
              }}
              title="增加一列"
            >
              <MdAdd /> 列
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setRowsCount((n) => clamp(n - 1, 2, 30));
              }}
              title="删除一行"
            >
              <MdDelete /> 行
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setColsCount((n) => clamp(n - 1, 2, 12));
              }}
              title="删除一列"
            >
              <MdDelete /> 列
            </button>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ marginBottom: 10 }}>编辑表格（第一行视为表头）</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {normalized.nextGrid.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c} style={{ border: "1px solid var(--border)", padding: 6, minWidth: 160 }}>
                        <input
                          value={cell}
                          onChange={(e) => {
                            const next = normalizeGrid(normalized.nextGrid, normalized.safeRows, normalized.safeCols);
                            next[r][c] = e.target.value;
                            setGrid(next);
                          }}
                          placeholder={r === 0 ? `标题${c + 1}` : `内容`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ marginBottom: 10 }}>生成的 Markdown</div>
          <textarea value={md} readOnly style={{ minHeight: 140, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }} />
        </div>

        <div style={{ height: 16 }} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button
            className="btn-primary"
            onClick={() => {
              onInsert(md);
              onClose();
            }}
          >
            插入表格
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

