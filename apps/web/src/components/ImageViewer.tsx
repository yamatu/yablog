import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MdChevronLeft, MdChevronRight, MdClose } from "react-icons/md";

export type ViewerItem = { url: string; name?: string };

export function ImageViewer({
  open,
  onOpenChange,
  items,
  index,
  onIndexChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ViewerItem[];
  index: number;
  onIndexChange: (next: number) => void;
}) {
  const safeItems = items.filter((it) => it && typeof it.url === "string" && it.url.trim());
  const i = Math.max(0, Math.min(index, Math.max(0, safeItems.length - 1)));
  const current = safeItems[i];
  const canPrev = i > 0;
  const canNext = i < safeItems.length - 1;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && canPrev) {
        e.preventDefault();
        onIndexChange(i - 1);
      } else if (e.key === "ArrowRight" && canNext) {
        e.preventDefault();
        onIndexChange(i + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canPrev, canNext, i, onIndexChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {open ? (
        <Dialog.Portal>
          <Dialog.Overlay
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.72)",
              zIndex: 10000,
            }}
          />
          <Dialog.Content
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10001,
              display: "grid",
              gridTemplateRows: "auto 1fr",
              padding: 14,
              gap: 12,
            }}
          >
            <div
              className="glass"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 14,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {current?.name || "图片"}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {safeItems.length ? `${i + 1} / ${safeItems.length}` : ""}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  className="btn-ghost"
                  type="button"
                  disabled={!canPrev}
                  onClick={() => onIndexChange(i - 1)}
                  title="上一张"
                >
                  <MdChevronLeft />
                </button>
                <button
                  className="btn-ghost"
                  type="button"
                  disabled={!canNext}
                  onClick={() => onIndexChange(i + 1)}
                  title="下一张"
                >
                  <MdChevronRight />
                </button>
                <Dialog.Close asChild>
                  <button className="btn-ghost" type="button" title="关闭">
                    <MdClose />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            <div
              style={{
                borderRadius: 16,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                display: "grid",
                placeItems: "center",
              }}
            >
              {current?.url ? (
                <img
                  src={current.url}
                  alt={current.name || "image"}
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                />
              ) : (
                <div className="muted">暂无图片</div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}
