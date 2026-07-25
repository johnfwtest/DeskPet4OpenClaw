/**
 * Agent adapter factory — creates the appropriate IAgentAdapter for a given backend type.
 */

import type { IAgentAdapter, AgentBackendType, AgentAdapterCallbacks, AgentBackendConfig } from "@/types/backend";
import { OpenClawAdapter } from "@/services/adapters/openclawAdapter";

/** Create an adapter instance for the given backend config */
export function createAgentAdapter(
  config: AgentBackendConfig,
  callbacks: AgentAdapterCallbacks,
): IAgentAdapter {
  const { type, url, token, password } = config;

  switch (type) {
    case "openclaw":
      return new OpenClawAdapter(url, token || "", password || "", callbacks);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown backend type: ${_exhaustive}`);
    }
  }
}

// ── Config management ──────────────────────────────────────────

const STORAGE_KEY = "seren-backends";

/** Load all backend configs from localStorage, with migration from old format */
export function loadBackendConfigs(): AgentBackendConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }

    // Migrate from old single-backend format
    const oldSettings = localStorage.getItem("desk-pet-settings");
    if (oldSettings) {
      console.log("[adapters] migrating from old settings format");
      const old = JSON.parse(oldSettings);
      if (old.wsUrl || old.gatewayHost) {
        const wsUrl = old.wsUrl || `ws://${old.gatewayHost}:${old.gatewayPort || "18789"}`;
        console.log("[adapters] migrated old settings, wsUrl:", wsUrl);
        return [{
          id: "openclaw-default",
          name: "Default",
          type: "openclaw" as AgentBackendType,
          url: wsUrl,
          token: old.token || old.gatewayToken || "",
          password: old.password || "",
          enabled: true,
        }];
      }
    }
  } catch {}

  return [{
    id: "openclaw-default",
    name: "Default",
    type: "openclaw",
    url: "ws://127.0.0.1:18789",
    token: "",
    password: "",
    enabled: true,
  }];
}

/** Save backend configs to localStorage */
export function saveBackendConfigs(configs: AgentBackendConfig[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

/** Get the active/enabled backend config */
export function getActiveBackendConfig(): AgentBackendConfig | undefined {
  const configs = loadBackendConfigs();
  return configs.find(c => c.enabled) || configs[0];
}
