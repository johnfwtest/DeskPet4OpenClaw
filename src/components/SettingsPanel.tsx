import React, { useState, useEffect } from "react";
import ModelManager from "@/components/ModelManager";
import { loadBackendConfigs, saveBackendConfigs } from "@/services/adapters";
import { AGENT_BACKEND_META, type AgentBackendConfig, type AgentBackendType } from "@/types/backend";
import { ttsPlayer, loadTTSConfig, type TTSConfig } from "@/services/ttsPlayer";
import { ttsBuiltin } from "@/services/ttsBuiltin";
import { TTS_VENDORS } from "@/services/ttsOnline";
import { useI18n, type Lang } from "@/i18n";

export interface SettingsConfig {
  wsUrl: string;
  token: string;
  password: string;
}

// ── Legacy compat (used by App.tsx during migration) ────────────

export function getSettings(): SettingsConfig {
  const configs = loadBackendConfigs();
  const active = configs.find(c => c.enabled) || configs[0];
  if (!active) return { wsUrl: "", token: "", password: "" };
  return { wsUrl: active.url, token: active.token || "", password: active.password || "" };
}

export function saveSettings(cfg: SettingsConfig): void {
  const configs = loadBackendConfigs();
  const activeIdx = configs.findIndex(c => c.enabled);
  if (activeIdx >= 0) {
    configs[activeIdx].url = cfg.wsUrl;
    configs[activeIdx].token = cfg.token;
    configs[activeIdx].password = cfg.password;
  }
  saveBackendConfigs(configs);
}

// ── Panel props ────────────────────────────────────────────────

interface SettingsPanelProps {
  config: SettingsConfig;
  onSave: (cfg: SettingsConfig) => void;
  onClose: () => void;
  onSwitchGateway?: (type: AgentBackendType, cfg: AgentBackendConfig) => void;
  onSwitchModel?: (model: { name: string; path: string; modelJsonPath: string; sizeMB: number; expressionCount: number; addedAt: string }) => void;
  currentModelName?: string;
  standalone?: boolean; // when true, skip the outer modal overlay
}

type Tab = "gateway" | "prompt" | "tts" | "models" | "system";

const tabKeys: Record<Tab, string> = {
  gateway: "settings.gateway",
  prompt: "settings.prompt",
  tts: "settings.tts",
  models: "settings.models",
  system: "settings.system",
};

const tabIcons: Record<Tab, string> = {
  gateway: "⚡",
  prompt: "📝",
  tts: "📢",
  models: "🎭",
  system: "⚙",
};

const visibleTypes = (Object.keys(AGENT_BACKEND_META) as AgentBackendType[]).filter(t => !AGENT_BACKEND_META[t].hidden);

