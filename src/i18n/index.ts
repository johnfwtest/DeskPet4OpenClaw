/**
 * Simple i18n — no heavy library needed for 2 languages.
 * Uses React Context + localStorage persistence.
 */

import React, { createContext, useContext, useState, useCallback } from "react";

export type Lang = "zh" | "en";

const STORAGE_KEY = "seren-lang";

// ── Translation maps ─────────────────────────────────────────────

const zh: Record<string, string> = {
  // Settings tabs
  "settings.gateway": "Gateway 连接",
  "settings.prompt": "系统提示词",
  "settings.tts": "TTS 语音",
  "settings.models": "Live2D 模型管理",
  "settings.system": "系统",

  // Settings - Gateway
  "gateway.title": "Gateway 设置",
  "gateway.url": "WebSocket URL",
  "gateway.token": "Token",
  "gateway.tokenHint": "（可选）",
  "gateway.password": "密码",
  "gateway.passwordHint": "（可选）",
  "gateway.save": "保存并连接",
  "gateway.saved": "已保存",
  "gateway.cancel": "取消",

  // Settings - Prompt
  "prompt.title": "系统提示词",
  "prompt.hint": "输入自定义系统提示词...",
  "prompt.backend": "当前后端",
  "prompt.warn": "（保存前请先在 Gateway Tab 中选择并连接）",

  // Settings - TTS
  "tts.title": "TTS 语音设置",
  "tts.mode": "TTS 方式",
  "tts.builtin": "浏览器内置",
  "tts.online": "在线 API",
  "tts.speed": "语速",
  "tts.voice": "语音",
  "tts.default": "系统默认",
  "tts.apiUrl": "API URL",
  "tts.apiKey": "API Key",
  "tts.model": "Model",
  "tts.vendor": "TTS 服务商",
  "tts.save": "保存",

  // Settings - Models
  "models.title": "模型管理",
  "models.upload": "上传模型",
  "models.uploading": "上传中...",
  "models.hint": ".zip 格式 Live2D 模型包",
  "models.uploadError": "请选择 .zip 格式的 Live2D 模型文件",
  "models.errorGeneric": "上传失败",
  "models.deleteError": "删除失败",
  "models.loadError": "加载失败",
  "models.empty": "暂无模型，请上传 Live2D 模型 ZIP 包",
  "models.loading": "加载中...",
  "models.builtin": "内置",
  "models.inUse": "使用中",
  "models.switch": "切换",
  "models.expressions": "个表情",
  "models.builtinProtected": "内置模型不可删除",

  // Settings - System
  "system.title": "系统设置",
  "system.language": "语言",
  "system.langZh": "中文",
  "system.langEn": "English",

  // Chat
  "chat.title": "Chat",
  "chat.new": "+ 新",
  "chat.empty": "Say hello to your pet!",
  "chat.placeholder": "输入消息... (Enter 发送, Shift+Enter 换行)",
  "chat.placeholderStreaming": "AI 正在回复...",
  "chat.model": "模型",
  "chat.modelLoading": "加载中...",
  "chat.modelHint": "连接 Gateway 后加载更多...",
  "chat.readAloud": "朗读",
  "chat.quoteReply": "引用回复",
  "chat.upload": "上传图片或文件",
  "chat.stopStreaming": "停止生成",
  "chat.noSessions": "无历史会话",
  "chat.deleteSession": "删除会话",

  // Status
  "status.connected": "已连接",
  "status.connecting": "连接中...",
  "status.disconnected": "已断开",
  "status.reconnecting": "重连中...",

  // Messages
  "msg.newSession": "新会话已创建",
  "msg.connectFirst": "请先连接到 Gateway",
  "msg.connected": "已连接",
  "msg.sendFailed": "发送失败",
  "msg.modelSwitched": "模型已切换",
  "msg.loadDefaultModel": "加载失败，已切回默认模型",
  "msg.replyTo": "↩ 回复",
  "msg.pin": "固定对话框",
  "msg.unpin": "取消固定",
  "msg.moveMode": "拖动窗口到想要的位置，点击释放",

  // Model manager
  "model.unavailable": "模型管理器不可用",

  // Additional UI
  "gateway.name": "名称",
  "gateway.namePlaceholder": "例如: 公司服务器",
  "prompt.placeholder": "输入自定义系统提示词...",
  "prompt.currentBackend": "当前后端",
  "prompt.warnMsg": "（保存前请先在 Gateway Tab 中选择并连接）",
  "config.add": "添加配置",
  "config.edit": "编辑配置",
  "input.model": "模型:",
  "input.loading": "加载中...",
  "input.loadMore": "连接 Gateway 后加载更多...",
  "input.upload": "上传图片或文件",
  "input.stop": "停止生成",
  "input.recall": "撤回",
  "session.list": "会话列表",
  "session.noSessions": "无历史会话",
  "session.delete": "删除会话",
};

