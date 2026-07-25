/**
 * ChatPanel — collapsible chat sidebar combining ChatHeader, SessionList,
 * MessageList, and ChatInput subcomponents.
 */

import React, { useState } from "react";
import { useI18n } from "@/i18n";
import ChatHeader from "@/components/ChatHeader";
import SessionList from "@/components/SessionList";
import MessageList from "@/components/MessageList";
import ChatInput from "@/components/ChatInput";

interface ChatPanelProps {
  visible: boolean;
  onToggle: () => void;
  onSend: (text: string, attachments?: { type: string; mimeType: string; fileName: string; content: string }[]) => void;
  onCancel?: () => void;
  isStreaming?: boolean;
  messages: { id: string; role: "user" | "agent"; text: string; images?: string[] }[];
  onNewSession?: () => void;
  onModelChange?: (modelId: string) => void;
  currentModel?: string;
}

const ChatPanel: React.FC<ChatPanelProps> = (props) => {
  const { visible, onToggle, onSend, onCancel, isStreaming, messages, onNewSession, onModelChange, currentModel } = props;
  const { t } = useI18n();
  const [showSessions, setShowSessions] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{ id: string; text: string; role: string } | null>(null);

  if (!visible) {
    return (
      <button
        className="chat-toggle-btn"
        onClick={onToggle}
        style={{
          position: "fixed", bottom: "16px", right: "16px",
          width: "40px", height: "40px", borderRadius: "50%",
          border: "none", background: "rgba(255,255,255,0.9)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.2)", cursor: "pointer",
          fontSize: "18px", zIndex: 999,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        title={t("chat.title")}
      >💬</button>
    );
  }

  return (
    <div
      className="chat-panel"
      style={{
        position: "fixed", right: 0, top: 0, bottom: 0,
        width: "320px", background: "rgba(30, 30, 40, 0.95)",
        backdropFilter: "blur(12px)", display: "flex", flexDirection: "column",
        zIndex: 998, boxShadow: "-2px 0 20px rgba(0,0,0,0.3)",
        borderLeft: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <ChatHeader
        onNewSession={onNewSession}
        onToggleSessions={() => { setShowSessions(!showSessions); }}
        onToggle={onToggle}
      />

      <SessionList visible={showSessions} chatVisible={visible} />

      <MessageList
        messages={messages}
        replyTarget={replyTarget}
        onReply={setReplyTarget}
      />

      <ChatInput
        currentModel={currentModel}
        onModelChange={onModelChange}
        onSubmit={(text, attachments) => {
          onSend(text, attachments);
          setReplyTarget(null);
        }}
        onCancel={onCancel}
        isStreaming={isStreaming}
        replyTarget={replyTarget}
        onClearReply={() => setReplyTarget(null)}
      />
    </div>
  );
};

export default ChatPanel;
