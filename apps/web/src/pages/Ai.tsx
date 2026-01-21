import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Switch from "@radix-ui/react-switch";
import * as Tabs from "@radix-ui/react-tabs";
import {
  MdAdd,
  MdCheck,
  MdClearAll,
  MdClose,
  MdContentCopy,
  MdDelete,
  MdDone,
  MdEdit,
  MdExpandMore,
  MdImage,
  MdSave,
} from "react-icons/md";

import type { ChatMessage as WireChatMessage } from "../api";
import { api } from "../api";
import { aiImages } from "../aiImages";
import { Markdown } from "../components/Markdown";

const STORAGE_INDEX_KEY = "yablog_ai_memories_v1";
const STORAGE_PREFIX = "yablog_ai_memory_v1:";
const STORAGE_RENDER_MD_KEY = "yablog_ai_render_md_v1";

type UiImageMeta = { id: string; name: string; type: string; size: number; createdAt: number };
type UiChatMessage = { role: "system" | "user" | "assistant"; content: string; images?: UiImageMeta[] };

const defaultSystem: UiChatMessage = {
  role: "system",
  content: "你是 YaBlog 的 AI 助手。请用清晰、简洁的方式回答问题。",
};

type MemoryMeta = { id: string; name: string; updatedAt: number };
type MemoryIndex = { activeId: string; items: MemoryMeta[]; autoSave: boolean };

const now = () => Date.now();
const msgKey = (id: string) => `${STORAGE_PREFIX}${id}`;

const loadIndex = (): MemoryIndex => {
  try {
    const raw = localStorage.getItem(STORAGE_INDEX_KEY);
    const parsed = raw ? (JSON.parse(raw) as any) : null;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.items) && typeof parsed.activeId === "string") {
      const items: MemoryMeta[] = parsed.items
        .filter((it: any) => it && typeof it === "object")
        .map((it: any) => ({
          id: String(it.id),
          name: String(it.name || "未命名"),
          updatedAt: Number(it.updatedAt) || now(),
        }))
        .filter((it: any) => it.id);

      const activeId = String(parsed.activeId);
      const autoSave = parsed.autoSave !== false; // default true
      if (items.length) return { activeId: items.some((m) => m.id === activeId) ? activeId : items[0].id, items, autoSave };
    }
  } catch {
    // ignore
  }
  return { activeId: "default", items: [{ id: "default", name: "默认记忆", updatedAt: now() }], autoSave: true };
};

const saveIndex = (idx: MemoryIndex) => localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(idx));

const loadMessages = (id: string): UiChatMessage[] => {
  try {
    const raw = localStorage.getItem(msgKey(id));
    const parsed = raw ? (JSON.parse(raw) as UiChatMessage[]) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // ignore
  }
  return [defaultSystem];
};

const saveMessages = (id: string, messages: UiChatMessage[]) => localStorage.setItem(msgKey(id), JSON.stringify(messages));

const fileToDataUrl = async (file: Blob, outType = "image/jpeg", maxSide = 1600, quality = 0.86) => {
  // Downscale client-side to reduce upload size; keep aspect ratio.
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // Fallback: direct base64 (can be big).
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(r.error ?? new Error("read failed"));
      r.readAsDataURL(file);
    });
  }

  const w = bitmap.width;
  const h = bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_not_supported");
  ctx.drawImage(bitmap, 0, 0, tw, th);
  bitmap.close();

  // toDataURL is widely supported; for huge images we already resized.
  return canvas.toDataURL(outType, quality);
};

function AiImageThumb({ meta }: { meta: UiImageMeta }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    let alive = true;
    let objUrl: string | null = null;
    (async () => {
      const blob = await aiImages.getBlob(meta.id);
      if (!alive || !blob) return;
      objUrl = URL.createObjectURL(blob);
      setUrl(objUrl);
    })().catch(() => {});
    return () => {
      alive = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [meta.id]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={meta.name}
      style={{ width: 86, height: 86, objectFit: "cover", borderRadius: 12, border: "1px solid var(--border)" }}
    />
  );
}

