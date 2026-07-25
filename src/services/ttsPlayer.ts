/**
 * ttsPlayer.ts — unified TTS interface.
 *
 * Delegates to ttsBuiltin (SpeechSynthesis) or ttsOnline (OpenAI API)
 * based on the current config. Exposes a simple speak()/stop() API.
 */

import { ttsBuiltin, type TTSBuiltinConfig, type TTSState } from "@/services/ttsBuiltin";
import { ttsOnline, type TTSOnlineConfig } from "@/services/ttsOnline";

export interface TTSConfig {
  provider: "builtin" | "online";
  enabled: boolean;
  builtin: TTSBuiltinConfig;
  online: TTSOnlineConfig;
}

const STORAGE_KEY = "seren-tts-config";

function defaultConfig(): TTSConfig {
  return {
    provider: "builtin",
    enabled: false,
    builtin: { rate: 1.0, voice: "" },
    online: {
      apiUrl: "https://api.openai.com/v1/audio/speech",
      apiKey: "",
      model: "tts-1",
      voice: "alloy",
      speed: 1.0,
    },
  };
}

export function loadTTSConfig(): TTSConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch {}
  return defaultConfig();
}

export function saveTTSConfig(cfg: TTSConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

class TTSPlayer {
  private _config: TTSConfig = loadTTSConfig();
  private _onStateChange?: (state: TTSState) => void;
  private _onBoundary?: (charIndex: number, length: number) => void;

  constructor() {
    ttsBuiltin.onBoundary((i, l) => this._onBoundary?.(i, l));
    ttsBuiltin.onStateChange((s) => this._onStateChange?.(s));
  }

  get config(): TTSConfig { return this._config; }
  get enabled(): boolean { return this._config.enabled; }

  setConfig(partial: Partial<TTSConfig>): void {
    this._config = { ...this._config, ...partial };
    if (partial.builtin) this._config.builtin = { ...this._config.builtin, ...partial.builtin };
    if (partial.online) this._config.online = { ...this._config.online, ...partial.online };
    saveTTSConfig(this._config);
    ttsBuiltin.setConfig(this._config.builtin);
    ttsOnline.setConfig(this._config.online);
  }

  toggleEnabled(): boolean {
    this._config.enabled = !this._config.enabled;
    if (!this._config.enabled) ttsBuiltin.stop();
    saveTTSConfig(this._config);
    return this._config.enabled;
  }

  onStateChange(cb: (state: TTSState) => void): void { this._onStateChange = cb; }
  onBoundary(cb: (charIndex: number, length: number) => void): void { this._onBoundary = cb; }

  async speak(text: string): Promise<void> {
    if (!this._config.enabled) return;
    if (this._config.provider === "online") {
      await ttsOnline.speak(text);
    } else {
      ttsBuiltin.speak(text);
    }
  }

  stop(): void {
    ttsBuiltin.stop();
    ttsOnline.stop();
  }
}

/** Singleton */
export const ttsPlayer = new TTSPlayer();
