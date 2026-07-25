/**
 * ExpressionManager — maps conversation context to Live2D expressions.
 *
 * Expression IDs are 0-based indices into the loaded model's expression
 * definitions, matching pixi-live2d-display's ExpressionManager.setExpression
 * (valid range: 0 <= index < definitions.length). -1 = neutral/default.
 *
 * The emotion→index map is built dynamically from the loaded model's
 * expressions in usePetEngine (see matchExpression); this class just tracks
 * the current selection and forwards changes to the stage.
 */

export interface ExpressionConfig {
  onExpressionChange: (expressionId: number) => void;
  /** Called when the expression is reset to neutral/default. */
  onReset?: () => void;
}

export class ExpressionManager {
  private config: ExpressionConfig;
  private currentExpression = -1; // -1 = neutral/default

  constructor(config: ExpressionConfig) {
    this.config = config;
  }

  /** Set expression by 0-based index. */
  setById(id: number): void {
    if (id < 0 || id === this.currentExpression) return;
    this.currentExpression = id;
    this.config.onExpressionChange(id);
  }

  /** Reset to neutral/default expression. */
  reset(): void {
    this.currentExpression = -1;
    this.config.onReset?.();
  }

  get current(): number {
    return this.currentExpression;
  }
}
