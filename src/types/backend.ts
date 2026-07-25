/**
 * backend.ts — Agent backend type definitions.
 *
 * DeskPet4OpenClaw supports multiple agent backends via the IAgentAdapter interface.
 * This module defines the common interfaces so the rest of the app
 * never needs to know which concrete backend is in use.
 */

// ── Backend metadata ─────────────────────────────────────────────

/** Known agent backend types */
export type AgentBackendType = "openclaw";

/** Human-readable metadata for each backend type */
export const AGENT_BACKEND_META: Record<AgentBackendType, {
  label: string;
  description: string;
  defaultUrl: string;
  /** Set to true to hide from the UI selector */
  hidden?: boolean;
  /** Extra config fields beyond url/token/password */
  extraFields?: { key: string; label: string; placeholder: string; type: "text" | "password" }[];
}> = {
  openclaw: {
    label: "OpenClaw",
    description: "OpenClaw Gateway — multi-channel agent gateway",
    defaultUrl: "ws://127.0.0.1:18789",
  },
};

// ── Configuration ─────────────────────────────────────────────────

/** Persisted configuration for one backend connection */
export interface AgentBackendConfig {
  id: string;                  // unique id, e.g. "openclaw-main"
  name: string;                // display name
  type: AgentBackendType;      // which backend
  url: string;                 // WebSocket URL
  token?: string;              // auth token
  password?: string;           // optional password
  enabled: boolean;            // auto-connect on startup
  systemPrompt?: string;       // custom system prompt
  /** Extra backend-specific fields */
  extra?: Record<string, string>;
}

// ── Adapter interface ─────────────────────────────────────────────

/** A chat message returned by any backend */
export interface AgentMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp?: number;
}

/** Chat message used in the UI (App.tsx, MessageList) */
export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: number;
  images?: string[];
  expression?: number;
}

/** A session descriptor returned by any backend */
export interface AgentSession {
  key: string;
  label?: string;
  lastMessage?: string;
}

/** An AI model descriptor */
export interface AgentModel {
  id: string;
  name: string;
}

/** Callbacks that any adapter must invoke */
export interface AgentAdapterCallbacks {
  onHelloOk?: (hello: { sessionKey: string }) => void;
  onDelta?: (runId: string, text: string, replace: boolean) => void;
  onFinal?: (runId: string, text: string) => void;
  onError?: (runId: string, message: string) => void;
  onStateChange?: (state: string) => void;
  onEvent?: (event: string, payload: unknown) => void;
  onFileSent?: (runId: string, filename: string) => void;
}

/**
 * Common interface that every agent backend adapter must implement.
 *
 * The rest of the app (App.tsx, ChatPanel) talks to this interface
 * and never imports a concrete adapter directly.
 */
export interface IAgentAdapter {
  readonly sessionKey: string;

  /** Open a WebSocket connection to the backend */
  connect(): void;

  /** Close the connection and stop reconnecting */
  disconnect(): void;

  /** Get the current connection state */
  getState(): string;

  // ── Chat ──────────────────────────────────────────────────

  /** Send a chat message. Returns a runId for tracking. */
  sendChat(
    message: string,
    sessionKey?: string,
    attachments?: { type: string; mimeType: string; fileName: string; content: string }[]
  ): Promise<string>;

  /** Send a file attachment as a standalone message */
  sendFile(filename: string, mimeType: string, base64Data: string, sessionKey?: string): Promise<string>;

  /** Cancel an in-progress chat run. Server-side abort with client-side cleanup fallback. */
  cancelChat(runId: string): Promise<void>;

  // ── Sessions ──────────────────────────────────────────────

  listSessions(opts?: { limit?: number }): Promise<AgentSession[]>;
  createSession(label?: string): Promise<{ key: string }>;
  deleteSession(key: string): Promise<void>;
  getHistory(sessionKey?: string, limit?: number): Promise<AgentMessage[]>;
  switchSession(key: string): void;

  // ── Models ────────────────────────────────────────────────

  listModels(): Promise<AgentModel[]>;
  setModel(modelId: string): Promise<void>;
}
