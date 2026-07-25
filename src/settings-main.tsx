/**
 * Standalone settings page — loaded in a separate Tauri window.
 * Renders SettingsPanel without the modal overlay and communicates
 * with the main window via Tauri events.
 */

import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { I18nProvider } from "@/i18n";
import SettingsPanel from "./components/SettingsPanel";
import type { AgentBackendType, AgentBackendConfig } from "./types/backend";
import "./App.css";

async function emitSafe(event: string, payload: unknown) {
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(event, payload);
  } catch {
    // dev / browser fallback — save to localStorage, main window polls
  }
}

async function closeWindow() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  } catch {
    window.close();
  }
}

const SettingsStandalone: React.FC = () => {
  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWindow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSave = (cfg: { wsUrl: string; token: string; password: string }) => {
    // Persist to localStorage so the main window can read it
    try {
      const configs: { enabled?: boolean; url?: string; token?: string; password?: string }[] = JSON.parse(localStorage.getItem("seren-backend-configs") || "[]");
      const activeIdx = configs.findIndex((c) => c.enabled);
      if (activeIdx >= 0) {
        configs[activeIdx].url = cfg.wsUrl;
        configs[activeIdx].token = cfg.token;
        configs[activeIdx].password = cfg.password;
      }
      localStorage.setItem("seren-backend-configs", JSON.stringify(configs));
    } catch {}
    emitSafe("seren:settings-saved", cfg);
    // Don't close here — main window will close this settings window
    // when the connection is confirmed via seren:settings-saved event handling.
  };

  const handleClose = () => {
    closeWindow();
  };

  const handleSwitchGateway = (type: AgentBackendType, cfg: AgentBackendConfig) => {
    emitSafe("seren:gateway-switched", { type, cfg });
    closeWindow();
  };

  const handleSwitchModel = (model: {
    name: string; path: string; modelJsonPath: string;
    sizeMB: number; expressionCount: number; addedAt: string;
  }) => {
    emitSafe("seren:model-switched", model);
    // Don't close — user might want to switch models multiple times
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#1a1d23",
        color: "#e0e4ea",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SettingsPanel
        config={{ wsUrl: "", token: "", password: "" }}
        onSave={handleSave}
        onClose={handleClose}
        onSwitchGateway={handleSwitchGateway}
        onSwitchModel={handleSwitchModel}
        currentModelName={localStorage.getItem("seren-current-model") || "Hiyori (Free)"}
        standalone
      />
    </div>
  );
};

// Bootstrap
const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <I18nProvider>
        <SettingsStandalone />
      </I18nProvider>
    </React.StrictMode>
  );
}

export default SettingsStandalone;
