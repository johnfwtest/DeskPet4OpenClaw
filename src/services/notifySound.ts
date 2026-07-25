// E5 (659Hz) sine-wave notification ding — see FREQ/GAIN/DURATION below.

import { ttsPlayer } from "@/services/ttsPlayer";

let ctx: AudioContext | null = null;
let lastPlayTime = 0;
const MIN_INTERVAL_MS = 800;
const playedRuns = new Set<string>();

const FREQ = 659;        // Hz — E5, 柔和悦耳
const GAIN = 0.18;      // 0–1
const DURATION = 0.06;  // 秒

function ensureCtx(): AudioContext | null {
  if (!ctx || ctx.state === "closed") {
    try { ctx = new AudioContext(); } catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function playDingOnce(runId: string): void {
  if (!ttsPlayer.enabled) return;
  if (playedRuns.has(runId)) return;
  playedRuns.add(runId);

  const now = Date.now();
  if (now - lastPlayTime < MIN_INTERVAL_MS) return;
  lastPlayTime = now;

  const c = ensureCtx();
  if (!c) return;

  if (playedRuns.size > 200) {
    const arr = [...playedRuns];
    playedRuns.clear();
    for (let i = arr.length - 50; i < arr.length; i++) playedRuns.add(arr[i]);
    playedRuns.add(runId);
  }

  try {
    const t = c.currentTime;
    const g = c.createGain();
    g.connect(c.destination);
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(FREQ, t);
    o.connect(g);
    g.gain.setValueAtTime(GAIN, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + DURATION * 2);
    o.start(t);
    o.stop(t + DURATION);
  } catch { /* ignored */ }
}
