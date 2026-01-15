import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Switch from "@radix-ui/react-switch";
import * as Tabs from "@radix-ui/react-tabs";
import { MdAdd, MdCheck, MdClearAll, MdDelete, MdEdit, MdExpandMore, MdSave } from "react-icons/md";

import { api, ChatMessage } from "../api";
import { Markdown } from "../components/Markdown";

const STORAGE_INDEX_KEY = "yablog_ai_memories_v1";
const STORAGE_PREFIX = "yablog_ai_memory_v1:";

const defaultSystem: ChatMessage = {
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

const loadMessages = (id: string): ChatMessage[] => {
  try {
    const raw = localStorage.getItem(msgKey(id));
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // ignore
  }
  return [defaultSystem];
};

const saveMessages = (id: string, messages: ChatMessage[]) => localStorage.setItem(msgKey(id), JSON.stringify(messages));

export function AiPage() {
  const [index, setIndex] = useState<MemoryIndex>(() => loadIndex());
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(loadIndex().activeId));
  const [dirty, setDirty] = useState(false);

  const [input, setInput] = useState("");
  const [composerTab, setComposerTab] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
    setMessages(loadMessages(index.activeId));
    setDirty(false);
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
    setDirty(false);
    setErr(null);
  };

  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    setErr(null);
    setBusy(true);

    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    if (!index.autoSave) setDirty(true);
    setInput("");

    try {
      const res = await api.chat({ messages: next });
      setMessages((prev) => [...prev, { role: "assistant", content: res.assistant }]);
      if (!index.autoSave) setDirty(true);
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      setErr(raw.includes("ai_disabled") ? "AI 功能未启用或未配置（请到后台设置开启）。" : raw);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };

  return (
    <div className="aiPage">
      <div className="aiHero">
        <div className="aiHeroInner container">
          <div className="aiHeroTitle">AI 对话</div>
          <div className="aiHeroSub">支持 Markdown · LaTeX · 代码块</div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 20, paddingBottom: 50 }}>
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
                    <Markdown value={m.content} />
                  </div>
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
              <div className="muted" style={{ minWidth: 120 }}>
                {dirty && !index.autoSave ? "未保存" : "\u00A0"}
              </div>
              <div style={{ flex: 1 }} />
              <button className="btn-primary" disabled={busy || !input.trim()}>
                {busy ? "发送中…" : "发送"}
              </button>
            </div>
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
