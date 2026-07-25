/**
 * PetEngine — integrates all Live2D engine modules into a single hook.
 *
 * Coordinates:
 *   - Live2DStage (rendering)
 *   - EyeTracking (mouse → parameters)
 *   - BlinkController (auto-blink)
 *   - ExpressionManager (emotion mapping)
 *   - AudioPlayer (TTS + lip sync)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Live2DStage } from "@/engine/Live2DModel";
import { EyeTracking } from "@/engine/EyeTracking";
import { BlinkController } from "@/engine/BlinkController";
import { ExpressionManager } from "@/engine/ExpressionManager";
import { AudioPlayer } from "@/services/audioPlayer";

export interface PetEngineState {
  isLoaded: boolean;
  currentExpression: number;
  isSpeaking: boolean;
}

export function usePetEngine(
  containerRef: React.RefObject<HTMLDivElement | null>,
  config: { modelPath: string; width: number; height: number; onModelLoaded?: (w: number, h: number) => void }
) {
  const stageRef = useRef<Live2DStage | null>(null);
  const eyeTrackingRef = useRef<EyeTracking | null>(null);
  const blinkRef = useRef<BlinkController | null>(null);
  const expressionRef = useRef<ExpressionManager | null>(null);
  const audioRef = useRef<AudioPlayer | null>(null);
  const containerRefCache = useRef(containerRef);
  containerRefCache.current = containerRef;

  const [state, setState] = useState<PetEngineState>({
    isLoaded: false,
    currentExpression: -1,
    isSpeaking: false,
  });

  // Reusable controller setup (used by both init and switchModel)
  const setupControllers = useCallback((stage: Live2DStage, container: HTMLElement) => {
    // Stop old controllers
    eyeTrackingRef.current?.stop();
    blinkRef.current?.stop();

    // Start eye tracking
    const eyeTracking = new EyeTracking({
      element: container,
      eyeStrength: 0.8,
      headStrength: 0.6,
      onUpdate: (ex, ey, hx, hy) => {
        stage.setEyeDirection(ex, ey);
        stage.setHeadAngle(hx, hy);
      },
    });
    eyeTracking.start();
    eyeTrackingRef.current = eyeTracking;

    // Start auto-blink
    const blink = new BlinkController({
      onBlink: (eyeOpen) => {
        stage.setEyes(eyeOpen);
      },
      minInterval: 2000,
      maxInterval: 5500,
    });
    blink.start();
    blinkRef.current = blink;

    // Expression manager
    expressionRef.current = new ExpressionManager({
      onExpressionChange: (id) => {
        stage.setExpression(id);
        setState((s) => ({ ...s, currentExpression: id }));
      },
      onReset: () => {
        stage.resetExpression();
        setState((s) => ({ ...s, currentExpression: -1 }));
      },
    });

    // Audio player with lip sync
    audioRef.current = new AudioPlayer();
    audioRef.current.setOnVolumeUpdate((vol) => {
      stage.setMouthOpen(vol * 2.0); // Amplify for visibility
    });
  }, []);

  // Initialize Live2D stage (fires when modelPath changes)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // StrictMode double-mount guard
    let cancelled = false;
    // Reset isLoaded so the controller effect below (deps: [isLoaded]) re-runs
    // on model switch. Without this, isLoaded stays `true` across a switch, the
    // controller effect never re-runs, and the NEW model is left without
    // eye-tracking / blink / expression controllers (they'd still point at the
    // destroyed old stage).
    setState((s) => ({ ...s, isLoaded: false }));
    const stage = new Live2DStage({
      modelPath: config.modelPath,
      container,
      width: config.width,
      height: config.height,
      onModelLoaded: config.onModelLoaded,
    });

    stageRef.current = stage;

    stage.init().then(() => {
      if (cancelled) return;
      setState((s) => ({ ...s, isLoaded: true }));
    }).catch((err) => {
      if (cancelled) return;
      console.warn("[seren] usePetEngine init error:", err?.message || err);
    });

    return () => {
      cancelled = true;
      stage.destroy();
      stageRef.current = null;
    };
  }, [config.modelPath]);

  // Controllers run once on mount, reconnected when stage changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !stageRef.current || !state.isLoaded) return;

    setupControllers(stageRef.current, container);
    // Build expression map inline (avoids declaration order issue)
    try {
      const stage = stageRef.current;
      const model = (stage as unknown as { model?: { internalModel?: { motionManager?: { expressionManager?: { definitions?: { Name?: string }[] } } } } })?.model;
      const definitions = model?.internalModel?.motionManager?.expressionManager?.definitions;
      if (Array.isArray(definitions) && definitions.length > 0) {
        const map = new Map<string, number>();
        definitions.forEach((def: { Name?: string }, i: number) => {
          const name = (def.Name || "").toLowerCase();
          if (!name) return;
          if (/黑|暗|气|怒|愤/.test(name)) map.set("angry", i);
          else if (/爱|喜|笑|开心|星|乐|捧/.test(name)) map.set("happy", i);
          else if (/泪|哭|伤|悲/.test(name)) map.set("sad", i);
          else if (/惊|叹|0\.0|[!！]|吓/.test(name)) map.set("surprised", i);
          else if (/晕|困|？|[?]/.test(name)) map.set("confused", i);
          else if (/羞|＞＜/.test(name)) map.set("shy", i);
          else map.set("happy", i);
        });
        expressionMapRef.current = map;
        console.log("[seren] 🎭 expression map built, size:", map.size, "keys:", [...map.keys()].join(", "));
      }
    } catch { /* ignore */ }

    return () => {
      eyeTrackingRef.current?.stop();
      blinkRef.current?.stop();
      audioRef.current?.stop();
    };
  }, [state.isLoaded, setupControllers]);

  // Speak with optional expression
  const speak = useCallback(
    async (_text: string, audioUrl?: string, expression?: number) => {
      if (expression) {
        expressionRef.current?.setById(expression);
      }

      if (audioUrl) {
        setState((s) => ({ ...s, isSpeaking: true }));
        await audioRef.current?.playUrl(audioUrl);
        setState((s) => ({ ...s, isSpeaking: false }));
      }
    },
    []
  );

  // Set expression by ID
  const setExpressionById = useCallback((id: number) => {
    expressionRef.current?.setById(id);
  }, []);

  // ── Dynamic expression matching ─────────────────────────────
  const expressionMapRef = useRef<Map<string, number>>(new Map());

  /** Match text to an expression based on the dynamic map */
  const matchExpression = useCallback((text: string) => {
    const map = expressionMapRef.current;
    console.log("[seren] 🎭 matchExpression called, map size:", map.size, "text:", text.slice(0, 80));
    if (map.size === 0) {
      console.log("[seren] 🎭 expressionMap is empty — model has no expressions");
      return;
    }
    const lower = text.toLowerCase();

    // emoji priority, then English keywords, then Chinese keywords
    const checks: [string, string[]][] = [
      ["happy", ["😊","😂","🎉","❤️","✨","😄","😆","🤗","👍","🌟"]],
      ["sad", ["😢","😭","💔","😞","😔","🥺"]],
      ["angry", ["😠","😡","🤬","💢"]],
      ["surprised", ["😲","😮","😯","🤯"]],
      ["confused", ["😕","🤔","😵"]],
    ];

    for (const [emotion, emojis] of checks) {
      if (emojis.some(e => lower.includes(e)) && map.has(emotion)) {
        const idx = map.get(emotion)!;
        console.log("[seren] 🎭 emoji match! emotion:", emotion, "index:", idx);
        expressionRef.current?.setById(idx);
        return;
      }
    }

    // Keyword matching
    const kwChecks: [string, RegExp][] = [
      ["happy", /(?:happy|love|great|awesome|nice|good|wonderful|开心|高兴|快乐|棒|好|喜欢|哈哈|嘿嘿|嘻嘻|喜|乐|笑|爱|欢)/i],
      ["sad", /(?:sad|cry|sorry|unfortunately|sorrow|难过|伤心|悲伤|哭|遗憾|泪|忧)/i],
      ["angry", /(?:angry|frustrat|annoy|mad|生气|愤怒|讨厌|烦|气|怒|恨|骂)/i],
      ["surprised", /(?:wow|whoa|surpris|amazing|unbelievable|惊|居然|竟然|天哪|厉害了|讶|奇|吓)/i],
      ["confused", /(?:confus|puzzl|perplex|晕|糊涂|不解|惑|懵)/i],
    ];

    for (const [emotion, re] of kwChecks) {
      if (re.test(lower) && map.has(emotion)) {
        const idx = map.get(emotion)!;
        console.log("[seren] 🎭 keyword match! emotion:", emotion, "index:", idx);
        expressionRef.current?.setById(idx);
        return;
      }
    }
    console.log("[seren] 🎭 no match for text");
  }, []);

  /** Reset expression to default */
  const resetExpression = useCallback(() => {
    expressionRef.current?.reset();
  }, []);

  // Set mouth open for lip sync (manual control)
  const setMouthOpen = useCallback((value: number) => {
    stageRef.current?.setMouthOpen(value);
  }, []);

  return {
    speak,
    setExpressionById,
    matchExpression,
    resetExpression,
    setMouthOpen,
    audioPlayer: audioRef.current,
    stage: stageRef.current,
    ...state,
  };
}
