import { useMemo, useState } from "react";
import { MdCollections, MdFileUpload, MdRefresh } from "react-icons/md";

import { api } from "../api";
import { MediaLibraryModal } from "./MediaLibraryModal";

const uploadsNameFromUrl = (value: string) => {
  const v = value.trim();
  if (!v.startsWith("/uploads/")) return null;
  const raw = v.slice("/uploads/".length);
  const name = raw.split("?")[0] ?? "";
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

export function ImageField({
  label,
  value,
  onChange,
  placeholder,
  help,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  help?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewBust, setPreviewBust] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);

  const replaceName = useMemo(() => uploadsNameFromUrl(value), [value]);
  const previewUrl = useMemo(() => {
    const v = value.trim();
    if (!v) return "";
    if (!v.startsWith("/uploads/")) return v;
    const sep = v.includes("?") ? "&" : "?";
    return `${v}${sep}v=${encodeURIComponent(String(previewBust || 0))}`;
  }, [value, previewBust]);

  return (
    <div
      style={{ display: "grid", gap: 10 }}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={async (e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) return;
        setErr(null);
        setBusy(true);
        try {
          const res = await api.adminUploadImage(f);
          onChange(res.url);
          setPreviewBust(Date.now());
        } catch (err: any) {
          setErr(err?.message ?? String(err));
        } finally {
          setBusy(false);
        }
      }}
      title="可拖拽图片到这里上传"
    >
      <div className="muted">{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "https://... 或 /uploads/..."} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label className="pill" style={{ cursor: "pointer" }} title="上传新图片并自动填入 URL">
          <MdFileUpload />
          上传
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
              setProgress(0);
              try {
                const res = await api.adminUploadImage(f, {
                  onProgress: ({ percent }) => setProgress(percent),
                });
                onChange(res.url);
                setPreviewBust(Date.now());
              } catch (err: any) {
                setErr(err?.message ?? String(err));
              } finally {
                setBusy(false);
                setProgress(null);
              }
            }}
          />
        </label>

        <button className="pill" title="从图库选择" onClick={() => setPickerOpen(true)} disabled={busy}>
          <MdCollections />
          图库
        </button>

        <label
          className="pill"
          style={{ cursor: replaceName ? "pointer" : "not-allowed", opacity: replaceName ? 1 : 0.5 }}
          title={replaceName ? "替换当前 /uploads 图片（保持 URL 不变）" : "当前不是 /uploads 图片，无法替换"}
        >
          <MdRefresh />
          替换
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            disabled={!replaceName || busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.currentTarget.value = "";
              if (!f || !replaceName) return;
              setErr(null);
              setBusy(true);
              setProgress(0);
              try {
                const res = await api.adminUploadImage(f, {
                  replace: replaceName,
                  onProgress: ({ percent }) => setProgress(percent),
                });
                onChange(res.url);
                setPreviewBust(Date.now());
              } catch (err: any) {
                setErr(err?.message ?? String(err));
              } finally {
                setBusy(false);
                setProgress(null);
              }
            }}
          />
        </label>

        {busy ? <span className="muted">{progress === null ? "处理中…" : `上传中… ${progress}%`}</span> : null}
      </div>

      {help ? <div className="muted">{help}</div> : null}
      {err ? <div style={{ color: "red" }}>{err}</div> : null}

      {value ? (
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
          <img src={previewUrl} alt={label} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
        </div>
      ) : null}

      <MediaLibraryModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => onChange(url)}
      />
    </div>
  );
}
