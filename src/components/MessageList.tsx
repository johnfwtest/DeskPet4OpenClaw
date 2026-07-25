/**
 * MessageList — renders chat messages with Markdown, reply target, and user-msg delete.
 */

import React, { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { useI18n } from "@/i18n";
import { ttsPlayer } from "@/services/ttsPlayer";

interface MessageItem {
  id: string;
  role: "user" | "agent";
  text: string;
  images?: string[];
}

interface MessageListProps {
  messages: MessageItem[];
  replyTarget: { id: string; text: string; role: string } | null;
  onReply: (msg: { id: string; text: string; role: string }) => void;
}

const markdownComponents: Components = {
  img: (props) => {
    let src = props.src || "";
    if (src.startsWith("/__openclaw__/") || src.startsWith("/__claw__/")) {
      try {
        const raw = localStorage.getItem("desk-pet-settings");
        if (raw) {
          const s = JSON.parse(raw);
          const wsUrl = s.wsUrl || "ws://127.0.0.1:18789";
          const base = wsUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/$/, "");
          src = base + src;
          if (s.token) {
            const sep = src.includes("?") ? "&" : "?";
            src += sep + "token=" + encodeURIComponent(s.token);
          }
        }
      } catch {}
    }
    return (
      <img {...props} src={src} style={{ maxWidth: "100%", borderRadius: 8, margin: "4px 0" }} alt={props.alt || "image"} />
    );
  },
  code: (props) => {
    const { children } = props as { children?: React.ReactNode };
    const inline = (props as { inline?: boolean }).inline;
    if (inline) {
      return <code style={{ background: "rgba(255,255,255,0.15)", borderRadius: 3, padding: "1px 4px", fontSize: 12 }}>{children}</code>;
    }
    return <code style={{ display: "block", background: "rgba(0,0,0,0.4)", borderRadius: 6, padding: "6px 10px", fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap", margin: "4px 0" }}>{children}</code>;
  },
  a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" style={{ color: "#8bd3ff" }} />,
  blockquote: (props) => (
    <blockquote style={{ borderLeft: "3px solid rgba(100,140,255,0.5)", margin: "4px 0", paddingLeft: 10, color: "#bcc" }}>
      {props.children}
    </blockquote>
  ),
  hr: () => <hr style={{ borderColor: "rgba(255,255,255,0.15)", margin: "8px 0" }} />,
  ul: (props) => <ul style={{ margin: "4px 0", paddingLeft: 18 }} {...props} />,
  ol: (props) => <ol style={{ margin: "4px 0", paddingLeft: 18 }} {...props} />,
};

const MessageList: React.FC<MessageListProps> = ({ messages, replyTarget, onReply }) => {
  const { t } = useI18n();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Also re-scroll after a short delay to handle Markdown rendering
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, 300);
    return () => clearTimeout(timer);
  }, [messages]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
      {messages.length === 0 && (
        <p style={{ color: "#888", fontSize: "12px", textAlign: "center", marginTop: "20px" }}>
          {t("chat.empty")}
        </p>
      )}
      {messages.map((m) => (
        <div
          key={m.id}
          className={`chat-msg chat-msg--${m.role}`}
          style={{
            marginBottom: "10px", padding: "8px 12px", borderRadius: "12px",
            background: m.role === "user" ? "rgba(100, 140, 255, 0.3)" : "rgba(255, 255, 255, 0.1)",
            color: "#ddd", fontSize: "13px", lineHeight: "1.5", maxWidth: "95%",
            position: "relative",
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            marginLeft: m.role === "user" ? "auto" : "0",
            marginRight: m.role === "user" ? "0" : "auto",
            ...(replyTarget?.id === m.id ? { border: "1px solid rgba(100,140,255,0.6)" } : {}),
          }}
        >
          <ReactMarkdown components={markdownComponents}>{m.text}</ReactMarkdown>
          {m.images && m.images.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {m.images.map((img, i) => (
                <img key={i} src={img} alt={`img-${i}`} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", objectFit: "contain" }} />
              ))}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); ttsPlayer.speak(m.text); }}
            title={t("chat.readAloud")}
            style={{ position: "absolute", bottom: 2, right: 24, background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 12, opacity: 0.5, lineHeight: 1 }}
          >🔊</button>
          <button
            onClick={(e) => { e.stopPropagation(); onReply({ id: m.id, text: m.text, role: m.role }); }}
            title={t("chat.quoteReply")}
            style={{ position: "absolute", bottom: 2, right: 4, background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 14, opacity: 0.5, lineHeight: 1 }}
          >↩</button>
          {m.role === "user" && (
            <button
              onClick={(e) => { e.stopPropagation(); }}
              title={t("input.recall")}
              style={{ position: "absolute", top: 2, right: 4, background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 10, opacity: 0.5 }}
            >✕</button>
          )}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;
