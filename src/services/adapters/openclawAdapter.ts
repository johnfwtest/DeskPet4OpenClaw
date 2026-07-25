/**
 * OpenClawAdapter — implements IAgentAdapter for OpenClaw Gateway.
 *
 * Thin wrapper around GatewayClient that normalises return types
 * to the common IAgentAdapter interface defined in types/backend.ts.
 */

import { GatewayClient } from "@/services/gatewayClient";
import type { IAgentAdapter, AgentAdapterCallbacks, AgentMessage, AgentSession, AgentModel } from "@/types/backend";

export class OpenClawAdapter implements IAgentAdapter {
  private client: GatewayClient;

  constructor(
    wsUrl: string,
    token: string,
    password: string,
    callbacks: AgentAdapterCallbacks,
  ) {
    this.client = new GatewayClient(
      { wsUrl, token, password },
      {
        onHelloOk: callbacks.onHelloOk,
        onDelta: callbacks.onDelta,
        onFinal: callbacks.onFinal,
        onError: callbacks.onError,
        onStateChange: callbacks.onStateChange,
        onEvent: callbacks.onEvent,
        onFileSent: callbacks.onFileSent,
      },
    );
  }

  get sessionKey(): string { return this.client.sessionKey; }

  connect(): void { this.client.connect(); }
  disconnect(): void { this.client.disconnect(); }
  getState(): string { return this.client.state || "disconnected"; }

  async sendChat(message: string, sessionKey?: string, attachments?: { type: string; mimeType: string; fileName: string; content: string }[]): Promise<string> {
    return this.client.sendChat(message, sessionKey, attachments);
  }

  async sendFile(filename: string, mimeType: string, base64Data: string, sessionKey?: string): Promise<string> {
    return this.client.sendFile(filename, mimeType, base64Data, sessionKey);
  }

  async cancelChat(runId: string): Promise<void> {
    return this.client.abortChat(runId);
  }

  async listSessions(opts?: { limit?: number }): Promise<AgentSession[]> {
    const raw = await this.client.listSessions(opts);
    return raw.map(s => ({ key: s.key || "", label: s.label, lastMessage: s.lastMessage }));
  }

  async createSession(label?: string): Promise<{ key: string }> {
    return this.client.createSession(label);
  }

  async deleteSession(key: string): Promise<void> {
    return this.client.deleteSession(key);
  }

  async getHistory(sessionKey?: string, limit?: number): Promise<AgentMessage[]> {
    const raw = await this.client.getHistory(sessionKey, limit);
    return raw.map(m => ({ id: m.id, role: m.role as "user" | "agent", text: m.text }));
  }

  switchSession(key: string): void {
    this.client.switchSession(key);
  }

  async listModels(): Promise<AgentModel[]> {
    const raw = await this.client.listModels();
    return raw.map((m) => ({ id: m.id || m.model || m.name || "", name: m.name || m.id || m.model || "" }));
  }

  async setModel(modelId: string): Promise<void> {
    return this.client.setModel(modelId);
  }
}
