/**
 * GatewayConfigEditor — modal form for editing a single agent backend config.
 */

import React, { useState } from "react";
import { AGENT_BACKEND_META, type AgentBackendConfig, type AgentBackendType } from "@/types/backend";

interface GatewayConfigEditorProps {
  /** Existing config for editing, or undefined for new */
  config?: AgentBackendConfig;
  /** Called with the saved config (id will be generated for new configs) */
  onSave: (cfg: AgentBackendConfig) => void;
  onCancel: () => void;
}

const GatewayConfigEditor: React.FC<GatewayConfigEditorProps> = ({ config, onSave, onCancel }) => {
  const isNew = !config;
  const [name, setName] = useState(config?.name || "");
  const [type, setType] = useState<AgentBackendType>(config?.type || "openclaw");
  const [url, setUrl] = useState(config?.url || AGENT_BACKEND_META.openclaw.defaultUrl);
  const [token, setToken] = useState(config?.token || "");
  const [password, setPassword] = useState(config?.password || "");
  const [systemPrompt, setSystemPrompt] = useState(config?.systemPrompt || "");

  const handleSave = () => {
    if (!name.trim()) return;
    const id = config?.id || `${type}-${Date.now()}`;
    onSave({
      id,
      name: name.trim(),
      type,
      url: url.trim() || AGENT_BACKEND_META[type].defaultUrl,
      token: token || undefined,
      password: password || undefined,
      systemPrompt: systemPrompt || undefined,
      enabled: config?.enabled ?? false,
    });
  };

  const meta = AGENT_BACKEND_META[type];
  const visibleTypes = (Object.keys(AGENT_BACKEND_META) as AgentBackendType[]).filter(t => !AGENT_BACKEND_META[t].hidden);

  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
        background: "rgba(0,0,0,0.6)", zIndex: 3000,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: "#1a1d23", borderRadius: 12, padding: 24,
          minWidth: 380, maxWidth: 440, maxHeight: "85vh", overflowY: "auto",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)", color: "#e0e4ea",
        }}
      >
        <h3 style={{ margin: "0 0 18px", fontSize: 16 }}>
          {isNew ? "添加配置" : "编辑配置"}
        </h3>

        {/* Name */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>名称</label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="例如: 公司服务器"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 14, boxSizing: "border-box" }}
          />
        </div>

        {/* Backend type (read-only for existing configs) */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>后端类型</label>
          <div style={{ display: "flex", gap: 8 }}>
            {visibleTypes.map(t => (
              <button
                key={t}
                onClick={() => !config && setType(t)}
                disabled={!!config}
                style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: type === t ? "2px solid #4493f8" : "1px solid #3a3f4b",
                  background: type === t ? "rgba(68,147,248,0.15)" : "#121418",
                  color: type === t ? "#e0e4ea" : "#8b95a5",
                  cursor: config ? "default" : "pointer", fontSize: 13,
                  fontWeight: type === t ? 600 : 400,
                  opacity: config && type !== t ? 0.5 : 1,
                }}
              >
                {AGENT_BACKEND_META[t].label}
              </button>
            ))}
          </div>
          <p style={{ color: "#666", fontSize: 11, marginTop: 4 }}>{meta.description}</p>
        </div>

        {/* WebSocket URL */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>WebSocket URL</label>
          <input
            type="text" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder={meta.defaultUrl}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 14, boxSizing: "border-box", fontFamily: "monospace" }}
          />
        </div>

        {/* Token */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>Token <span style={{ color: "#666" }}>（可选）</span></label>
          <input
            type="password" value={token} onChange={(e) => setToken(e.target.value)}
            placeholder="Auth token"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 14, boxSizing: "border-box", fontFamily: "monospace" }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>密码 <span style={{ color: "#666" }}>（可选）</span></label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Connect password"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 14, boxSizing: "border-box", fontFamily: "monospace" }}
          />
        </div>

        {/* System prompt */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8b95a5" }}>系统提示词 <span style={{ color: "#666" }}>（可选）</span></label>
          <textarea
            value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="自定义系统提示词..."
            rows={4}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #3a3f4b", background: "#121418", color: "#e0e4ea", fontSize: 13, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "8px 18px", borderRadius: 6, border: "1px solid #3a3f4b", background: "transparent", color: "#8b95a5", cursor: "pointer", fontSize: 14 }}>
            取消
          </button>
          <button onClick={handleSave} disabled={!name.trim()} style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: name.trim() ? "#4493f8" : "rgba(255,255,255,0.1)", color: name.trim() ? "#fff" : "#666", cursor: name.trim() ? "pointer" : "default", fontSize: 14, fontWeight: 600 }}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default GatewayConfigEditor;
