/**
 * SessionList — dropdown list of sessions with switch and delete.
 *
 * Reads gatewayClient from window.__gw.
 */

import React, { useState, useCallback, useEffect } from "react";
import { useI18n } from "@/i18n";

interface SessionItem {
  key: string;
  label?: string;
  lastMessage?: string;
}

interface SessionListProps {
  visible: boolean;
  chatVisible: boolean;
}

const SessionList: React.FC<SessionListProps> = ({ visible, chatVisible }) => {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (typeof window.__gw !== "undefined") {
      try {
        const gw = window.__gw as { listSessions: (opts: { limit: number }) => Promise<SessionItem[]> };
        const list = await gw.listSessions({ limit: 20 });
        setSessions(list.slice(0, 20));
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => { if (chatVisible) fetchSessions(); }, [chatVisible, fetchSessions]);

  const handleSelect = (key: string) => {
    if (typeof window.__gw !== "undefined") {
      const gw = window.__gw as { switchSession: (key: string) => void };
      gw.switchSession(key);
      window.__handleSelectSession?.(key);
    }
  };

  const handleDelete = async (key: string) => {
    if (deletingSession === key) return;
    setDeletingSession(key);
    try {
      if (typeof window.__gw !== "undefined") {
        const gw = window.__gw as { deleteSession: (key: string) => Promise<void>; sessionKey: string; switchSession: (key: string) => void };
        await gw.deleteSession(key);
        if (gw.sessionKey === key) {
          gw.switchSession("agent:main:main");
          window.__handleSelectSession?.("agent:main:main");
        }
      }
      fetchSessions();
    } catch (err) {
      console.warn("Delete session failed:", err);
    } finally {
      setDeletingSession(null);
    }
  };

  if (!visible) return null;

  return (
    <div style={{ maxHeight: 200, overflowY: "auto", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
      {sessions.length === 0 ? (
        <p style={{ color: "#666", fontSize: 11, textAlign: "center", padding: 8 }}>{t("session.noSessions")}</p>
      ) : (
        sessions.map((s) => {
          const key = s.key || "";
          const label = s.label || s.lastMessage || key.slice(-8);
          const isDeleting = deletingSession === key;
          return (
            <div
              key={key}
              style={{ padding: "6px 16px", cursor: "pointer", fontSize: 12, color: "#ccc", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span
                onClick={() => handleSelect(key)}
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
              >{label}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(key); }}
                title={t("session.delete")}
                disabled={isDeleting}
                style={{
                  background: "none", border: "none",
                  color: isDeleting ? "#666" : "#f66",
                  cursor: isDeleting ? "default" : "pointer",
                  fontSize: 14, padding: "0 4px", opacity: 0.6,
                  flexShrink: 0,
                }}
              >
                {isDeleting ? "⏳" : "🗑"}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
};

export default SessionList;