function getOrCreateConfig(configs: AgentBackendConfig[], type: AgentBackendType): AgentBackendConfig {
  const existing = configs.find(c => c.type === type);
  if (existing) return existing;
  return {
    id: `${type}-default`,
    name: AGENT_BACKEND_META[type].label,
    type,
    url: AGENT_BACKEND_META[type].defaultUrl,
    enabled: false,
  };
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  onSave,
  onClose,
  onSwitchGateway,
  onSwitchModel,
  currentModelName,
  standalone,
}) => {
  const { t, lang, setLang } = useI18n();
  const [backendConfigs, setBackendConfigs] = useState<AgentBackendConfig[]>(() => loadBackendConfigs());
  const activeConfig = backendConfigs.find(c => c.enabled);

  // Backend type tab (which backend's form is shown)
  const [backendType, setBackendType] = useState<AgentBackendType>(activeConfig?.type || "openclaw");

  // Form state — sync when backendType changes
  const currentConfig = getOrCreateConfig(backendConfigs, backendType);
  const [wsUrl, setWsUrl] = useState(currentConfig.url);
  const [token, setToken] = useState(currentConfig.token || "");
  const [password, setPassword] = useState(currentConfig.password || "");
  const [systemPrompt, setSystemPrompt] = useState(currentConfig.systemPrompt || "");
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>("gateway");

  // Sync form when switching backend type tab
  useEffect(() => {
    const cfg = getOrCreateConfig(backendConfigs, backendType);
    setWsUrl(cfg.url);
    setToken(cfg.token || "");
    setPassword(cfg.password || "");
    setSystemPrompt(cfg.systemPrompt || "");
  }, [backendType, backendConfigs]);

  const meta = AGENT_BACKEND_META[backendType];

  const handleSave = () => {
    const updated = backendConfigs.map(c =>
      c.type === backendType
        ? { ...c, url: wsUrl, token: token || undefined, password: password || undefined, enabled: true }
        : { ...c, enabled: false }
    );
    if (!updated.find(c => c.type === backendType)) {
      updated.push({
        id: `${backendType}-default`,
        name: meta.label,
        type: backendType,
        url: wsUrl,
        token: token || undefined,
        password: password || undefined,
        systemPrompt: undefined,
        enabled: true,
      });
    }
    saveBackendConfigs(updated);
    console.log("[SettingsPanel] saved configs to localStorage");
    setBackendConfigs(updated);
    const cfg = { wsUrl, token, password };
    console.log("[SettingsPanel] calling onSave with:", cfg);
    saveSettings(cfg);
    onSave(cfg);
    onSwitchGateway?.(backendType, updated.find(c => c.type === backendType)!);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const outer = standalone
    ? { width: "100%", height: "100%", overflow: "hidden", background: "#1a1d23", color: "#e0e4ea", display: "flex", flexDirection: "column" } as const
    : { position: "fixed" as const, top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" };
  const inner = standalone
    ? { background: "#1a1d23", padding: 0, width: "100%", height: "100%", color: "#e0e4ea", display: "flex", flexDirection: "column", overflow: "hidden" } as const
    : { background: "#1a1d23", borderRadius: 12, padding: 0, minWidth: 520, maxWidth: 600, maxHeight: "80vh", boxShadow: "0 8px 40px rgba(0,0,0,0.5)", color: "#e0e4ea", display: "flex", flexDirection: "column", overflow: "hidden" } as const;

  return (
    <div style={outer} onClick={(e) => { if (!standalone && e.target === e.currentTarget) onClose(); }}>
      <div style={inner}>
        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #2a2d35" }}>
          {(Object.keys(tabKeys) as Tab[]).map((kt) => (
            <button
              key={kt} onClick={() => setTab(kt)}
              style={{
                flex: 1, padding: "14px 8px", border: "none",
                background: tab === kt ? "#22262d" : "transparent",
                color: tab === kt ? "#e0e4ea" : "#6a7080",
                cursor: "pointer", fontSize: 12,
                fontWeight: tab === kt ? 600 : 400,
                borderBottom: tab === kt ? "2px solid #4493f8" : "2px solid transparent",
                transition: "all 0.15s ease",
              }}
            >
              {tabIcons[kt]} {t(tabKeys[kt])}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
          {tab === "gateway" && (
            <>
              <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>⚡ {t("gateway.title")}</h3>

              {/* First-time setup tip */}
              <div style={{
                marginBottom: 16, padding: "10px 14px",
                background: "rgba(255,180,60,0.12)", borderRadius: 8,
                border: "1px solid rgba(255,180,60,0.25)",
                color: "#e8c84a", fontSize: 12, lineHeight: 1.6,
              }}>
                💡 <strong>TIP:</strong> Have you added <code style={{ color: "#fff", background: "rgba(0,0,0,0.3)", padding: "1px 4px", borderRadius: 3 }}>http://localhost:18900</code> to your OpenClaw Gateway's <code style={{ color: "#fff", background: "rgba(0,0,0,0.3)", padding: "1px 4px", borderRadius: 3 }}>controlUi.allowedOrigins</code>?
              </div>

              {/* Backend type tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #2a2d35" }}>
                {visibleTypes.map(t => {
                  const cfg = backendConfigs.find(c => c.type === t);
                  const isActive = cfg?.enabled;
                  const isSelected = backendType === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setBackendType(t)}
                      style={{
                        padding: "8px 16px", border: "none",
                        background: "transparent",
                        color: isSelected ? "#e0e4ea" : "#6a7080",
                        cursor: "pointer", fontSize: 13,
                        fontWeight: isSelected ? 600 : 400,
                        borderBottom: isSelected ? "2px solid #4493f8" : "2px solid transparent",
                        marginBottom: -1,
                      }}
                    >
                      {AGENT_BACKEND_META[t].label}
                      {isActive && <span style={{ marginLeft: 6, fontSize: 9, color: "#4f8" }}>●</span>}
                    </button>
                  );
                })}
              </div>

              {/* Inline config form */}
              <p style={{ color: "#666", fontSize: 11, marginBottom: 14 }}>{meta.description}</p>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>
                  {t("gateway.url")}
                </label>
                <input
                  type="text" value={wsUrl} onChange={(e) => setWsUrl(e.target.value)}
                  placeholder={meta.defaultUrl}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 14, boxSizing: "border-box", fontFamily: "monospace" }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>
                  {t("gateway.token")} <span style={{ color: "#666" }}>{t("gateway.tokenHint")}</span>
                </label>
                <input
                  type="password" value={token} onChange={(e) => setToken(e.target.value)}
                  placeholder="Auth token"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 14, boxSizing: "border-box", fontFamily: "monospace" }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>
                  {t("gateway.password")} <span style={{ color: "#666" }}>{t("gateway.passwordHint")}</span>
                </label>
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Connect password"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 14, boxSizing: "border-box", fontFamily: "monospace" }}
                />
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 6, border: "1px solid #3a3f4b", background: "transparent", color: "#8b95a5", cursor: "pointer", fontSize: 14 }}>
                  取消
                </button>
                <button onClick={handleSave} style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: saved ? "#2ea043" : "#4493f8", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                  {saved ? "✅ " + t("gateway.saved") : t("gateway.save")}
                </button>
              </div>
            </>
          )}

          {tab === "prompt" && (
            <>
              <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>📝 系统提示词</h3>
              <p style={{ color: "#666", fontSize: 12, marginBottom: 12 }}>
                当前后端：<strong>{AGENT_BACKEND_META[backendType].label}</strong>
                {activeConfig?.type !== backendType && "（保存前请先在 Agent 连接 Tab 中选择并连接）"}
              </p>
              <div style={{ marginBottom: 20 }}>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="输入自定义系统提示词..."
                  rows={6}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 13, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
                />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 6, border: "1px solid #3a3f4b", background: "transparent", color: "#8b95a5", cursor: "pointer", fontSize: 14 }}>
                  取消
                </button>
                <button onClick={() => {
                  const updated = backendConfigs.map(c =>
                    c.type === backendType ? { ...c, systemPrompt: systemPrompt || undefined } : c
                  );
                  saveBackendConfigs(updated);
                  setBackendConfigs(updated);
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2000);
                }} style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: saved ? "#2ea043" : "#4493f8", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                  {saved ? "✅ " + t("gateway.saved") : t("tts.save")}
                </button>
              </div>
            </>
          )}

          {tab === "tts" && (
            <TTSConfigTab />
          )}

          {tab === "models" && (
            <>
              <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>🎭 {t("models.title")}</h3>
              {onSwitchModel && currentModelName ? (
                <ModelManager onSwitchModel={onSwitchModel} currentModelName={currentModelName} />
              ) : (
                <p style={{ color: "#666", fontSize: 12, textAlign: "center" }}>{t("model.unavailable")}</p>
              )}
            </>
          )}

          {tab === "system" && (
            <>
              <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>⚙ {t("system.title")}</h3>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#8b95a5" }}>{t("system.language")}</label>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as Lang)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 14, boxSizing: "border-box" }}
                >
                  <option value="zh">{t("system.langZh")}</option>
                  <option value="en">{t("system.langEn")}</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;

// ── TTS Config Tab (inline component) ─────────────────────────

const TTSConfigTab: React.FC = () => {
  const { t } = useI18n();
  const [cfg, setCfg] = useState<TTSConfig>(loadTTSConfig);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const loadVoices = () => setVoices(ttsBuiltin.getVoices());
    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const handleSave = () => {
    ttsPlayer.setConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const langVoices = voices.filter(v => v.lang.startsWith("zh") || v.lang.startsWith("ja") || v.lang.startsWith("en"));

  return (
    <>
      <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>📢 {t("tts.title")}</h3>

      {/* Provider selector */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#8b95a5" }}>{t("tts.mode")}</label>
        <div style={{ display: "flex", gap: 8 }}>
          {(["builtin", "online"] as const).map(p => (
            <button
              key={p}
              onClick={() => setCfg(c => ({ ...c, provider: p }))}
              style={{
                padding: "8px 16px", borderRadius: 8,
                border: cfg.provider === p ? "2px solid #4493f8" : "1px solid #3a3f4b",
                background: cfg.provider === p ? "rgba(68,147,248,0.15)" : "#121418",
                color: cfg.provider === p ? "#e0e4ea" : "#8b95a5",
                cursor: "pointer", fontSize: 13,
                fontWeight: cfg.provider === p ? 600 : 400,
              }}
            >
              {p === "builtin" ? t("tts.builtin") : t("tts.online")}
            </button>
          ))}
        </div>
      </div>

      {cfg.provider === "builtin" && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>{t("tts.speed")}: {cfg.builtin.rate.toFixed(2)}x</label>
            <input
              type="range" min="0.5" max="2.0" step="0.05"
              value={cfg.builtin.rate}
              onChange={(e) => setCfg(c => ({ ...c, builtin: { ...c.builtin, rate: parseFloat(e.target.value) } }))}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>{t("tts.voice")}</label>
            <select
              value={cfg.builtin.voice}
              onChange={(e) => setCfg(c => ({ ...c, builtin: { ...c.builtin, voice: e.target.value } }))}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 13, boxSizing: "border-box" }}
            >
              <option value="">{t("tts.default")}</option>
              {langVoices.map(v => (
                <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
              ))}
            </select>
          </div>
        </>
      )}

      {cfg.provider === "online" && (
        <>
          {/* Preset selector */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#8b95a5" }}>TTS 服务商</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TTS_VENDORS.map(p => {
                const isActive = cfg.online.apiUrl === p.apiUrl;
                return (
                  <button
                    key={p.label}
                    onClick={() => setCfg(c => ({ ...c, online: { ...c.online, apiUrl: p.apiUrl, model: p.model, voice: p.voice } }))}
                    style={{
                      padding: "6px 14px", borderRadius: 8,
                      border: isActive ? "2px solid #4493f8" : "1px solid #3a3f4b",
                      background: isActive ? "rgba(68,147,248,0.15)" : "#121418",
                      color: isActive ? "#e0e4ea" : "#8b95a5",
                      cursor: "pointer", fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >{p.label}</button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>API URL</label>
            <input type="text" value={cfg.online.apiUrl} onChange={(e) => setCfg(c => ({ ...c, online: { ...c.online, apiUrl: e.target.value } }))}
              placeholder="https://api.openai.com/v1/audio/speech"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 13, boxSizing: "border-box", fontFamily: "monospace" }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>API Key</label>
            <input type="password" value={cfg.online.apiKey} onChange={(e) => setCfg(c => ({ ...c, online: { ...c.online, apiKey: e.target.value } }))}
              placeholder="sk-..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 13, boxSizing: "border-box", fontFamily: "monospace" }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>Model</label>
            <input type="text" value={cfg.online.model} onChange={(e) => setCfg(c => ({ ...c, online: { ...c.online, model: e.target.value } }))}
              placeholder="qwen3-tts-flash"
              list="tts-model-list"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 13, boxSizing: "border-box", fontFamily: "monospace" }}
            />
            <datalist id="tts-model-list">
              {(TTS_VENDORS.find(p => p.apiUrl === cfg.online.apiUrl)?.modelOptions
                ?? TTS_VENDORS.flatMap(p => p.modelOptions)
              ).map(v => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>Voice</label>
            <input type="text" value={cfg.online.voice} onChange={(e) => setCfg(c => ({ ...c, online: { ...c.online, voice: e.target.value } }))}
              placeholder="Cherry"
              list="tts-voice-list"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 13, boxSizing: "border-box" }}
            />
            <datalist id="tts-voice-list">
              {(TTS_VENDORS.find(p => p.apiUrl === cfg.online.apiUrl)?.voiceOptions
                ?? TTS_VENDORS.flatMap(p => p.voiceOptions)
              ).map(v => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>Speed: {cfg.online.speed.toFixed(2)}x</label>
            <input
              type="range" min="0.25" max="4.0" step="0.05"
              value={cfg.online.speed}
              onChange={(e) => setCfg(c => ({ ...c, online: { ...c.online, speed: parseFloat(e.target.value) } }))}
              style={{ width: "100%" }}
            />
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={handleSave} style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: saved ? "#2ea043" : "#4493f8", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
          {saved ? "✅ 已保存" : "保存"}
        </button>
      </div>
    </>
  );
};
