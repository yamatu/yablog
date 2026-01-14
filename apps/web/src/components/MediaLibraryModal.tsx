import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { MdClose, MdContentCopy, MdDelete, MdFileUpload, MdSearch } from "react-icons/md";

import { api } from "../api";

type UploadItem = {
  name: string;
  url: string;
  thumbUrl: string | null;
  size: number;
  updatedAt: string;
};

function prettyBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function MediaLibraryPanel({
  onSelect,
  onRequestClose,
  showClose = true,
  autoCloseOnSelect = false,
  containerStyle,
}: {
  onSelect: (url: string) => void;
  onRequestClose?: () => void;
  showClose?: boolean;
  autoCloseOnSelect?: boolean;
  containerStyle?: CSSProperties;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const refresh = async () => {
    setErr(null);
    const res = await api.adminListUploads();
    setItems(res.items);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy(true);
        await refresh();
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      } finally {
        if (!alive) return;
        setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) => it.name.toLowerCase().includes(needle));
  }, [items, q]);

  useEffect(() => {
    setSelected((prev) => {
      if (!prev.size) return prev;
      const visible = new Set(items.map((it) => it.name));
      const next = new Set<string>();
      for (const name of prev) if (visible.has(name)) next.add(name);
      return next;
    });
  }, [items]);

  const filteredNames = filtered.map((it) => it.name);
  const allSelected = filteredNames.length > 0 && filteredNames.every((n) => selected.has(n));
  const selectedCount = selected.size;
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const n of filteredNames) next.delete(n);
      } else {
        for (const n of filteredNames) next.add(n);
      }
      return next;
    });

  return (
    <div
      className="glass"
      style={{
        width: "100%",
        maxWidth: "100%",
        overflow: "auto",
        ...containerStyle,
      }}
    >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>图库</div>
            <div className="muted">上传 / 选择 / 替换 / 删除，你的站点图片都会存放在这里</div>
          </div>
          {showClose ? (
            <button
              onClick={onRequestClose}
              title="关闭"
              style={{ background: "transparent", border: "none", boxShadow: "none" }}
            >
              <MdClose size={22} />
            </button>
          ) : null}
        </div>

        <div style={{ height: 16 }} />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label className="pill" style={{ display: "inline-flex", gap: 8, alignItems: "center", cursor: "pointer" }} title="上传新图片">
            <MdFileUpload />
            上传图片
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = "";
                if (!f) return;
                setErr(null);
                setBusy(true);
                try {
                  await api.adminUploadImage(f);
                  await refresh();
                } catch (err: any) {
                  setErr(err?.message ?? String(err));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>

          <label className="pill" style={{ display: "inline-flex", gap: 8, alignItems: "center", cursor: "pointer" }} title="全选/取消全选（基于当前筛选）">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 18, height: 18 }} />
            全选
          </label>

          {selectedCount ? (
            <>
              <span className="muted" style={{ whiteSpace: "nowrap" }}>已选 {selectedCount}</span>
              <button className="pill" onClick={() => setSelected(new Set())} title="清空选择">
                清空
              </button>
              <button
                className="pill"
                title="批量删除"
                onClick={async () => {
                  if (!selectedCount) return;
                  if (!confirm(`删除选中的 ${selectedCount} 张图片？（引用这些 URL 的地方会失效）`)) return;
                  setErr(null);
                  setBusy(true);
                  try {
                    const names = Array.from(selected);
                    for (const name of names) {
                      await api.adminDeleteUpload(name);
                    }
                    setSelected(new Set());
                    await refresh();
                  } catch (err: any) {
                    setErr(err?.message ?? String(err));
                  } finally {
                    setBusy(false);
                  }
                }}
                style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted2)" }}
              >
                <MdDelete />
                批量删除
              </button>
            </>
          ) : null}

          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ position: "relative" }}>
              <MdSearch style={{ position: "absolute", left: 10, top: 10, opacity: 0.7 }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="按文件名搜索…"
                style={{ paddingLeft: 34 }}
              />
            </div>
          </div>

          <div className="muted" style={{ whiteSpace: "nowrap" }}>
            {busy ? "加载中…" : `${filtered.length} 张`}
          </div>
        </div>

        {err ? <div style={{ marginTop: 12, color: "red" }}>{err}</div> : null}

        <div style={{ height: 16 }} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 14,
          }}
        >
          {filtered.map((it) => (
            <div key={it.name} className="card" style={{ overflow: "hidden", padding: 0 }}>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => {
                    onSelect(it.url);
                    if (autoCloseOnSelect) onRequestClose?.();
                  }}
                  title="选择此图片"
                  style={{
                    display: "block",
                    width: "100%",
                    padding: 0,
                    background: "transparent",
                    border: "none",
                    boxShadow: "none",
                    cursor: "pointer",
                  }}
                >
                  <img
                    src={it.thumbUrl ?? it.url}
                    alt={it.name}
                    loading="lazy"
                    style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                  />
                </button>

                <label
                  className="mediaCheck"
                  title="选择"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    padding: 6,
                    borderRadius: 10,
                    background: "rgba(0,0,0,0.35)",
                    display: "inline-flex",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(it.name)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(it.name)) next.delete(it.name);
                        else next.add(it.name);
                        return next;
                      })
                    }
                  />
                </label>
              </div>

              <div style={{ padding: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 3 }}>
                  <div style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.name}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {prettyBytes(it.size)}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="pill"
                    title="复制图片 URL"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(it.url);
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <MdContentCopy />
                  </button>

                  <label className="pill" style={{ cursor: "pointer" }} title="替换此图片（保持 URL 不变）">
                    <MdFileUpload />
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.currentTarget.value = "";
                        if (!f) return;
                        setErr(null);
                        setBusy(true);
                        try {
                          await api.adminUploadImage(f, { replace: it.name });
                          await refresh();
                        } catch (err: any) {
                          setErr(err?.message ?? String(err));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </label>

                  <button
                    className="pill"
                    title="删除此图片"
                    onClick={async () => {
                      if (!confirm(`删除图片 ${it.name}？（引用此 URL 的地方会失效）`)) return;
                      setErr(null);
                      setBusy(true);
                      try {
                        await api.adminDeleteUpload(it.name);
                        await refresh();
                      } catch (err: any) {
                        setErr(err?.message ?? String(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                    style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted2)" }}
                  >
                    <MdDelete />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!filtered.length && !busy ? (
          <div className="card" style={{ padding: 24, textAlign: "center", marginTop: 14 }}>
            暂无图片
          </div>
        ) : null}
    </div>
  );
}

export function MediaLibraryModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
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
      <div onClick={(e) => e.stopPropagation()}>
        <MediaLibraryPanel
          onSelect={onSelect}
          onRequestClose={onClose}
          showClose
          autoCloseOnSelect
          containerStyle={{ width: "min(1100px, 96vw)", maxHeight: "90vh" }}
        />
      </div>
    </div>,
    document.body,
  );
}
