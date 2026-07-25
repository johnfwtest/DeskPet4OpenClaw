interface HelloOkPayload {
  sessionKey: string;
  agentId: string;
  protocol: number;
  serverVersion: string;
}

/** RPC frame types */
interface GatewayReq {
  type: "req";
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface GatewayRes {
  type: "res";
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: { message?: string };
}

interface GatewayEvent {
  type: "event";
  event: string;
  payload?: Record<string, unknown>;
}

type GatewayFrame = GatewayReq | GatewayRes | GatewayEvent;

/** Chat send params */
interface ChatSendParams {
  sessionKey: string;
  message: string;
  idempotencyKey: string;
  deliver: boolean;
  attachments?: { type: string; mimeType: string; fileName: string; content: string }[];
}

/** A pending RPC promise */
type PendingResult = Record<string, unknown> | undefined;

function asError(payload: PendingResult): string {
  return ((payload as unknown as { error?: { message?: string } })?.error?.message) || "request failed";
}

type PendingResolver = (ok: boolean, payload: PendingResult) => void;

/** Raw history message from Gateway */
interface RawHistoryMessage {
  id?: string;
  messageId?: string;
  role?: string;
  text?: string;
  content?: string | { text?: string }[];
}

/** Raw session from Gateway */
interface RawSession {
  key?: string;
  label?: string;
  lastMessage?: string;
}

/** Raw model from Gateway */
interface RawModel {
  id?: string;
  model?: string;
  name?: string;
}

export interface GatewayConfig {
  wsUrl: string;
  token?: string;
  password?: string;
}

export interface GatewayMessageHandler {
  onHelloOk?: (hello: HelloOkPayload) => void;
  onDelta?: (runId: string, text: string, replace: boolean) => void;
  onFinal?: (runId: string, text: string) => void;
  onError?: (runId: string, message: string) => void;
  onStateChange?: (state: string) => void;
  onEvent?: (event: string, payload: Record<string, unknown>) => void;
  onFileSent?: (runId: string, filename: string) => void;
}

export interface HistoryMessage {
  id: string;
  role: string;
  text: string;
  images?: string[];
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private cfg: GatewayConfig;
  private handler: GatewayMessageHandler;
  private nextId = 0;
  private pending = new Map<string, PendingResolver>();
  private _state = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private _hello: HelloOkPayload | null = null;
  private lastAgentText = "";
  private deltaBuffers = new Map<string, string>();

  constructor(cfg: GatewayConfig, handler: GatewayMessageHandler) {
    this.cfg = cfg;
    this.handler = handler;
  }

  get sessionKey(): string { return this._hello?.sessionKey || "agent:main:main"; }

  get state(): string { return this._state; }

  connect(): void {
    const wsUrl = this.cfg.wsUrl;
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    this.setState("connecting");

    try {
      let url = wsUrl;
      if (!url.endsWith("/chat")) {
        url = url.replace(/\/$/, "") + "/chat";
      }
      this.ws = new WebSocket(url);

      let openFired = false;
      this.ws.onopen = () => {
        openFired = true;
      };

      this.ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data as string) as GatewayFrame;
          this.handleFrame(frame);
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onclose = (event) => {
        this.setState("disconnected");
        const reason = event.reason || (event.code === 1006 ? "Connection lost" : `Closed (code ${event.code})`);
        this.handler.onError?.("connection", reason);
        if (this.reconnectAttempts < 99) {
          if (!openFired) {
            this.scheduleReconnect(300);
          } else {
            this.scheduleReconnect();
          }
        }
      };

      this.ws.onerror = () => {
        this.handler.onError?.("connection", "WebSocket connection error");
      };
    } catch (err) {
      console.error("Gateway WS failed:", (err as Error)?.message);
      this.scheduleReconnect(300);
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.reconnectAttempts = 99;
    this.ws?.close();
    this.ws = null;
    this.setState("disconnected");
  }

