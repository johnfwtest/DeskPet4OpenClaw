/**
 * EyeTracking — maps mouse position to Live2D eye/head parameters.
 *
 * The pet's eyes track the cursor position in real time.
 * Head follows with slight lag for a natural look.
 */

export interface EyeTrackingConfig {
  /** Element to listen for mouse events (usually the pet window) */
  element: HTMLElement;
  /** Callback: set Live2D parameters */
  onUpdate: (eyeX: number, eyeY: number, headX: number, headY: number) => void;
  /** How strongly the eyes move (0–1) */
  eyeStrength?: number;
  /** How strongly the head moves (0–1) */
  headStrength?: number;
}

export class EyeTracking {
  private config: EyeTrackingConfig;
  private eyeX = 0;
  private eyeY = 0;
  private headX = 0;
  private headY = 0;
  private targetEyeX = 0;
  private targetEyeY = 0;
  private targetHeadX = 0;
  private targetHeadY = 0;
  private animFrameId: number | null = null;
  private boundMouseMove: (e: MouseEvent) => void;

  constructor(config: EyeTrackingConfig) {
    this.config = config;
    this.boundMouseMove = this.onMouseMove.bind(this);
  }

  start(): void {
    this.config.element.addEventListener("mousemove", this.boundMouseMove);
    this.animate();
  }

  stop(): void {
    this.config.element.removeEventListener("mousemove", this.boundMouseMove);
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.config.element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // Normalize to -1..1
    this.targetEyeX = ((e.clientX - cx) / (rect.width / 2)) * 0.5;
    this.targetEyeY = ((e.clientY - cy) / (rect.height / 2)) * 0.3;
    this.targetHeadX = ((e.clientX - cx) / (rect.width / 2)) * 0.15;
    this.targetHeadY = ((e.clientY - cy) / (rect.height / 2)) * 0.08;
  }

  private animate = (): void => {
    const eyeStrength = this.config.eyeStrength ?? 1;
    const headStrength = this.config.headStrength ?? 1;
    const lerpFactor = 0.08;

    // Smooth interpolation
    this.eyeX += (this.targetEyeX - this.eyeX) * lerpFactor;
    this.eyeY += (this.targetEyeY - this.eyeY) * lerpFactor;
    this.headX += (this.targetHeadX - this.headX) * lerpFactor;
    this.headY += (this.targetHeadY - this.headY) * lerpFactor;

    this.config.onUpdate(
      this.eyeX * eyeStrength,
      this.eyeY * eyeStrength,
      this.headX * headStrength,
      this.headY * headStrength
    );

    this.animFrameId = requestAnimationFrame(this.animate);
  };
}