export function AiPage() {
  const [index, setIndex] = useState<MemoryIndex>(() => loadIndex());
  const [messages, setMessages] = useState<UiChatMessage[]>(() => loadMessages(loadIndex().activeId));
  const [dirty, setDirty] = useState(false);
  const [renderMd, setRenderMd] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(STORAGE_RENDER_MD_KEY);
      if (v === "0") return false;
    } catch {
      // ignore
    }
    return true;
  });

  const [input, setInput] = useState("");
  const [composerTab, setComposerTab] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<UiImageMeta[]>([]);
  const [viewer, setViewer] = useState<{ open: boolean; url: string; name: string }>(() => ({
    open: false,
    url: "",
    name: "",
  }));
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const active = useMemo(() => index.items.find((m) => m.id === index.activeId) ?? index.items[0], [index]);
  const visible = useMemo(() => messages.filter((m) => m.role !== "system"), [messages]);

  useEffect(() => {
    try {
      saveIndex(index);
    } catch {
      // ignore
    }
  }, [index]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_RENDER_MD_KEY, renderMd ? "1" : "0");
    } catch {
      // ignore
    }
  }, [renderMd]);

  useEffect(() => {
    setMessages(loadMessages(index.activeId));
    setDirty(false);
    setPendingImages([]);
  }, [index.activeId]);

  useEffect(() => {
    if (!index.autoSave) return;
    try {
      saveMessages(index.activeId, messages);
      setDirty(false);
      setIndex((prev) => ({
        ...prev,
        items: prev.items.map((it) => (it.id === prev.activeId ? { ...it, updatedAt: now() } : it)),
      }));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, index.autoSave, index.activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  const persistCurrent = () => {
    try {
      saveMessages(index.activeId, messages);
      setDirty(false);
      setIndex((prev) => ({
        ...prev,
        items: prev.items.map((it) => (it.id === prev.activeId ? { ...it, updatedAt: now() } : it)),
      }));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const clearCurrent = () => {
    if (!window.confirm(`清空当前记忆「${active?.name ?? ""}」的对话？`)) return;
    const next = [defaultSystem];
    setMessages(next);
    setDirty(!index.autoSave);
    setPendingImages([]);
    void aiImages.deleteByMemory(index.activeId).catch(() => {});
    if (index.autoSave) {
      try {
        saveMessages(index.activeId, next);
      } catch {
        // ignore
      }
    }
  };

  const clearAll = () => {
    if (!window.confirm("全局清空会删除本设备所有 AI 记忆与对话记录。确定继续吗？")) return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k === STORAGE_INDEX_KEY || k.startsWith(STORAGE_PREFIX)) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    } catch {
      // ignore
    }
    const fresh = loadIndex();
    setIndex(fresh);
    setMessages(loadMessages(fresh.activeId));
    setPendingImages([]);
    void aiImages.clearAll().catch(() => {});
    setDirty(false);
    setErr(null);
  };

  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    setErr(null);
    setBusy(true);

    const attach = pendingImages.slice(0, 4);
    const next: UiChatMessage[] = [...messages, { role: "user", content, images: attach.length ? attach : undefined }];
    setMessages(next);
    if (!index.autoSave) setDirty(true);
    setInput("");
    setPendingImages([]);

    try {
      const last = next[next.length - 1];
      const wireMessages: WireChatMessage[] = [];
      for (let i = 0; i < next.length; i++) {
        const m = next[i];
        if (i === next.length - 1 && m.role === "user" && m.images?.length) {
          const imgs: { dataUrl: string; name?: string }[] = [];
          for (const im of m.images) {
            const blob = await aiImages.getBlob(im.id);
            if (!blob) continue;
            const dataUrl = await fileToDataUrl(blob);
            imgs.push({ dataUrl, name: im.name });
          }
          wireMessages.push({ role: "user", content: m.content, images: imgs.length ? imgs : undefined });
        } else {
          wireMessages.push({ role: m.role, content: m.content });
        }
      }

      if (last?.role === "user" && last.images?.length && !wireMessages[wireMessages.length - 1]?.images?.length) {
        throw new Error("图片读取失败（请重试或重新选择图片）");
      }

      const res = await api.chat({ messages: wireMessages });
      setMessages((prev) => [...prev, { role: "assistant", content: res.assistant }]);
      if (!index.autoSave) setDirty(true);
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      if (raw.includes("ai_disabled")) setErr("AI 功能未启用或未配置（请到后台设置开启）。");
      else if (raw.includes("image_requires_http")) setErr("图片识别需要配置 HTTP 模式的 AI 接口（后台填写 apiBase + apiKey，并使用支持图片的模型）。");
      else if (raw.includes("payload_too_large")) setErr("图片过大：请换更小的图片，或减少一次发送的图片数量。");
      else setErr(raw);
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((v) => (v === key ? null : v)), 1200);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const openImageViewer = async (meta: UiImageMeta) => {
    try {
      setErr(null);
      const blob = await aiImages.getBlob(meta.id);
      if (!blob) throw new Error("图片不存在或已被清理");
      const url = URL.createObjectURL(blob);
      // Revoke previous URL to avoid leaking object URLs.
      setViewer((prev) => {
        if (prev.url) URL.revokeObjectURL(prev.url);
        return { open: true, url, name: meta.name || "image" };
      });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };

  return (
    <div className="aiPage">
      <Dialog.Root
        open={viewer.open}
        onOpenChange={(open) => {
          if (!open) {
            setViewer((prev) => {
              if (prev.url) URL.revokeObjectURL(prev.url);
              return { open: false, url: "", name: "" };
            });
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="aiDialogOverlay" />
          <Dialog.Content
            className="aiDialogContent"
            style={{
              maxWidth: "min(1100px, 95vw)",
              width: "min(1100px, 95vw)",
              maxHeight: "92vh",
              overflow: "hidden",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {viewer.name}
              </div>
              <Dialog.Close asChild>
                <button className="btn-ghost" type="button" title="关闭">
                  <MdClose />
                </button>
              </Dialog.Close>
            </div>
            <div style={{ height: 10 }} />
            {viewer.url ? (
              <div
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                  background: "rgba(0,0,0,0.15)",
                }}
              >
                <img
                  src={viewer.url}
                  alt={viewer.name}
                  style={{ width: "100%", height: "calc(92vh - 90px)", objectFit: "contain", display: "block" }}
                />
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="aiHero">
        <div className="aiHeroInner container">
          <div className="aiHeroTitle">GPT_5.2</div>
          <div className="aiHeroSub">支持 Markdown · LaTeX · 代码块</div>
        </div>
      </div>

      <div className="aiMain container">
        <div className="card chatCard aiCard">
          <div className="aiHeader">
            <div className="aiHeaderLeft">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger className="aiMemTrigger" type="button" title="切换记忆">
                  <span className="aiMemName">{active?.name ?? "记忆"}</span>
                  <MdExpandMore />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="aiMenu" sideOffset={8} align="start">
                    <div className="aiMenuTitle">选择记忆</div>
                    {index.items
                      .slice()
                      .sort((a, b) => b.updatedAt - a.updatedAt)
                      .map((m) => (
                        <DropdownMenu.Item
                          key={m.id}
                          className="aiMenuItem"
                          onSelect={() => {
                            if (m.id === index.activeId) return;
                            if (!index.autoSave && dirty) {
                              const ok = window.confirm("当前记忆未保存，切换会丢失未保存内容。确定切换吗？");
                              if (!ok) return;
                            }
                            setIndex((prev) => ({ ...prev, activeId: m.id }));
                          }}
                        >
                          <span className="aiMenuItemText">{m.name}</span>
                          {m.id === index.activeId ? <MdCheck /> : null}
                        </DropdownMenu.Item>
                      ))}
                    <DropdownMenu.Separator className="aiMenuSep" />

                    <CreateOrRenameMemory
                      mode="create"
                      trigger={
                        <DropdownMenu.Item className="aiMenuItem" onSelect={(e) => e.preventDefault()}>
                          <MdAdd /> 新建记忆
                        </DropdownMenu.Item>
                      }
                      onSubmit={(name) => {
                        const id = Math.random().toString(36).slice(2) + String(Date.now());
                        const meta: MemoryMeta = { id, name: name.trim() || "未命名", updatedAt: now() };
                        setIndex((prev) => ({ ...prev, activeId: id, items: [meta, ...prev.items] }));
                        const init = [defaultSystem];
                        setMessages(init);
                        setDirty(!index.autoSave);
                        try {
                          saveMessages(id, init);
                        } catch {
                          // ignore
                        }
                      }}
                    />

                    <CreateOrRenameMemory
                      mode="rename"
                      trigger={
                        <DropdownMenu.Item className="aiMenuItem" onSelect={(e) => e.preventDefault()}>
                          <MdEdit /> 重命名
                        </DropdownMenu.Item>
                      }
                      initialName={active?.name ?? ""}
                      onSubmit={(name) => {
                        setIndex((prev) => ({
                          ...prev,
                          items: prev.items.map((it) =>
                            it.id === prev.activeId ? { ...it, name: name.trim() || it.name, updatedAt: now() } : it,
                          ),
                        }));
                      }}
                    />

                    <DropdownMenu.Item
                      className="aiMenuItem aiMenuDanger"
                      onSelect={() => {
                        if (index.items.length <= 1) return;
                        if (!window.confirm(`删除记忆「${active?.name ?? ""}」？此操作不可恢复。`)) return;
                        try {
                          localStorage.removeItem(msgKey(index.activeId));
                        } catch {
                          // ignore
                        }
                        void aiImages.deleteByMemory(index.activeId).catch(() => {});
                        setIndex((prev) => {
                          const nextItems = prev.items.filter((it) => it.id !== prev.activeId);
                          const nextActive = nextItems[0]?.id || "default";
                          return {
                            ...prev,
                            items: nextItems.length ? nextItems : [{ id: "default", name: "默认记忆", updatedAt: now() }],
                            activeId: nextActive,
                          };
                        });
                      }}
                    >
                      <MdDelete /> 删除当前
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              <label className="aiAutoSave">
                <span className="muted">自动保存</span>
                <Switch.Root
                  className="aiSwitch"
                  checked={index.autoSave}
                  onCheckedChange={(v) => {
                    setIndex((prev) => ({ ...prev, autoSave: v }));
                    if (v) persistCurrent();
                  }}
                >
                  <Switch.Thumb className="aiSwitchThumb" />
                </Switch.Root>
              </label>

              <label className="aiAutoSave" title="关闭后将以纯文本展示（不渲染 Markdown/LaTeX）">
                <span className="muted">Markdown</span>
                <Switch.Root className="aiSwitch" checked={renderMd} onCheckedChange={(v) => setRenderMd(Boolean(v))}>
                  <Switch.Thumb className="aiSwitchThumb" />
                </Switch.Root>
              </label>
            </div>

            <div className="aiHeaderRight">
              {!index.autoSave ? (
                <button className="btn-ghost" type="button" onClick={persistCurrent} disabled={!dirty} title="保存当前记忆到本机">
                  <MdSave /> 保存
                </button>
              ) : null}
              <button className="btn-ghost" type="button" onClick={clearCurrent} title="清空当前记忆">
                <MdDelete /> 清空当前
              </button>
              <button className="btn-danger" type="button" onClick={clearAll} title="全局清空（删除所有记忆）">
                <MdClearAll /> 全局清空
              </button>
            </div>
          </div>

          <div className="chatMessages aiMessages">
            {visible.map((m, idx) => (
              <div key={idx} className={`chatRow ${m.role === "user" ? "chatRowUser" : "chatRowAssistant"}`}>
                <div className={`chatBubble ${m.role === "user" ? "chatBubbleUser" : "chatBubbleAssistant"}`}>
                  <div className="markdown aiMarkdown" style={{ padding: 0, background: "transparent", border: 0 }}>
                    {renderMd ? (
                      <Markdown value={m.content} />
                    ) : (
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                          fontSize: 14,
                          lineHeight: 1.6,
                        }}
                      >
                        {m.content}
                      </pre>
                    )}
                  </div>
                  {m.images?.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                      {m.images.map((im) => (
                        <button
                          key={im.id}
                          type="button"
                          title="点击放大"
                          onClick={() => void openImageViewer(im)}
                          style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                        >
                          <AiImageThumb meta={im} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {m.role === "assistant" ? (
                    <div className="aiBubbleActions">
                      <button
                        className="btn-ghost aiCopyBtn"
                        type="button"
                        onClick={() => copyText(`msg:${idx}`, m.content)}
                        title="复制原始内容（Markdown/LaTeX/代码）"
                      >
                        {copiedKey === `msg:${idx}` ? <MdDone /> : <MdContentCopy />}
                        {copiedKey === `msg:${idx}` ? "已复制" : "复制"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="chatRow chatRowAssistant">
                <div className="chatBubble chatBubbleAssistant">
                  <div className="muted">AI 正在思考…</div>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <form className="aiComposer" onSubmit={onSubmit}>
            <Tabs.Root className="aiTabs" value={composerTab} onValueChange={(v) => setComposerTab(v as any)}>
              <Tabs.List className="aiTabsList" aria-label="composer">
                <Tabs.Trigger className="aiTabsTrigger" value="edit">
                  编辑
                </Tabs.Trigger>
                <Tabs.Trigger className="aiTabsTrigger" value="preview">
                  预览
                </Tabs.Trigger>
                <div style={{ flex: 1 }} />
                <div className="muted" style={{ fontSize: 12 }}>
                  Enter 发送 / Shift+Enter 换行
                </div>
              </Tabs.List>
              <Tabs.Content className="aiTabsContent" value="edit">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="输入 Markdown…支持 LaTeX：$a^2+b^2=c^2$，代码块：```js"
                  rows={4}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
              </Tabs.Content>
              <Tabs.Content className="aiTabsContent" value="preview">
                <div className="aiPreview">
                  {input.trim() ? (
                    <div className="markdown aiMarkdown" style={{ padding: 0, background: "transparent", border: 0 }}>
                      <Markdown value={input} />
                    </div>
                  ) : (
                    <div className="muted">预览会显示你输入的 Markdown/LaTeX/代码块。</div>
                  )}
                </div>
              </Tabs.Content>
            </Tabs.Root>

            <div className="aiComposerActions">
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label
                  className="btn-ghost"
                  style={{ display: "inline-flex", gap: 8, alignItems: "center", cursor: busy ? "not-allowed" : "pointer" }}
                  title="上传图片（仅保存在本机浏览器，用于本次对话）"
                >
                  <MdImage />
                  图片
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    disabled={busy}
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.currentTarget.value = "";
                      if (!files.length) return;
                      setErr(null);
                      try {
                        const metas: UiImageMeta[] = [];
                        for (const f of files.slice(0, 4 - pendingImages.length)) {
                          const meta = await aiImages.put({ memoryId: index.activeId, file: f });
                          metas.push(meta);
                        }
                        setPendingImages((prev) => [...prev, ...metas]);
                      } catch (e: any) {
                        setErr(e?.message ?? String(e));
                      }
                    }}
                  />
                </label>
              </div>
              <div className="muted" style={{ minWidth: 120 }}>
                {dirty && !index.autoSave ? "未保存" : "\u00A0"}
              </div>
              <div style={{ flex: 1 }} />
              <button className="btn-primary" disabled={busy || !input.trim()}>
                {busy ? "发送中…" : "发送"}
              </button>
            </div>
            {pendingImages.length ? (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 10 }}>
                {pendingImages.map((im) => (
                  <div key={im.id} className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      title="点击放大"
                      onClick={() => void openImageViewer(im)}
                      style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                    >
                      <AiImageThumb meta={im} />
                    </button>
                    <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {im.name}
                    </span>
                    <button
                      className="btn-ghost"
                      type="button"
                      title="移除"
                      onClick={() => {
                        setPendingImages((prev) => prev.filter((x) => x.id !== im.id));
                        void aiImages.delete(im.id).catch(() => {});
                      }}
                      style={{ padding: "6px 10px" }}
                    >
                      <MdDelete />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </form>

          {err ? (
            <div className="muted" style={{ color: "red", padding: "0 16px 16px" }}>
              {err}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CreateOrRenameMemory(props: {
  mode: "create" | "rename";
  trigger: ReactNode;
  initialName?: string;
  onSubmit: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(props.initialName ?? "");

  useEffect(() => {
    if (!open) return;
    setName(props.initialName ?? "");
  }, [open, props.initialName]);

  const title = props.mode === "create" ? "新建记忆" : "重命名记忆";
  const submitLabel = props.mode === "create" ? "创建" : "保存";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{props.trigger as any}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="aiDialogOverlay" />
        <Dialog.Content className="aiDialogContent">
          <Dialog.Title className="aiDialogTitle">{title}</Dialog.Title>
          <div style={{ height: 12 }} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名称（例如：工作/学习/灵感）" />
          <div style={{ height: 14 }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Dialog.Close asChild>
              <button className="btn-ghost" type="button">
                取消
              </button>
            </Dialog.Close>
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                props.onSubmit(name);
                setOpen(false);
              }}
            >
              {submitLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