  async createSession(label?: string): Promise<{ key: string; sessionId?: string }> {
    const agentId = this._hello?.agentId || "main";
    const id = this.nextId++;
    const idStr = `cs${id}`;

    const frame = {
      type: "req" as const, id: idStr, method: "sessions.create",
      params: { agentId, label: label || undefined },
    };

    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      this.ws.send(JSON.stringify(frame));
      const timeout = setTimeout(() => reject(new Error("sessions.create timeout")), 15000);
      this.pending.set(idStr, (ok, payload) => {
        clearTimeout(timeout);
        if (ok) resolve(payload as unknown as { key: string; sessionId?: string });
        else reject(new Error(asError(payload)));
      });
    });
  }

  async listSessions(opts?: { limit?: number; includeLastMessage?: boolean }): Promise<RawSession[]> {
    const id = this.nextId++;
    const idStr = `ls${id}`;

    const frame = {
      type: "req" as const, id: idStr, method: "sessions.list",
      params: {
        limit: opts?.limit ?? 50,
        includeLastMessage: opts?.includeLastMessage ?? true,
        includeDerivedTitles: true,
        configuredAgentsOnly: true,
      },
    };

    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      this.ws.send(JSON.stringify(frame));
      const timeout = setTimeout(() => reject(new Error("sessions.list timeout")), 15000);
      this.pending.set(idStr, (ok, payload) => {
        clearTimeout(timeout);
        if (ok) resolve((payload as { sessions?: RawSession[] })?.sessions || []);
        else reject(new Error(asError(payload)));
      });
    });
  }

  async deleteSession(sessionKey: string): Promise<void> {
    const id = this.nextId++;
    const idStr = `ds${id}`;

    const frame = {
      type: "req" as const, id: idStr, method: "sessions.delete",
      params: { key: sessionKey },
    };

    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      this.ws.send(JSON.stringify(frame));
      const timeout = setTimeout(() => reject(new Error("sessions.delete timeout")), 15000);
      this.pending.set(idStr, (ok, payload) => {
        clearTimeout(timeout);
        if (ok) resolve();
        else reject(new Error(asError(payload)));
      });
    });
  }

  async getHistory(sessionKey?: string, limit: number = 50): Promise<HistoryMessage[]> {
    const sk = sessionKey || this._hello?.sessionKey
      || (typeof localStorage !== "undefined" ? localStorage.getItem("desk-pet-sessionKey") : null)
      || "agent:main:main";
    const id = this.nextId++;
    const idStr = `gh${id}`;

    const frame = {
      type: "req" as const, id: idStr, method: "chat.history",
      params: { sessionKey: sk, limit, maxChars: 100000 },
    };

    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      this.ws.send(JSON.stringify(frame));
      const timeout = setTimeout(() => reject(new Error("chat.history timeout")), 15000);
      this.pending.set(idStr, (ok, payload) => {
        clearTimeout(timeout);
        if (ok) {
          const messages: RawHistoryMessage[] = (payload as { messages?: RawHistoryMessage[] })?.messages || [];
          resolve(messages.map((m) => {
            let text = "";
            if (typeof m.content === "string") {
              text = m.content;
            } else if (Array.isArray(m.content)) {
              text = m.content.map((b) => b.text || "").join("");
            } else {
              text = m.text || "";
            }
            return {
              id: m.id || m.messageId || `h-${Math.random().toString(36).slice(2)}`,
              role: m.role || "unknown",
              text,
            };
          }));
        } else {
          reject(new Error(asError(payload)));
        }
      });
    });
  }

  switchSession(sessionKey: string): void {
    this._hello = {
      sessionKey,
      agentId: this._hello?.agentId || "main",
      protocol: this._hello?.protocol || 4,
      serverVersion: this._hello?.serverVersion || "?",
    };
    try { localStorage.setItem("desk-pet-sessionKey", sessionKey); } catch { /* noop */ }
  }

  async listModels(): Promise<RawModel[]> {
    const id = this.nextId++;
    const idStr = `lm${id}`;
    const frame = {
      type: "req" as const, id: idStr, method: "models.list",
      params: { view: "configured" },
    };
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      this.ws.send(JSON.stringify(frame));
      const timeout = setTimeout(() => reject(new Error("models.list timeout")), 15000);
      this.pending.set(idStr, (ok, payload) => {
        clearTimeout(timeout);
        if (ok) resolve((payload as { models?: RawModel[] })?.models || []);
        else reject(new Error(asError(payload)));
      });
    });
  }

  async setModel(modelId: string): Promise<void> {
    const sk = this._hello?.sessionKey || "agent:main:main";
    const id = this.nextId++;
    const idStr = `sm${id}`;
    const frame = {
      type: "req" as const, id: idStr, method: "sessions.patch",
      params: { key: sk, model: modelId },
    };
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      this.ws.send(JSON.stringify(frame));
      const timeout = setTimeout(() => reject(new Error("sessions.patch timeout")), 15000);
      this.pending.set(idStr, (ok, payload) => {
        clearTimeout(timeout);
        if (ok) resolve();
        else reject(new Error(asError(payload)));
      });
    });
  }

  async sendFile(filename: string, mimeType: string, base64Data: string, sessionKey?: string): Promise<string> {
    const sk = sessionKey || this._hello?.sessionKey
      || (typeof localStorage !== "undefined" ? localStorage.getItem("desk-pet-sessionKey") : null)
      || "agent:main:main";
    const id = this.nextId++;
    const idempotencyKey = crypto.randomUUID();
    const idStr = `mf${id}`;

    const frame = {
      type: "req" as const, id: idStr, method: "chat.send",
      params: {
        sessionKey: sk,
        message: `📎 ${filename}`,
        idempotencyKey,
        attachments: [{ filename, contentType: mimeType, buffer: base64Data }],
      },
    };

    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      this.ws.send(JSON.stringify(frame));
      const timeout = setTimeout(() => reject(new Error("chat.send timeout")), 30000);
      this.pending.set(idStr, (ok, payload) => {
        clearTimeout(timeout);
        if (ok) resolve((payload as { runId?: string })?.runId || "");
        else reject(new Error(asError(payload)));
      });
    });
  }

  async sendChat(
    message: string,
    sessionKey?: string,
    attachments?: { type: string; mimeType: string; fileName: string; content: string }[],
  ): Promise<string> {
    const sk = sessionKey || this._hello?.sessionKey
      || (typeof localStorage !== "undefined" ? localStorage.getItem("desk-pet-sessionKey") : null)
      || "agent:main:main";
    const id = this.nextId++;
    const idempotencyKey = crypto.randomUUID();
    const idStr = `m${id}`;

    const params: ChatSendParams = {
      sessionKey: sk,
      message,
      idempotencyKey,
      deliver: false,
    };
    if (attachments && attachments.length > 0) {
      params.attachments = attachments;
    }

    const frame = {
      type: "req" as const, id: idStr, method: "chat.send",
      params,
    };

    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      this.ws.send(JSON.stringify(frame));
      const timeout = setTimeout(() => reject(new Error("chat.send timeout")), 30000);
      this.pending.set(idStr, (ok, payload) => {
        clearTimeout(timeout);
        if (ok) resolve((payload as { runId?: string })?.runId || "");
        else reject(new Error(asError(payload)));
      });
    });
  }

  async abortChat(runId: string, sessionKey?: string): Promise<void> {
    const sk = sessionKey || this._hello?.sessionKey
      || (typeof localStorage !== "undefined" ? localStorage.getItem("desk-pet-sessionKey") : null)
      || "agent:main:main";
    const id = this.nextId++;
    const idStr = `a${id}`;

    const frame = {
      type: "req" as const, id: idStr, method: "chat.abort",
      params: { sessionKey: sk, runId },
    };

    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      this.ws.send(JSON.stringify(frame));
      const timeout = setTimeout(() => reject(new Error("chat.abort timeout")), 10000);
      this.pending.set(idStr, (ok, payload) => {
        clearTimeout(timeout);
        if (ok) resolve();
        else reject(new Error(asError(payload)));
      });
    });
  }

  private handleFrame(frame: GatewayFrame): void {
    const tp = frame.type;

    if (tp === "res" && frame.id && this.pending.has(frame.id)) {
      const resolve = this.pending.get(frame.id)!;
      this.pending.delete(frame.id);
      resolve(frame.ok, frame.ok ? frame.payload : undefined);
      return;
    }

    if (tp === "event") {
      const eventName = frame.event;
      const payload: Record<string, unknown> = frame.payload || {};

      this.handler.onEvent?.(eventName, payload);

      if (eventName === "connect.challenge") {
        this.sendConnect();
        return;
      }

      if (eventName === "chat") {
        const state = payload.state as string | undefined;
        const runId = (payload.runId as string) || "";

        if (state === "delta") {
          const deltaText = (payload.deltaText as string) || "";
          if (deltaText) {
            const acc = this.deltaBuffers.get(runId) || "";
            this.deltaBuffers.set(runId, acc + deltaText);
            this.handler.onDelta?.(runId, deltaText, false);
          }
        } else if (state === "final") {
          let fullText = "";
          const content = (payload.message as { content?: { text?: string }[] })?.content || [];
          for (const block of content) {
            if (block.text) {
              fullText += block.text;
            }
          }
          if (!fullText) {
            fullText = (payload.deltaText as string) || this.deltaBuffers.get(runId) || "";
          }
          fullText = fullText.trim();
          this.deltaBuffers.delete(runId);
          if (fullText) {
            this.handler.onFinal?.(runId, fullText);
          } else {
            // fullText couldn't be reconstructed from payload.message.content;
            // fall back to the assistant stream text accumulated during the run.
            const fallback = this.lastAgentText || "";
            if (fallback) this.handler.onFinal?.(runId, fallback);
          }
          // Clear after the fallback has had a chance to use it.
          this.lastAgentText = "";
        } else if (state === "error" || state === "aborted") {
          this.deltaBuffers.delete(runId);
          this.handler.onError?.(runId, (payload.errorMessage as string) || (payload.stopReason as string) || state);
        }
        return;
      }

      if (eventName === "agent") {
        const stream = payload.stream as string | undefined;
        const data: Record<string, unknown> = (payload.data as Record<string, unknown>) || {};

        if (stream === "lifecycle" && data.phase === "end") {
          if (this.lastAgentText) {
            this.lastAgentText = "";
          }
        }
        if (stream === "assistant") {
          const text = (data.text as string) || (data.delta as string) || "";
          if (text) {
            this.lastAgentText = text;
            // Don't forward as delta — chat.delta already handles streaming.
            // agent.assistant sends full transcript, not incremental tokens.
          }
        }
        return;
      }

      return;
    }

    if (tp === "res" && frame.ok && (frame.payload as Record<string, unknown>)?.type === "hello-ok") {
      const h = frame.payload as Record<string, unknown>;
      const snapshot = h.snapshot as Record<string, unknown> | undefined;
      const sessionDefaults = snapshot?.sessionDefaults as Record<string, unknown> | undefined;
      const server = h.server as Record<string, unknown> | undefined;
      this._hello = {
        sessionKey: (sessionDefaults?.mainSessionKey as string) || "agent:main:main",
        agentId: (sessionDefaults?.defaultAgentId as string) || "main",
        protocol: h.protocol as number,
        serverVersion: (server?.version as string) || "?",
      };
      this.setState("connected");
      this.reconnectAttempts = 0;
      try { localStorage.setItem("desk-pet-sessionKey", this._hello.sessionKey); } catch { /* noop */ }
      this.handler.onHelloOk?.(this._hello);
      return;
    }

    // Handle connect request rejection (ok=false)
    if (tp === "res" && !frame.ok && frame.id && (frame.id as string).startsWith("c")) {
      const errMsg = (frame as GatewayRes).error?.message || "Gateway rejected connection";
      this.handler.onError?.("connection", errMsg);
      this.setState("disconnected");
      return;
    }
  }

  private sendConnect(): void {
    const id = this.nextId++;
    const idStr = `c${id}`;

    const connect = {
      type: "req" as const, id: idStr, method: "connect",
      params: {
        minProtocol: 4, maxProtocol: 4,
        client: {
          id: "openclaw-tui",
          version: "desk-pet-1.0.0",
          platform: (typeof navigator !== "undefined" ? navigator.platform?.toLowerCase() : "win32") || "unknown",
          mode: "cli",
        },
        scopes: ["operator.admin"],
        auth: { token: this.cfg.token || "" },
        password: this.cfg.password || undefined,
      },
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log("[GatewayClient] Sending connect as openclaw-tui/cli");
      this.ws.send(JSON.stringify(connect));
    }
  }

  private setState(s: string): void {
    this._state = s;
    this.handler.onStateChange?.(s);
  }

  private scheduleReconnect(minDelayMs?: number): void {
    if (this.reconnectAttempts >= 10) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.setState("reconnecting");
    const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    const delay = minDelayMs ? Math.min(baseDelay, minDelayMs) : baseDelay;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
  }
}
