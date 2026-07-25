/**
 * ChatInput — message input area with file upload, paste support, and AI model selector.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useI18n } from "@/i18n";

interface PendingAttachment {
  file: File;
  dataUrl: string;
  base64: string;
}

interface ChatInputProps {
  currentModel?: string;
  onModelChange?: (modelId: string) => void;
  onSubmit: (text: string, attachments?: { type: string; mimeType: string; fileName: string; content: string }[]) => void;
  onCancel?: () => void;
  isStreaming?: boolean;
  replyTarget: { id: string; text: string; role: string } | null;
  onClearReply: () => void;
}

// Global singleton file input
let _globalFileInput: HTMLInputElement | null = null;
function getGlobalFileInput(): HTMLInputElement {
  if (!_globalFileInput) {
    _globalFileInput = document.createElement("input");
    _globalFileInput.type = "file";
    _globalFileInput.multiple = true;
    _globalFileInput.accept = "image/*,.pdf,.doc,.docx,.txt,.md,.json,.js,.ts,.py,.html,.css,.svg";
    _globalFileInput.style.display = "none";
    document.body.appendChild(_globalFileInput);
  }
  return _globalFileInput;
}

const ChatInput: React.FC<ChatInputProps> = ({ currentModel, onModelChange, onSubmit, onCancel, isStreaming, replyTarget, onClearReply }) => {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [aiModels, setAiModels] = useState<{ id: string; name: string }[]>([]);
  const { t } = useI18n();
  const [modelsLoading, setModelsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus when visible
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Fetch AI models from Gateway
  const fetchModels = useCallback(async () => {
    if (typeof window.__gw !== "undefined") {
      setModelsLoading(true);
      try {
        const gw = window.__gw as { listModels: () => Promise<{ id?: string; model?: string; name?: string }[]> };
        const list = await gw.listModels();
        const mapped = list.map((m) => ({
          id: m.id || m.model || m.name || "",
          name: m.name || m.id || m.model || "",
        })).filter((m) => Boolean(m.id));
        if (mapped.length > 0) setAiModels(mapped);
      } catch { /* keep defaults */ }
      finally { setModelsLoading(false); }
    }
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  // ── File selection ─────────────────────────────────────────

  useEffect(() => {
    const fileInput = getGlobalFileInput();
    const handler = () => {
      if (fileInput.files && fileInput.files.length > 0) {
        addFiles(fileInput.files);
        fileInput.value = "";
      }
    };
    fileInput.addEventListener("change", handler);
    return () => fileInput.removeEventListener("change", handler);
  }, []);

  const openFilePicker = useCallback(() => {
    const fileInput = getGlobalFileInput();
    fileInput.value = "";
    fileInput.click();
  }, []);

  const compressImage = (file: File, maxWidth: number = 1024, quality: number = 0.8): Promise<{ dataUrl: string; base64: string }> => {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL(file.type || "image/jpeg", quality);
          const base64 = dataUrl.split(",")[1];
          resolve({ dataUrl, base64 });
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("image/") && file.size > 500 * 1024) {
        compressImage(file).then(({ dataUrl, base64 }) => {
          setAttachments((prev) => [...prev, { file, dataUrl, base64 }]);
        });
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(",")[1];
          setAttachments((prev) => [...prev, { file, dataUrl, base64 }]);
        };
        reader.readAsDataURL(file);
      }
    }
  }, []);

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Paste handler ─────────────────────────────────────────

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) imageItems.push(items[i]);
    }
    if (imageItems.length > 0) {
      e.preventDefault();
      for (const item of imageItems) {
        const blob = item.getAsFile();
        if (blob) addFiles([blob]);
      }
    }
  };

  // ── Submit ─────────────────────────────────────────────────

  const buildMessageAndAttachments = () => {
    const parts: string[] = [];
    const attachList: { type: string; mimeType: string; fileName: string; content: string }[] = [];
    if (replyTarget) {
      parts.push(`> **${replyTarget.role === "user" ? "You" : "Agent"}** said: _${replyTarget.text.slice(0, 80)}_\n`);
    }
    for (const a of attachments) {
      if (a.file.type.startsWith("image/")) {
        attachList.push({ type: "image", mimeType: a.file.type, fileName: a.file.name || "image", content: a.base64 });
        parts.push(`📷 ${a.file.name}`);
      } else {
        attachList.push({ type: "file", mimeType: a.file.type || "application/octet-stream", fileName: a.file.name || "file", content: a.base64 });
        parts.push(`📎 ${a.file.name}`);
      }
    }
    if (input.trim()) parts.push(input.trim());
    return { text: parts.join("\n"), attachments: attachList };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStreaming) return;
    const hasText = input.trim().length > 0;
    const hasAttachments = attachments.length > 0;
    if (!hasText && !hasAttachments) return;
    try {
      const { text, attachments: attachList } = buildMessageAndAttachments();
      onSubmit(text, attachList.length > 0 ? attachList : undefined);
      setInput("");
      setAttachments([]);
      onClearReply();
    } catch {
      // onSubmit dispatches errors, just clean up local state
      setInput("");
      setAttachments([]);
    }
  };

  const hasSubmitContent = input.trim().length > 0 || attachments.length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      onPaste={handlePaste}
      style={{ display: "flex", flexDirection: "column", padding: "10px", borderTop: "1px solid rgba(255,255,255,0.1)" }}
    >
      {/* Model selector */}
      {onModelChange && currentModel && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
          <span style={{ color: "#888", fontSize: 10 }}>{t("input.model")}</span>
          <select
            value={currentModel}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={modelsLoading}
            style={{
              flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
              color: modelsLoading ? "#666" : "#ccc", fontSize: 10, padding: "2px 6px", borderRadius: 4, outline: "none",
            }}
          >
            {modelsLoading ? (
              <option value={currentModel}>{t("input.loading")}</option>
            ) : aiModels.length > 0 ? (
              aiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)
            ) : (
              <>
                <option value={currentModel}>{currentModel}</option>
                <option disabled style={{ color: "#666" }}>{t("input.loadMore")}</option>
              </>
            )}
          </select>
        </div>
      )}

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div style={{ padding: "6px 10px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {attachments.map((a, i) => (
            <div key={i} style={{ position: "relative", display: "inline-block" }}>
              {a.file.type.startsWith("image/") ? (
                <img src={a.dataUrl} alt={a.file.name} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)" }} />
              ) : (
                <div style={{ width: 60, height: 60, background: "rgba(255,255,255,0.08)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📄</div>
              )}
              <button
                onClick={() => removeAttachment(i)}
                style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", border: "none", background: "rgba(255,60,60,0.9)", color: "#fff", fontSize: 10, cursor: "pointer", lineHeight: "18px", textAlign: "center", padding: 0 }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Reply indicator */}
      {replyTarget && (
        <div style={{ padding: "6px 12px", background: "rgba(100,140,255,0.15)", borderBottom: "1px solid rgba(100,140,255,0.2)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#8bd3ff", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t("input.replyTo")}: {replyTarget.text.slice(0, 60)}
          </span>
          <button onClick={onClearReply} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 12 }}>✕</button>
        </div>
      )}

      {/* Input row */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          type="button"
          onClick={openFilePicker}
          title={t("input.upload")}
          style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "16px", padding: "4px 6px" }}
        >📎</button>

        <textarea
          ref={inputRef as React.Ref<HTMLTextAreaElement>}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !isStreaming) {
              e.preventDefault();
              const form = e.currentTarget.closest("form");
              if (form) form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
            }
          }}
          disabled={isStreaming}
          placeholder={isStreaming ? t("input.placeholderStreaming") : t("input.placeholder") + "  /clear to reset"}
          rows={2}
          style={{
            flex: 1, padding: "8px 12px", borderRadius: "12px",
            border: "none", background: "rgba(255,255,255,0.12)",
            color: "#fff", fontSize: "13px", outline: "none",
            resize: "vertical", fontFamily: "inherit", lineHeight: "1.4",
            minHeight: 36, maxHeight: 120,
          }}
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onCancel?.(); }}
            style={{
              marginLeft: "8px", padding: "8px 14px", borderRadius: "20px",
              border: "none",
              background: "rgba(255, 80, 80, 0.7)",
              color: "#fff", cursor: "pointer",
              fontSize: "14px", fontWeight: 600,
            }}
            title={t("input.stop")}
          >■</button>
        ) : (
          <button
            type="submit"
            disabled={!hasSubmitContent}
            style={{
              marginLeft: "8px", padding: "8px 14px", borderRadius: "20px",
              border: "none",
              background: hasSubmitContent ? "rgba(100, 140, 255, 0.7)" : "rgba(255,255,255,0.1)",
              color: "#fff", cursor: hasSubmitContent ? "pointer" : "default",
              fontSize: "13px", fontWeight: 600,
            }}
          >→</button>
        )}
      </div>
    </form>
  );
};

export default ChatInput;
