/**
 * DeskPet4OpenClaw App — Desk Pet with Gateway WebSocket connection.
 *
 * - Double-click anywhere to toggle chat.
 * - Click ⚙ to open settings.
 * - Right-click tray → "Move Window" to enter drag mode, click anywhere to stop.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { usePetEngine } from "@/engine/usePetEngine";
import SpeechBubble from "@/components/SpeechBubble";
import ChatPanel from "@/components/ChatPanel";
import SettingsPanel from "@/components/SettingsPanel";
import { getSettings, saveSettings, type SettingsConfig } from "@/components/SettingsPanel";
import { createAgentAdapter, getActiveBackendConfig } from "@/services/adapters";
import type { IAgentAdapter, AgentBackendType, AgentBackendConfig, ChatMessage } from "@/types/backend";
import { getCurrentModel as getSavedModelName, type ModelInfo, BUILTIN_MODEL_PATH } from "@/services/modelStore";
import { ttsPlayer } from "@/services/ttsPlayer";
import { playDingOnce } from "@/services/notifySound";

// ── Context menu types ────────────────────────────────────────
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

const DEFAULT_MODEL_PATH = BUILTIN_MODEL_PATH;

function getInitialModelPath(): string {
  const name = getSavedModelName();
  if (!name || name === "Hiyori (Free)") return DEFAULT_MODEL_PATH;
  // For uploaded models in Web mode, construct the ZIP URL
  if (!isTauri) return `/models/${encodeURIComponent(name)}.zip`;
  // Tauri mode: start with default, will be restored async
  return DEFAULT_MODEL_PATH;
}

function setCurrentModelName(name: string) { try { localStorage.setItem("seren-current-model", name); } catch {} }

const isTauri = !!window.__TAURI_INTERNALS__;

const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [bubbleText, setBubbleText] = useState("");
  const [showBubble, setShowBubble] = useState(false);
  const [bubblePinned, setBubblePinned] = useState(false);
  const [connState, setConnState] = useState<string>("disconnected");
  const [settingsVisible, setSettingsVisible] = useState(!isTauri);
  const [settingsCfg, setSettingsCfg] = useState<SettingsConfig>(getSettings);
  const [currentAiModel, setCurrentAiModel] = useState("minimax/MiniMax-M3");
  const [currentModelPath, setCurrentModelPath] = useState(getInitialModelPath);
  const [currentL2DModelName, setCurrentL2DModelName] = useState(() => getSavedModelName());
  const [ttsEnabled, setTtsEnabled] = useState(() => ttsPlayer.enabled);
  const [moveMode, setMoveMode] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });
  const ttsEnabledRef = useRef(ttsEnabled);
  ttsEnabledRef.current = ttsEnabled;

  // ── Context menu (right-click on main window) ──────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, select, .chat-panel, .chat-toggle-btn")) return;
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setCtxMenu(v => ({ ...v, visible: false }));
  }, []);

  useEffect(() => {
    if (!ctxMenu.visible) return;
    const handler = () => closeContextMenu();
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [ctxMenu.visible, closeContextMenu]);

  // ── Notify on message when hidden ─────────────────────────
  const windowHiddenRef = useRef(false);

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      if (cancelled) return;
      const w = getCurrentWindow();
      w.isVisible().then(v => { if (!cancelled) { windowHiddenRef.current = !v; } });
    });
    // Listen for custom window visibility events emitted from Rust (Tauri 2 no longer has tauri://show/hide)
    import("@tauri-apps/api/event").then(({ listen }) => {
      if (cancelled) return;
      listen("seren:window-shown", () => { if (!cancelled) { windowHiddenRef.current = false; } }).catch(() => {});
      listen("seren:window-hidden", () => { if (!cancelled) { windowHiddenRef.current = true; } }).catch(() => {});
    });
    return () => { cancelled = true; };
  }, []);

  const gwRef = useRef<IAgentAdapter | null>(null);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deltaBufferRef = useRef<Map<string, string>>(new Map());
  const currentRunIdRef = useRef<string | null>(null);
  const currentWindowRef = useRef<{ startDragging: () => void } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const pet = usePetEngine(containerRef, {
    modelPath: currentModelPath,
    width: 500, height: 600,
    onModelLoaded: useCallback((nativeW: number, nativeH: number) => {
      if (!isTauri || !nativeW || !nativeH) return;
      // Fit window to model's aspect ratio, clamped between min and max
      const minW = 300, minH = 400, maxW = 600, maxH = 700;
      const ratio = nativeW / nativeH;
      if (ratio <= 0 || ratio > 5) return; // sanity check
      const targetH = Math.min(maxH, Math.max(minH, 500));
      const targetW = Math.min(maxW, Math.max(minW, Math.round(targetH * ratio)));
      import("@tauri-apps/api/dpi").then(({ LogicalSize }) => {
        import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
          getCurrentWindow().setSize(new LogicalSize(targetW, targetH)).catch(() => {});
        });
      });
    }, []),
  });

  // ── Preload Tauri window handle ─────────────────────────────
  useEffect(() => {
    if (isTauri) {
      import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        currentWindowRef.current = getCurrentWindow();
      });
    }
  }, []);

  // ── Move mode (triggered by tray menu "Move Window") ────────
  const enableMove = useCallback(() => {
    setMoveMode(true);
  }, []);

  const disableMove = useCallback(() => {
    setMoveMode(false);
    document.body.style.cursor = "default";
  }, []);

  useEffect(() => {
    window.__seren_enable_move = enableMove;
    return () => { delete window.__seren_enable_move; };
  }, [enableMove]);

  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    if (!moveMode) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, select")) return;
    if (isTauri && currentWindowRef.current) {
      try { currentWindowRef.current.startDragging(); } catch {}
    }
    disableMove();
  }, [moveMode, disableMove]);

  // ── Toggle settings (tray menu & ⚙ button both call this) ──
  const toggleSettingsBrowser = useCallback(() => {
    if (isTauri) {
      import("@tauri-apps/api/event").then(({ emit }) => {
        emit("seren:open-settings").catch(() => {});
      });
    } else {
      setSettingsVisible(v => !v);
    }
  }, []);

  useEffect(() => {
    window.__seren_open_settings = toggleSettingsBrowser;
    return () => { delete window.__seren_open_settings; };
  }, [toggleSettingsBrowser]);

  // ── Close settings (browser inline panel only — Tauri uses standalone window)
  const closeSettings = useCallback(() => {
    setSettingsVisible(false);
  }, []);

  // Shared Gateway callback set used by both initial connect and gateway switch.
  const buildGatewayCallbacks = useCallback(() => ({
    onHelloOk(hello: { sessionKey: string }) {
      console.log("[seren] ✅ Connected! sessionKey:", hello.sessionKey);
      closeSettings();
      // In Tauri mode, close the standalone settings window on successful connect
      if (isTauri) {
        import("@tauri-apps/api/webviewWindow").then(async ({ WebviewWindow }) => {
          try { (await WebviewWindow.getByLabel("settings"))?.close(); } catch {}
        });
      }
      showBubbleText("✅ 已连接到 Gateway");
      const g = gwRef.current!;
      (async () => {
        try {
          const sessions = await g.listSessions({ limit: 5 });
          if (sessions.length > 0) {
            g.switchSession(sessions[0].key);
            try {
              const history = await g.getHistory(sessions[0].key, 50);
              if (history.length > 0) setMessages(history.map(m => ({
                id: m.id, role: m.role as "user" | "agent", text: m.text, timestamp: Date.now(),
              })));
            } catch {}
          } else {
            const result = await g.createSession();
            g.switchSession(result.key);
          }
        } catch (e: unknown) { console.warn("[seren] session setup failed:", (e as Error)?.message); }
      })();
    },
    onDelta(runId: string, text: string, replace: boolean) {
      if (!text) return;
      if (replace) deltaBufferRef.current.set(runId, text);
      else { const prev = deltaBufferRef.current.get(runId) || ""; deltaBufferRef.current.set(runId, prev + text); }
      // Sound rules:
      //  - TTS off  -> no sound at all (regardless of visibility)
      //  - TTS on + visible  -> TTS speaks at onFinal (no ding)
      //  - TTS on + hidden   -> ding (alert sound, no TTS)
      if (ttsEnabledRef.current && windowHiddenRef.current) playDingOnce(runId);
      showBubbleText(deltaBufferRef.current.get(runId) || "");
    },
    onFinal(runId: string, text: string) {
      if (!text || !text.trim()) return;
      deltaBufferRef.current.delete(runId);
      if (currentRunIdRef.current === runId) { currentRunIdRef.current = null; setIsStreaming(false); }
      pet.matchExpression(text); showBubbleText(text);
      setMessages((prev: ChatMessage[]) => [...prev, { id: runId, role: "agent", text, timestamp: Date.now() }]);
      const visible = !windowHiddenRef.current;
      if (visible && ttsEnabledRef.current) {
        // Window visible + TTS on: read the message aloud.
        ttsPlayer.speak(text);
      } else if (!visible) {
        // Window hidden: just a notification (ding already played during streaming).
        import("@tauri-apps/plugin-notification").then(({ sendNotification }) => {
          sendNotification({ title: "Seren", body: text.slice(0, 200) });
        }).catch(() => {});
      }
    },
    onError(runId: string, message: string) {
      if (currentRunIdRef.current === runId) { currentRunIdRef.current = null; setIsStreaming(false); }
      deltaBufferRef.current.delete(runId);
      const lower = message.toLowerCase();
      if (lower.includes("origin") || lower.includes("allowed")) {
        showBubbleText(`❌ ${message}\n\n💡 请确认已在 OpenClaw Gateway 配置中添加:\nhttp://localhost:18900 → controlUi.allowedOrigins`);
      } else {
        showBubbleText(`❌ ${message}`);
      }
    },
    onStateChange(state: string) { console.log("[seren] Gateway state →", state); setConnState(state); },
    // showBubbleText / pet / playDingOnce are referenced only inside the
    // deferred callback bodies above, so they need not (and, being declared
    // later in the component, cannot) appear in this synchronously-evaluated
    // deps array. They're either stable or harmless if stale.
  }), [closeSettings]);

  const doConnect = useCallback((cfg: SettingsConfig) => {
    if (!cfg.wsUrl) return;
    gwRef.current?.disconnect();
    deltaBufferRef.current.clear();

    const backendConfig = getActiveBackendConfig() || {
      id: "openclaw-default", name: "Default",
      type: "openclaw" as const,
      url: cfg.wsUrl, token: cfg.token, password: cfg.password, enabled: true,
    };
    const gw = createAgentAdapter(backendConfig, buildGatewayCallbacks());
    gwRef.current = gw;
    // Exposed for ChatInput (model list) and SessionList (session CRUD).
    window.__gw = gw;
    gw.connect();
  }, [buildGatewayCallbacks]);

  useEffect(() => {
    const cfg = getSettings();
    if (cfg.wsUrl) doConnect(cfg);
  }, []);

  // Auto-retry: if not connected, retry every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (connState !== "connected" && settingsCfg.wsUrl) {
        console.log("[seren] auto-retry: not connected, reconnecting...");
        doConnect(settingsCfg);
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [connState, settingsCfg, doConnect]);

  // Listen for events from the standalone settings window
  useEffect(() => {
    if (!isTauri) return;
    const unlisteners: (() => void)[] = [];
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ wsUrl: string; token: string; password: string }>("seren:settings-saved", (evt) => {
        setSettingsCfg(evt.payload);
        doConnect(evt.payload);
      }).then(fn => unlisteners.push(fn));

      // model-switched listener registered below after handleSwitchLive2DModel is defined
    });
    return () => { unlisteners.forEach(fn => fn()); };
  }, [doConnect]);

  // ── Helpers ────────────────────────────────────────────────
  const showBubbleText = (text: string) => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubbleText(text); setShowBubble(true); startBubbleTimer();
  };
  const bubbleHoveredRef = useRef(false);
  const clearBubbleTimer = () => { if (bubbleTimerRef.current) { clearTimeout(bubbleTimerRef.current); bubbleTimerRef.current = null; } };
  const startBubbleTimer = () => {
    if (bubblePinned) return;
    if (bubbleHoveredRef.current) return; // mouse is hovering, don't start countdown
    clearBubbleTimer();
    bubbleTimerRef.current = setTimeout(() => { setShowBubble(false); pet.resetExpression(); }, Math.max(10000, (bubbleText?.length || 0) * 60));
  };
  const handleBubbleMouseEnter = () => { bubbleHoveredRef.current = true; clearBubbleTimer(); };
  const handleBubbleMouseLeave = () => { bubbleHoveredRef.current = false; startBubbleTimer(); };
  useEffect(() => { ttsPlayer.onStateChange((s) => { s === "speaking" ? clearBubbleTimer() : startBubbleTimer(); }); }, []);
  const toggleBubblePin = () => { setBubblePinned(p => !p); };

  const handleCancel = useCallback(async () => {
    if (!currentRunIdRef.current) return;
    try { await gwRef.current?.cancelChat(currentRunIdRef.current); } catch {}
    deltaBufferRef.current.delete(currentRunIdRef.current);
    currentRunIdRef.current = null; setIsStreaming(false); pet.resetExpression(); showBubbleText("⏹ 已停止");
  }, []);
  const handleNewSession = useCallback(async () => {
    const gw = gwRef.current; if (!gw) return showBubbleText("请先连接到 Gateway");
    try { const r = await gw.createSession(); gw.switchSession(r.key); setMessages([]); deltaBufferRef.current.clear(); showBubbleText("✅ 新会话已创建"); } catch (e: unknown) { showBubbleText(`❌ ${(e as Error).message}`); }
  }, []);

  // Session selection handler for SessionList
  const handleSelectSession = useCallback((sessionKey: string) => {
    const gw = gwRef.current;
    if (!gw) return;
    gw.switchSession(sessionKey);
    (async () => {
      try {
        const history = await gw.getHistory(sessionKey, 50);
        if (history.length > 0) setMessages(history.map(m => ({
          id: m.id, role: m.role as "user" | "agent", text: m.text, timestamp: Date.now(),
        })));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    window.__handleSelectSession = handleSelectSession;
    return () => { delete window.__handleSelectSession; };
  }, [handleSelectSession]);
  const handleSend = useCallback(async (text: string, attachments?: { type: string; mimeType: string; fileName: string; content: string }[]) => {
    // /clear or /start: clear current chat history before sending
    if (/^\/(clear|start)\s*/i.test(text)) {
      try { await gwRef.current?.createSession(); } catch {}
      setMessages([]);
      showBubbleText("✅ 会话已清空");
      // Send the rest of the message if any
      const rest = text.replace(/^\/(clear|start)\s*/i, "").trim();
      if (!rest) return;
      text = rest;
    }
    setMessages(p => [...p, { id: `user-${Date.now()}`, role: "user", text, timestamp: Date.now() }]); setIsStreaming(true);
    try { const rid = await gwRef.current?.sendChat(text, undefined, attachments); if (rid) currentRunIdRef.current = rid; else setIsStreaming(false); } catch (e: unknown) { setIsStreaming(false); currentRunIdRef.current = null; showBubbleText(`❌ ${(e as Error)?.message || "发送失败"}`); }
  }, []);
  const handleAiModelChange = useCallback(async (id: string) => {
    if (!gwRef.current) return; try { await gwRef.current.setModel(id); setCurrentAiModel(id); showBubbleText(`✅ ${id}`); } catch (e: unknown) { showBubbleText(`❌ ${(e as Error).message}`); }
  }, []);
  const handleSwitchLive2DModel = useCallback(async (model: ModelInfo) => {
    setCurrentL2DModelName(model.name); setCurrentModelName(model.name);
    if (model.addedAt === "built-in") {
      setCurrentModelPath(model.modelJsonPath);
    } else if (model.modelJsonPath.startsWith("/model/")) {
      // Model from public/model/ — loaded directly via app assets
      setCurrentModelPath(model.modelJsonPath);
    } else if (isTauri) {
      // Tauri: read the ZIP bytes from disk and load it in-browser via a File.
      // pixi-live2d-display's ZipLoader resolves all resources (moc3/textures/
      // motions/expressions) within the zip, so no XHR to any custom scheme —
      // this avoids the Chromium cross-scheme CORS block that killed the old
      // seren-model:// protocol. Rust returns raw bytes as an ArrayBuffer.
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<unknown>("read_model_zip", { name: model.name });
        // Rust returns raw bytes via tauri::ipc::Response → ArrayBuffer. Be
        // defensive in case of a number[] fallback so File always gets a BufferSource.
        const buf: ArrayBuffer = result instanceof ArrayBuffer
          ? result
          : new Uint8Array(result as number[]).buffer;
        const file = new File([buf], `${model.name}.zip`, { type: "application/zip" });
        // Live2DStage.init() reads __seren_model_source (if set) as the model
        // source and consumes it once. Must be set before modelPath changes.
        window.__seren_model_source = [file];
        // Sentinel value to trigger the engine's re-init effect (deps: modelPath).
        setCurrentModelPath(`zip://${model.name}`);
      } catch (e) {
        console.warn("Failed to load model zip, falling back to default:", e);
        setCurrentModelPath(DEFAULT_MODEL_PATH);
        showBubbleText(`❌ 加载失败，已切回默认模型`);
        return;
      }
    } else {
      // Web mode: load ZIP from /models/ via Vite middleware
      const zipUrl = `/models/${encodeURIComponent(model.name)}.zip`;
      window.__seren_model_source = undefined; // let engine fetch via URL
      setCurrentModelPath(zipUrl);
    }
    showBubbleText(`🎭 模型已切换为: ${model.name}`);
  }, []);

  // ── Restore saved model on startup ────────────────────────
  useEffect(() => {
    const savedName = getSavedModelName();
    if (!savedName || savedName === "Hiyori (Free)") return;
    // Restore uploaded (non-built-in) model
    (async () => {
      try {
        const { listModels } = await import("@/services/modelStore");
        const all = await listModels();
        const found = all.find(m => m.name === savedName);
        if (found) handleSwitchLive2DModel(found);
      } catch { /* ignore */ }
    })();
  }, []); // run once on mount

  // Listen for model switch events from settings window
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<ModelInfo>("seren:model-switched", (evt) => {
        handleSwitchLive2DModel(evt.payload);
      }).then(fn => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, [handleSwitchLive2DModel]);

  const handleSettingsSave = (cfg: SettingsConfig) => { setSettingsCfg(cfg); saveSettings(cfg); doConnect(cfg); };
  const handleSwitchGateway = useCallback((_t: AgentBackendType, cfg: AgentBackendConfig) => {
    if (!cfg.url) return;
    gwRef.current?.disconnect();
    deltaBufferRef.current.clear();
    setMessages([]);
    gwRef.current = createAgentAdapter(cfg, buildGatewayCallbacks());
    // Exposed for ChatInput (model list) and SessionList (session CRUD).
    window.__gw = gwRef.current;
    gwRef.current.connect();
  }, [buildGatewayCallbacks]);

  // ── UI ─────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      onMouseDown={handleContainerMouseDown}
      style={{
        width: "100vw", height: "100vh", position: "relative",
        background: "transparent", overflow: "hidden",
        cursor: moveMode ? "move" : "default",
      }}
      onDoubleClick={() => setChatVisible(v => !v)}
      onContextMenu={handleContextMenu}
    >
      {/* Overlay prompt when in move mode */}
      {moveMode && (
        <div style={{ position: "fixed", inset: 0, zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", pointerEvents: "none" }}>
          <div style={{ background: "#1a1d23", color: "#e0e4ea", padding: "16px 28px", borderRadius: 10, fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
            🖱 拖动窗口到想要的位置，点击释放
          </div>
        </div>
      )}

      {/* Settings + TTS buttons */}
      <button onClick={toggleSettingsBrowser} title="Settings"
        style={{ position: "fixed", top: 8, left: 10, zIndex: 1001, width: 38, height: 38, border: "none", background: "rgba(255,255,255,0.15)", borderRadius: "50%", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa" }}
      >⚙</button>
      <button onClick={() => { const on = ttsPlayer.toggleEnabled(); setTtsEnabled(on); }}
        title={ttsEnabled ? "TTS on" : "TTS off"}
        style={{ position: "fixed", top: 8, left: 54, zIndex: 1001, width: 38, height: 38, border: "none", background: ttsEnabled ? "rgba(100,200,100,0.2)" : "rgba(255,255,255,0.1)", borderRadius: "50%", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", color: ttsEnabled ? "#8f8" : "#aaa" }}
      >{ttsEnabled ? "🔊" : "🔇"}</button>
      {/* Gateway status indicator */}
      <div style={{ position: "fixed", top: 6, right: 6, width: 8, height: 8, borderRadius: "50%", background: connState === "connected" ? "#4f8" : connState === "connecting" || connState === "reconnecting" ? "#fa0" : "#f44", zIndex: 1001, opacity: 0.7 }} title={`Gateway: ${connState}`} />

      <SpeechBubble text={bubbleText} visible={showBubble} pinned={bubblePinned} onTogglePin={toggleBubblePin} position={{ x: window.innerWidth / 2, y: window.innerHeight * 0.35 }} onMouseEnter={handleBubbleMouseEnter} onMouseLeave={handleBubbleMouseLeave} />
      <ChatPanel visible={chatVisible} onToggle={() => setChatVisible(v => !v)} onSend={handleSend} onCancel={handleCancel} isStreaming={isStreaming} messages={messages} onNewSession={handleNewSession} onModelChange={handleAiModelChange} currentModel={currentAiModel} />

      {settingsVisible && (
        <SettingsPanel
          config={settingsCfg} onSave={handleSettingsSave} onClose={closeSettings}
          onSwitchModel={handleSwitchLive2DModel} onSwitchGateway={handleSwitchGateway}
          currentModelName={currentL2DModelName}
        />
      )}

      {!pet.isLoaded && <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", color: "rgba(255,255,255,0.5)", fontSize: 14, pointerEvents: "none" }}>Loading...</div>}

      {/* ── Context menu (right-click on main window) ─────── */}
      {ctxMenu.visible && (
        <div
          onClick={closeContextMenu}
          style={{ position: "fixed", inset: 0, zIndex: 4000 }}
        >
          <div
            style={{
              position: "fixed",
              left: ctxMenu.x,
              top: ctxMenu.y,
              background: "#1e1f2b",
              border: "1px solid #3a3d4b",
              borderRadius: 8,
              padding: "4px 0",
              minWidth: 160,
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              zIndex: 4001,
            }}
          >
            {[
              { label: "显示 Seren", action: () => { if (isTauri) { import("@tauri-apps/api/window").then(({ getCurrentWindow }) => { getCurrentWindow().show(); windowHiddenRef.current = false; }); } } },
              { label: "隐藏 Seren", action: () => { if (isTauri) { import("@tauri-apps/api/window").then(({ getCurrentWindow }) => { getCurrentWindow().hide(); windowHiddenRef.current = true; }); } } },
              { label: "⚙ 设置", action: toggleSettingsBrowser },
              { label: "🖱 拖动窗口", action: enableMove },
              { label: (ttsEnabled ? "🔊 TTS" : "🔇 TTS"), action: () => { const on = ttsPlayer.toggleEnabled(); setTtsEnabled(on); } },
              { label: "退出", action: () => { if (isTauri) import("@tauri-apps/api/event").then(({ emit }) => emit("seren:quit")); else window.close(); } },
            ].map((item) => (
              <div
                key={item.label}
                onClick={() => { item.action(); closeContextMenu(); }}
                style={{
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#d0d4e0",
                  transition: "background 0.1s",
                  userSelect: "none",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#2a2d3a"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                {item.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
