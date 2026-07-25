/**
 * ChatHeader — title bar with new session, session list, and close buttons.
 */

import React from "react";
import { useI18n } from "@/i18n";

interface ChatHeaderProps {
  onNewSession?: () => void;
  onToggleSessions: () => void;
  onToggle: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ onNewSession, onToggleSessions, onToggle }) => {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
      <span style={{ color: "#fff", fontWeight: 600, fontSize: "14px" }}>{t("chat.title")}</span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {onNewSession && (
          <button onClick={onNewSession} title={t("chat.new")} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#8bd3ff", cursor: "pointer", fontSize: "12px", padding: "2px 8px", borderRadius: 10 }}>
            {t("chat.new")}
          </button>
        )}
        <button onClick={onToggleSessions} title={t("session.list")} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#aaa", cursor: "pointer", fontSize: "12px", padding: "2px 8px", borderRadius: 10 }}>
          ☰
        </button>
        <button onClick={onToggle} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: "16px" }}>✕</button>
      </div>
    </div>
  );
};

export default ChatHeader;
