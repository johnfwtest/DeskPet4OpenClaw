/**
 * ttsBuiltin.ts — browser SpeechSynthesis TTS implementation.
 *
 * Uses the Web Speech API to read text aloud. Supports rate control,
 * voice selection, and onBoundary callbacks for lip-sync.
 */

export interface TTSBuiltinConfig {
  rate: number;   // 0.5 - 2.0
  voice: string;  // voice name or "" for default
}

export type TTSState = "idle" | "speaking" | "paused";

export class TTSBuiltin {
  private _config: TTSBuiltinConfig = { rate: 1.0, voice: "" };
  private _state: TTSState = "idle";
  private _boundaryCallback?: (charIndex: number, length: number) => void;
  private _stateCallback?: (state: TTSState) => void;

  get state(): TTSState { return this._state; }

  setConfig(cfg: Partial<TTSBuiltinConfig>): void {
    if (cfg.rate !== undefined) this._config.rate = cfg.rate;
    if (cfg.voice !== undefined) this._config.voice = cfg.voice;
  }

  getConfig(): TTSBuiltinConfig { return { ...this._config }; }

  onBoundary(cb: (charIndex: number, length: number) => void): void {
    this._boundaryCallback = cb;
  }

  onStateChange(cb: (state: TTSState) => void): void {
    this._stateCallback = cb;
  }

  /** Get list of available voices */
  getVoices(): SpeechSynthesisVoice[] {
    return speechSynthesis.getVoices();
  }

  /** Speak the given text */
  speak(text: string): void {
    speechSynthesis.cancel();
    if (!text.trim()) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this._config.rate;

    // Select voice if configured
    if (this._config.voice) {
      const voices = speechSynthesis.getVoices();
      const match = voices.find(v => v.name === this._config.voice);
      if (match) utterance.voice = match;
    }

    utterance.onboundary = (e) => {
      this._boundaryCallback?.(e.charIndex, e.charLength || 1);
    };

    utterance.onstart = () => {
      this._state = "speaking";
      this._stateCallback?.("speaking");
    };

    utterance.onend = () => {
      this._state = "idle";
      this._stateCallback?.("idle");
    };

    utterance.onpause = () => {
      this._state = "paused";
      this._stateCallback?.("paused");
    };

    utterance.onresume = () => {
      this._state = "speaking";
      this._stateCallback?.("speaking");
    };

    speechSynthesis.speak(utterance);
  }

  /** Pause current speech */
  pause(): void {
    speechSynthesis.pause();
  }

  /** Resume paused speech */
  resume(): void {
    speechSynthesis.resume();
  }

  /** Cancel current speech */
  stop(): void {
    speechSynthesis.cancel();
    this._state = "idle";
    this._stateCallback?.("idle");
  }
}

/** Singleton */
export const ttsBuiltin = new TTSBuiltin();
