import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { api, ChatMessage } from "../api";
import { Markdown } from "../components/Markdown";

const STORAGE_KEY = "yablog_ai_chat_messages_v1";

const defaultSystem: ChatMessage = {
  role: "system",
  content: "你是 YaBlog 的 AI 助手。请用清晰、简洁的方式回答问题。",
};

export function AiPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      // ignore
    }
    return [defaultSystem];
  });

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  const visible = useMemo(() => messages.filter((m) => m.role !== "system"), [messages]);

  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    setErr(null);
    setBusy(true);

    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");

    try {
      const res = await api.chat({ messages: next });
      setMessages((prev) => [...prev, { role: "assistant", content: res.assistant }]);
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
    <div className="container" style={{ paddingTop: 90, paddingBottom: 50 }}>
      <div
        className="page-banner"
        style={{
          height: 260,
          backgroundImage:
            "linear-gradient(135deg, rgba(73,177,245,0.85), rgba(255,114,66,0.75)), radial-gradient(circle at 20% 20%, rgba(255,255,255,0.25), transparent 55%)",
        }}
      >
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="hero-title">AI 对话</div>
          <div className="hero-subtitle">Minimal · Elegant · Powerful</div>
        </div>
      </div>

      <div style={{ height: 18 }} />

      <div className="card chatCard">
        <div className="chatHeader">
          <div style={{ fontWeight: 800 }}>与 AI 聊天</div>
          <div style={{ flex: 1 }} />
          <button
            className="btn-ghost"
            type="button"
            onClick={() => {
              if (!window.confirm("清空当前对话？")) return;
              setMessages([defaultSystem]);
            }}
            title="清空对话"
          >
            清空
          </button>
        </div>

        <div className="chatMessages">
          {visible.map((m, idx) => (
            <div key={idx} className={`chatRow ${m.role === "user" ? "chatRowUser" : "chatRowAssistant"}`}>
              <div className={`chatBubble ${m.role === "user" ? "chatBubbleUser" : "chatBubbleAssistant"}`}>
                <div className="markdown" style={{ padding: 0, background: "transparent", border: 0 }}>
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

        <form className="chatComposer" onSubmit={onSubmit}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入你的问题…（Shift+Enter 换行，Enter 发送）"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button className="btn-primary" disabled={busy || !input.trim()}>
            {busy ? "发送中…" : "发送"}
          </button>
        </form>

        {err ? <div className="muted" style={{ color: "red", padding: "0 16px 16px" }}>{err}</div> : null}
      </div>
    </div>
  );
}
