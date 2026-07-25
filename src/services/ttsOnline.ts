/**
 * ttsOnline.ts — Online TTS with preset profiles (OpenAI / Qwen).
 *
 * Two protocol formats are supported:
 *   – DashScope:  nested body { input: { text, voice } }, JSON response with audio.url
 *   – OpenAI:     flat body { model, input, voice, response_format }, binary audio response
 *
 * Detection: URL contains "dashscope" → DashScope. Everything else → OpenAI.
 */

export interface TTSOnlineConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  speed: number;
}

export interface TTSVendorProfile {
  label: string;
  apiUrl: string;
  model: string;
  voice: string;
  modelOptions: string[];   // all known model IDs for this vendor
  voiceOptions: string[];   // all known voice names for this vendor
}

// Pre-compiled from official docs (no programmatic API exists for listing TTS models/voices).
// Qwen voice list: https://www.alibabacloud.com/help/en/model-studio/qwen-tts-voice-list
export const TTS_VENDORS: TTSVendorProfile[] = [
  {
    label: "OpenAI",
    apiUrl: "https://api.openai.com/v1/audio/speech",
    model: "tts-1",
    voice: "alloy",
    modelOptions: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    voiceOptions: ["alloy", "echo", "fable", "onyx", "nova", "shimmer", "ash", "coral", "sage"],
  },
  {
    label: "Qwen TTS",
    apiUrl: "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    model: "qwen3-tts-flash",
    voice: "Cherry",
    modelOptions: [
      "qwen3-tts-flash", "qwen3-tts-flash-realtime",
      "qwen3-tts-instruct-flash", "qwen3-tts-instruct-flash-realtime",
      "qwen3-tts-vc-realtime-2026-01-15", "qwen3-tts-vd-realtime-2026-01-15",
      "cosyvoice-v3-plus", "cosyvoice-v3-flash",
    ],
    voiceOptions: [
      "Cherry", "EmilyV3.7", "Jade", "Kris", "Lydia", "Mia", "Phoebe", "Riley",
      "Stella", "Vivian", "William", "Olivia", "Ethan", "Aria", "Amelia",
      "Zhiyu", "Zhiyan", "Zhiwei", "Zhixiang", "Zhitong",
      "longanhuan_v3", "longanzhuo_v3", "longanchen_v3", "longanqi_v3", "longanyu_v3",
      "dongfanghu_v3", "dongfangyu_v3", "dongfangxin_v3",
    ],
  },
];

export class TTSOnline {
  private _config: TTSOnlineConfig = {
    apiUrl: "https://api.openai.com/v1/audio/speech",
    apiKey: "",
    model: "tts-1",
    voice: "alloy",
    speed: 1.0,
  };
  private _audio: HTMLAudioElement | null = null;

  setConfig(cfg: Partial<TTSOnlineConfig>): void {
    if (cfg.apiUrl !== undefined) this._config.apiUrl = cfg.apiUrl;
    if (cfg.apiKey !== undefined) this._config.apiKey = cfg.apiKey;
    if (cfg.model !== undefined) this._config.model = cfg.model;
    if (cfg.voice !== undefined) this._config.voice = cfg.voice;
    if (cfg.speed !== undefined) this._config.speed = cfg.speed;
  }

  getConfig(): TTSOnlineConfig {
    return { ...this._config };
  }

  private isDashScope(): boolean {
    const u = this._config.apiUrl.toLowerCase();
    return u.includes("dashscope.aliyuncs.com") || u.includes("dashscope-intl.aliyuncs.com");
  }

  // ── speak ────────────────────────────────────────────────────

  async speak(text: string): Promise<void> {
    if (!text.trim() || !this._config.apiUrl || !this._config.apiKey) return;
    this.stop();

    const isDev = typeof window !== "undefined" && window.location.hostname === "localhost";

    if (this.isDashScope()) {
      await this._speakDashScope(text, isDev ? "/api/tts" : null);
    } else {
      await this._speakOpenAI(text, isDev ? "/api/tts" : null);
    }
  }

  private async _speakOpenAI(text: string, proxyUrl: string | null): Promise<void> {
    const resp = await fetch(proxyUrl ?? this._config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._config.apiKey}`,
      },
      body: JSON.stringify({
        model: this._config.model,
        input: text,
        voice: this._config.voice,
        ...(this._config.speed !== 1.0 ? { speed: this._config.speed } : {}),
        response_format: "mp3",
      }),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`TTS API error ${resp.status}: ${err.slice(0, 200)}`);
    }
    this._playBlob(await resp.blob());
  }

  private async _speakDashScope(text: string, proxyUrl: string | null): Promise<void> {
    let ep = (proxyUrl ?? this._config.apiUrl).replace(/\/+$/, "");
    if (!proxyUrl && !ep.endsWith("/services/aigc/multimodal-generation/generation")) {
      ep += "/services/aigc/multimodal-generation/generation";
    }
    const resp = await fetch(ep, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._config.apiKey}`,
      },
      body: JSON.stringify({
        model: this._config.model,
        input: { text, voice: this._config.voice },
      }),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`DashScope TTS error ${resp.status}: ${err.slice(0, 200)}`);
    }
    const result = await resp.json();
    const audioUrl: string | undefined = result?.output?.audio?.url;
    if (!audioUrl) {
      throw new Error(`DashScope TTS error [${result?.code || "unknown"}]: ${result?.message || "no audio URL"}`);
    }
    const audioResp = await fetch(audioUrl);
    if (!audioResp.ok) throw new Error(`DashScope audio download error ${audioResp.status}`);
    this._playBlob(await audioResp.blob());
  }

  private _playBlob(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    this._audio = new Audio(url);
    this._audio.play();
  }

  stop(): void {
    if (this._audio) {
      this._audio.pause();
      this._audio = null;
    }
  }
}

export const ttsOnline = new TTSOnline();
