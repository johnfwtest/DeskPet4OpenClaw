/**
 * ModelManager — manage Live2D models: upload, list, switch, delete.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/i18n";
import { listModels, uploadModel, deleteModel, setCurrentModel, type ModelInfo } from "@/services/modelStore";

interface ModelManagerProps {
  onSwitchModel: (model: ModelInfo) => void;
  currentModelName: string;
}

const ModelManager: React.FC<ModelManagerProps> = ({ onSwitchModel, currentModelName }) => {
  const { t } = useI18n();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshModels = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      // Short delay to ensure Tauri IPC bridge is ready
      await new Promise(r => setTimeout(r, 100));
      const list = await listModels();
      setModels(list || []);
    } catch (e: unknown) {
      console.error("[ModelManager] Failed to load models:", e);
      setError((e as Error).message || "Failed to load models");
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError("");
    try {
      const file = files[0];
      if (!file.name.toLowerCase().endsWith(".zip")) {
        setError(t("models.uploadError") + " - " + file.name);
        setUploading(false);
        return;
      }
      console.log("[ModelManager] uploading:", file.name, file.size, "bytes");
      await uploadModel(file);
      console.log("[ModelManager] upload done, refreshing");
      await refreshModels();
    } catch (e: unknown) {
      console.error("[ModelManager] upload error:", e);
      const msg = (e as any)?.message || (e as any)?.toString() || t("models.errorGeneric");
      setError(String(msg));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSwitch = (model: ModelInfo) => {
    setCurrentModel(model.name);
    onSwitchModel(model);
  };

  const handleDelete = async (model: ModelInfo) => {
    if (model.addedAt === "built-in") {
      setError(t("models.builtinProtected"));
      return;
    }
    setDeleting(model.name);
    setError("");
    try {
      await deleteModel(model.name);
      await refreshModels();
      if (currentModelName === model.name) {
        const builtin = models.find(m => m.addedAt === "built-in");
        if (builtin) handleSwitch(builtin);
      }
    } catch (e: unknown) {
      const msg = (e as Error).message || String(e) || t("models.deleteError");
      setError(msg);
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso || iso === "built-in" || iso === "optional") return t("models.builtin");
    // Unix timestamp (seconds from Rust)
    const ts = parseInt(iso, 10);
    if (ts > 0 && ts < 9999999999) {
      const d = new Date(ts * 1000);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
      }
    }
    // ISO 8601 string (from dev mode / JS Date.toISOString())
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
    }
    return iso.slice(0, 10) || "—";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: "6px 16px",
            borderRadius: 8,
            border: "none",
            background: uploading ? "rgba(255,255,255,0.05)" : "rgba(100, 180, 255, 0.25)",
            color: uploading ? "#666" : "#8bd3ff",
            cursor: uploading ? "default" : "pointer",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {uploading ? "⏳ " + t("models.uploading") : "📤 " + t("models.upload")}
        </button>
        <span style={{ color: "#666", fontSize: 11 }}>{t("models.hint")}</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        style={{ display: "none" }}
        onChange={handleUpload}
      />

      {error && (
        <div style={{
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(255,60,60,0.15)",
          color: "#f88",
          fontSize: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span>{error}</span>
          <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "#f88", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      )}

      {loading ? (
        <p style={{ color: "#666", fontSize: 12, textAlign: "center", padding: 20 }}>{t("models.loading")}</p>
      ) : models.length === 0 ? (
        <p style={{ color: "#666", fontSize: 12, textAlign: "center", padding: 20 }}>
          {t("models.empty")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
          {models.map((m) => {
            const isActive = m.name === currentModelName;
            const isDeleting = deleting === m.name;
            return (
              <div
                key={m.name}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: isActive ? "rgba(100, 180, 255, 0.18)" : "rgba(255,255,255,0.06)",
                  border: isActive ? "1px solid rgba(100, 180, 255, 0.4)" : "1px solid rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                    {isActive && (
                      <span style={{
                        fontSize: 9,
                        background: "rgba(100, 200, 100, 0.3)",
                        color: "#8f8",
                        padding: "1px 6px",
                        borderRadius: 8,
                      }}>
                        {t("models.inUse")}
                      </span>
                    )}
                    {m.addedAt === "built-in" && (
                      <span style={{
                        fontSize: 9,
                        background: "rgba(255,255,255,0.1)",
                        color: "#aaa",
                        padding: "1px 6px",
                        borderRadius: 8,
                      }}>
                        {t("models.builtin")}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                    <span style={{ color: "#888", fontSize: 10 }}>{m.sizeMB.toFixed(1)} MB</span>
                    <span style={{ color: "#888", fontSize: 10 }}>{m.expressionCount} {t("models.expressions")}</span>
                    <span style={{ color: "#666", fontSize: 10 }}>{formatDate(m.addedAt)}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {!isActive && (
                    <button
                      onClick={() => handleSwitch(m)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "none",
                        background: "rgba(100, 180, 255, 0.2)",
                        color: "#8bd3ff",
                        cursor: "pointer",
                        fontSize: 11,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t("models.switch")}
                    </button>
                  )}
                  {m.addedAt !== "built-in" && (
                    <button
                      onClick={() => handleDelete(m)}
                      disabled={isDeleting}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "none",
                        background: "rgba(255,60,60,0.15)",
                        color: isDeleting ? "#666" : "#f88",
                        cursor: isDeleting ? "default" : "pointer",
                        fontSize: 11,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isDeleting ? "..." : "🗑"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ModelManager;
