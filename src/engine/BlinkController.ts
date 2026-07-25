/**
 * BlinkController — drives periodic blink animation.
 *
 * Simulates natural blinking with randomized intervals.
 * Occasionally plays a double-blink for expressiveness.
 *
 * All pending timers (next-blink scheduler + in-flight blink phases) are
 * tracked so stop() can fully cancel them — otherwise an in-flight blink's
 * open() callback would keep firing and rescheduling on a destroyed stage.
 */

export interface BlinkConfig {
  onBlink: (eyeOpen: number) => void;
  /** Minimum interval between blinks in ms */
  minInterval?: number;
  /** Maximum interval between blinks in ms */
  maxInterval?: number;
}

export class BlinkController {
  private config: BlinkConfig;
  private timer: ReturnType<typeof setTimeout> | null = null;     // next-blink scheduler
  private phaseTimer: ReturnType<typeof setTimeout> | null = null; // in-flight blink phase
  private isBlinking = false;

  constructor(config: BlinkConfig) {
    this.config = config;
  }

  start(): void {
    // Guard against double-start (e.g. StrictMode) scheduling duplicate blinks.
    if (this.timer === null && this.phaseTimer === null) {
      this.scheduleNext();
    }
  }

  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
    this.isBlinking = false;
  }

  private scheduleNext(): void {
    const min = this.config.minInterval ?? 2000;
    const max = this.config.maxInterval ?? 6000;
    const delay = min + Math.random() * (max - min);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.blink();
    }, delay);
  }

  private blink(): void {
    if (this.isBlinking) return;
    this.isBlinking = true;

    const blinkDuration = 80; // ms per phase
    const closeAmount = 0; // fully closed
    const openAmount = 1; // fully open

    // Double blink with 20% probability
    const doubleBlink = Math.random() < 0.2;

    const close = () => this.config.onBlink(closeAmount);
    const open = () => this.config.onBlink(openAmount);

    close();
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      open();
      this.isBlinking = false;
      if (doubleBlink) {
        // Quick second blink
        this.phaseTimer = setTimeout(() => {
          this.phaseTimer = null;
          close();
          this.phaseTimer = setTimeout(() => {
            this.phaseTimer = null;
            open();
            this.scheduleNext();
          }, blinkDuration);
        }, 120);
      } else {
        this.scheduleNext();
      }
    }, blinkDuration);
  }
}