const en: Record<string, string> = {
  "settings.gateway": "Gateway",
  "settings.prompt": "System Prompt",
  "settings.tts": "TTS",
  "settings.models": "Models",
  "settings.system": "System",

  "gateway.title": "Gateway Settings",
  "gateway.url": "WebSocket URL",
  "gateway.token": "Token",
  "gateway.tokenHint": "(optional)",
  "gateway.password": "Password",
  "gateway.passwordHint": "(optional)",
  "gateway.save": "Save & Connect",
  "gateway.saved": "Saved",
  "gateway.cancel": "Cancel",

  "prompt.title": "System Prompt",
  "prompt.hint": "Enter custom system prompt...",
  "prompt.backend": "Current backend",
  "prompt.warn": "(select and connect in Gateway Tab before saving)",

  "tts.title": "TTS Settings",
  "tts.mode": "TTS Mode",
  "tts.builtin": "Browser Built-in",
  "tts.online": "Online API",
  "tts.speed": "Speed",
  "tts.voice": "Voice",
  "tts.default": "System default",
  "tts.apiUrl": "API URL",
  "tts.apiKey": "API Key",
  "tts.model": "Model",
  "tts.vendor": "TTS Vendor",
  "tts.save": "Save",

  "models.title": "Model Management",
  "models.upload": "Upload Model",
  "models.uploading": "Uploading...",
  "models.hint": "Live2D model ZIP package",
  "models.uploadError": "Please select .zip format Live2D model file",
  "models.errorGeneric": "Upload failed",
  "models.deleteError": "Delete failed",
  "models.loadError": "Load failed",
  "models.empty": "No models. Upload a Live2D model ZIP package.",
  "models.loading": "Loading...",
  "models.builtin": "Built-in",
  "models.inUse": "Active",
  "models.switch": "Switch",
  "models.expressions": "expressions",
  "models.builtinProtected": "Built-in model cannot be deleted",

  "system.title": "System Settings",
  "system.language": "Language",
  "system.langZh": "中文",
  "system.langEn": "English",

  "chat.title": "Chat",
  "chat.new": "+ New",
  "chat.empty": "Say hello to your pet!",
  "chat.placeholder": "Type a message... (Enter to send, Shift+Enter for new line)",
  "chat.placeholderStreaming": "AI is responding...",
  "chat.model": "Model:",
  "chat.modelLoading": "Loading...",
  "chat.modelHint": "Connect to Gateway to load more...",
  "chat.readAloud": "Read",
  "chat.quoteReply": "Reply",
  "chat.upload": "Upload image or file",
  "chat.stopStreaming": "Stop",
  "chat.noSessions": "No sessions",
  "chat.deleteSession": "Delete session",

  "status.connected": "Connected",
  "status.connecting": "Connecting...",
  "status.disconnected": "Disconnected",
  "status.reconnecting": "Reconnecting...",

  "msg.newSession": "New session created",
  "msg.connectFirst": "Please connect to Gateway first",
  "msg.connected": "Connected",
  "msg.sendFailed": "Send failed",
  "msg.modelSwitched": "Model switched",
  "msg.loadDefaultModel": "Load failed, reverted to default model",
  "msg.replyTo": "↩ Reply",
  "msg.pin": "Pin bubble",
  "msg.unpin": "Unpin bubble",
  "msg.moveMode": "Drag the window to desired position, click to release",

  "model.unavailable": "Model manager unavailable",

  "gateway.name": "Name",
  "gateway.namePlaceholder": "e.g. Company Server",
  "prompt.placeholder": "Enter custom system prompt...",
  "prompt.currentBackend": "Current backend",
  "prompt.warnMsg": "(select and connect in Gateway Tab before saving)",
  "config.add": "Add Config",
  "config.edit": "Edit Config",
  "input.model": "Model:",
  "input.loading": "Loading...",
  "input.loadMore": "Connect to Gateway to load more...",
  "input.upload": "Upload image or file",
  "input.stop": "Stop",
  "input.recall": "Recall",
  "session.list": "Session List",
  "session.noSessions": "No sessions",
  "session.delete": "Delete session",
};

const maps: Record<Lang, Record<string, string>> = { zh, en };

// ── Context ───────────────────────────────────────────────────────

interface I18nContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: "zh",
  setLang: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "zh") return stored;
    } catch {}
    return "zh";
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);

  const t = useCallback((key: string): string => {
    return maps[lang][key] || maps["zh"][key] || key;
  }, [lang]);

  return (
    React.createElement(I18nContext.Provider, { value: { lang, setLang, t } }, children)
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function getStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;
  } catch {}
  return "zh";
}
