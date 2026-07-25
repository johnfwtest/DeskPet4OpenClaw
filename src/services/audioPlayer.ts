/**
 * Audio player for TTS audio playback with volume data for lip sync.
 *
 * Uses Web Audio API to play audio and extract real-time
 * volume levels for driving Live2D mouth parameters.
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private isPlaying = false;
  private onVolumeUpdate: ((volume: number) => void) | null = null;

  /** Volume callback: receives 0.0–1.0 each animation frame */
  setOnVolumeUpdate(cb: (volume: number) => void): void {
    this.onVolumeUpdate = cb;
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  /** Play audio from a URL and start lip-sync analysis */
  async playUrl(url: string): Promise<void> {
    this.stop();

    const ctx = this.ensureContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;

    this.source = ctx.createBufferSource();
    this.source.buffer = audioBuffer;
    this.source.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.isPlaying = true;
    this.source.start();
    this.source.onended = () => {
      this.isPlaying = false;
      this.onVolumeUpdate?.(0);
    };

    this.analyseLoop();
  }

  /** Play audio from base64 data */
  async playBase64(base64: string, format: string = "audio/wav"): Promise<void> {
    const byteString = atob(base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: format });
    const url = URL.createObjectURL(blob);
    try {
      await this.playUrl(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private analyseLoop = (): void => {
    if (!this.isPlaying || !this.analyser) {
      this.onVolumeUpdate?.(0);
      return;
    }

    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);

    // Average volume across frequency bins
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    // Normalize to 0.0–1.0 (typical voice range is well below 255)
    const normalized = Math.min(1, avg / 128);

    this.onVolumeUpdate?.(normalized);
    requestAnimationFrame(this.analyseLoop);
  };

  stop(): void {
    try {
      this.source?.stop();
    } catch {
      // Already stopped
    }
    this.source = null;
    this.analyser = null;
    this.isPlaying = false;
    this.onVolumeUpdate?.(0);
  }

  get playing(): boolean {
    return this.isPlaying;
  }
}
