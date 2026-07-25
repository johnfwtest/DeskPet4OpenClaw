/**
 * Live2DModel — Live2D Cubism 4 rendering via pixi-live2d-display + JSZip.
 *
 * Works with both .model3.json (unpacked) and .zip (packed) model paths.
 * CJK filenames in ZIP (e.g. 火花.moc3) have a known encoding mismatch in
 * FileLoader.validateFiles — fixed by using .model3.json entry point instead.
 */

import { Application } from "@pixi/app";
import { Ticker, TickerPlugin } from "@pixi/ticker";
import { Live2DModel, ZipLoader } from "pixi-live2d-display/cubism4";
import JSZip from "jszip";

// ── Ticker + JSZip wiring (required) ──────────────────────────
Application.registerPlugin(TickerPlugin);
Live2DModel.registerTicker(Ticker);

ZipLoader.zipReader = (data: Blob, _url: string) => JSZip.loadAsync(data);
ZipLoader.getFilePaths = async (zip: JSZip) =>
  Object.keys(zip.files).filter((p) => !zip.files[p].dir);

/**
 * Override ZipLoader.getFiles to return File objects where
 * each File has a name that includes the full zip path.
 * This is critical because FileLoader.validateFiles() compares
 * encodeURI(webkitRelativePath) against decoded resolveURL results.
 * Using the full path as the file name ensures the match works
 * even after encodeURI encoding.
 */
ZipLoader.getFiles = async (zip: JSZip, paths: string[]) => {
  const blobs = await Promise.all(paths.map((p) => zip.files[p].async("blob")));
  return blobs.map((blob, i) => {
    // Use the full path as the filename so webkitRelativePath matches
    // after encodeURI encoding in validateFiles
    const file = new File([blob], paths[i], {
      type: blob.type || "application/octet-stream",
    });
    // Ensure webkitRelativePath is set EXACTLY as the full path
    // ZipLoader.unzip() will set this again, but we pre-set it for safety
    try {
      Object.defineProperty(file, "webkitRelativePath", {
        value: paths[i],
        writable: true,
      });
    } catch {}
    return file;
  });
};

ZipLoader.readText = async (zip: JSZip, path: string) => {
  const file = zip.files[path];
  if (!file) return "";
  const text = await file.async("text");
  // Only transform model3.json/model.json settings files.
  if (!path.endsWith(".model3.json") && !path.endsWith(".model.json")) {
    return text;
  }
  try {
    const parsed = JSON.parse(text);

    // Auto-discover expressions: if model3.json doesn't declare Expressions,
    // scan for .exp3.json files in the zip and inject them.
    const fr = parsed.FileReferences || (parsed.FileReferences = {});
    const exprs = fr.Expressions || parsed.Expressions;
    if (!Array.isArray(exprs) || exprs.length === 0) {
      const allFiles = Object.keys(zip.files).filter(p => !zip.files[p].dir);
      const expFiles = allFiles.filter(p => {
        const base = p.split("/").pop() || "";
        return base.endsWith(".exp3.json") || base.endsWith(".exp.json");
      });
      if (expFiles.length > 0) {
        const injected = expFiles.map(f => {
          const name = f.split("/").pop()!.replace(/\.exp3?\.json$/i, "");
          return { Name: name, File: f };
        });
        fr.Expressions = injected;
        console.log("[seren] 🎭 Auto-discovered " + injected.length + " expressions:", injected.map(e => e.Name).join(", "));
      }
    }

    // Encode CJK / non-ASCII path references in FileReferences.
    //
    // pixi-live2d-display's FileLoader.validateFiles() compares
    //   encodeURI(file.webkitRelativePath)   // -> "%E7%81%AB%E8%8A%B1.moc3"
    // against
    //   url.resolve(settings.url, expectedFile)   // -> raw "火花.moc3" (NOT encoded)
    // which never matches for CJK filenames, throwing
    //   "File X is defined in settings, but doesn't exist in given files".
    // Encoding the references here makes both sides "%E7...moc3"; the lib's
    // own decodeURI() then reverses it back to the raw CJK key when looking
    // the file up in the zip, so JSZip matching still works.
    const enc = (s: unknown): unknown => (typeof s === "string" ? encodeURI(s) : s);
    if (fr.Moc) fr.Moc = enc(fr.Moc);
    if (Array.isArray(fr.Textures)) fr.Textures = fr.Textures.map(enc);
    if (fr.Physics) fr.Physics = enc(fr.Physics);
    if (fr.Pose) fr.Pose = enc(fr.Pose);
    if (fr.DisplayInfo) fr.DisplayInfo = enc(fr.DisplayInfo);
    if (Array.isArray(fr.Expressions)) {
      fr.Expressions.forEach((e: { File?: unknown }) => { if (e.File) e.File = enc(e.File); });
    }
    if (fr.Motions && typeof fr.Motions === "object") {
      for (const group of Object.keys(fr.Motions)) {
        const list = (fr.Motions as Record<string, Array<{ File?: unknown }>>)[group];
        if (Array.isArray(list)) list.forEach(m => { if (m.File) m.File = enc(m.File); });
      }
    }

    return JSON.stringify(parsed);
  } catch {
    return text;
  }
};
ZipLoader.releaseReader = () => {};

// ── Types ──────────────────────────────────────────────────────

// Live2DModel instance from pixi-live2d-display (no public types available)
interface Live2DModelInstance {
  width: number;
  height: number;
  anchor: { set(x: number, y: number): void };
  scale: { set(x: number, y: number): void };
  x: number;
  y: number;
  autoUpdate: boolean;
  internalModel?: Live2DInternalModel;
  destroy(): void;
}

interface Live2DInternalModel {
  motionManager?: {
    definitions?: Record<string, unknown[]>;
    expressionManager?: {
      definitions?: { Name?: string }[];
      setExpression(id: number): void;
      resetExpression(): void;
    };
    startRandomMotion(group: string, priority: number): void;
  };
  coreModel?: {
    setParameterValueById(id: string, v: number): void;
  };
}

// ── Stage ─────────────────────────────────────────────────────

export interface Live2DModelConfig {
  modelPath: string;
  container: HTMLElement;
  width: number;
  height: number;
  onModelLoaded?: (nativeW: number, nativeH: number) => void;
}

export const Live2DParams = {
  ParamEyeLOpen: "ParamEyeLOpen",
  ParamEyeROpen: "ParamEyeROpen",
  ParamEyeBallX: "ParamEyeBallX",
  ParamEyeBallY: "ParamEyeBallY",
  ParamAngleX: "ParamAngleX",
  ParamAngleY: "ParamAngleY",
  ParamAngleZ: "ParamAngleZ",
  ParamBodyAngleX: "ParamBodyAngleX",
  ParamBodyAngleY: "ParamBodyAngleY",
  ParamBodyAngleZ: "ParamBodyAngleZ",
  ParamMouthOpenY: "ParamMouthOpenY",
  ParamBreath: "ParamBreath",
} as const;

export class Live2DStage {
  app: Application;
  cfg: Live2DModelConfig;
  private model: Live2DModelInstance | null = null;
  private _loaded = false;
  private _destroyed = false;

  constructor(cfg: Live2DModelConfig) {
    this.cfg = cfg;
    // backgroundAlpha=0 for transparent Tauri overlay window.
    this.app = new Application({
      width: cfg.width,
      height: cfg.height,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preserveDrawingBuffer: true,
      sharedTicker: true,  // Use Ticker.shared so onTickerUpdate fires
    });
  }

  async init() {
    if (this._loaded || this._destroyed) return;

    const view = this.app.view as HTMLCanvasElement;
    view.style.cssText =
      "position:absolute;top:0;left:0;background:transparent;pointer-events:none;z-index:0";
    this.cfg.container.appendChild(view);

    // Let the canvas settle in the DOM
    await new Promise((r) => setTimeout(r, 0));

    try {
      // Support both string URLs and File objects.
      // For uploaded ZIP files, the File is passed via window.__seren_model_source
      // as File[], which ZipLoader.factory detects.
      // When __seren_model_source is undefined, pass the URL directly —
      // the engine will fetch via the provided URL.
      let source: any;
      if (window.__seren_model_source !== undefined) {
        source = window.__seren_model_source;
        window.__seren_model_source = undefined; // consume once
      } else {
        source = this.cfg.modelPath;
      }
      console.log("[seren] Live2DModel.from source:", typeof source === "string" ? source : (Array.isArray(source) ? source.length + " files" : "unknown"));
      this.model = await Live2DModel.from(source) as unknown as Live2DModelInstance;

      if (this._destroyed) return;

      const mw: number = this.model.width || this.cfg.width;
      const mh: number = this.model.height || this.cfg.height;
      const s = Math.min(this.cfg.height / mh, this.cfg.width / mw) * 0.85;

      this.model.anchor.set(0.5, 0.7);
      this.model.scale.set(s, s);
      this.model.x = this.cfg.width / 2;
      this.model.y = this.cfg.height * 0.65;

      this.app.stage.addChild(this.model as unknown as Parameters<typeof this.app.stage.addChild>[0]);
      // Enable autoUpdate so the Ticker drives motion + physics + blinking
      this.model.autoUpdate = true;
      // Start idle motion
      try {
        const mm = this.model.internalModel?.motionManager;
        if (mm?.definitions && Object.keys(mm.definitions).includes("Idle")) {
          const idleGroup = mm.definitions["Idle"] as unknown[];
          if (idleGroup && idleGroup.length > 0) {
            console.log("[seren] 🎬 Motion groups:", Object.keys(mm.definitions).join(", "));
            mm.startRandomMotion("Idle", 1 /* IDLE priority */);
            console.log("[seren] 🎬 Idle motion started");
          }
        }
      } catch (e: unknown) {
        console.warn("[seren] Motion start failed:", (e as Error)?.message || e);
      }
      this._loaded = true;
      console.log("[seren] ✅ Live2D model loaded (" + mw + "x" + mh + ", scale " + s.toFixed(2) + ")");
      if (this.cfg.onModelLoaded) this.cfg.onModelLoaded(mw, mh);
    } catch (e: unknown) {
      if (this._destroyed) return;
      console.warn("[seren] Model load failed, using placeholder:", (e as Error)?.message || e);
      this.placeholder();
    }
  }

  private placeholder() {
    try {
      // Dynamic import of pixi graphics for the fallback circle avatar
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Graphics } = require("@pixi/graphics") as { Graphics: new () => GraphicsShape };
      interface GraphicsShape {
        beginFill(c: number): GraphicsShape;
        drawCircle(x: number, y: number, r: number): GraphicsShape;
        endFill(): GraphicsShape;
      }
      const g = new Graphics();
      g.beginFill(0xff7799);
      g.drawCircle(this.cfg.width / 2, this.cfg.height / 3, 55);
      g.endFill();
      g.beginFill(0xffffff);
      g.drawCircle(this.cfg.width / 2 - 18, this.cfg.height / 3 - 12, 7);
      g.endFill();
      g.beginFill(0xffffff);
      g.drawCircle(this.cfg.width / 2 + 18, this.cfg.height / 3 - 12, 7);
      g.endFill();
      this.app.stage.addChild(g as unknown as Parameters<typeof this.app.stage.addChild>[0]);
    } catch { /* placeholder failed — nothing to do */ }
  }

  setParam(id: string, v: number) {
    try { this.model?.internalModel?.coreModel?.setParameterValueById(id, v); } catch { /* noop */ }
  }
  setEyes(v: number) {
    this.setParam(Live2DParams.ParamEyeLOpen, v);
    this.setParam(Live2DParams.ParamEyeROpen, v);
  }
  setEyeDirection(x: number, y: number) {
    this.setParam(Live2DParams.ParamEyeBallX, x);
    this.setParam(Live2DParams.ParamEyeBallY, y);
  }
  setHeadAngle(x: number, y: number) {
    this.setParam(Live2DParams.ParamAngleX, x);
    this.setParam(Live2DParams.ParamAngleY, y);
  }
  setMouthOpen(v: number) {
    this.setParam(Live2DParams.ParamMouthOpenY, v);
  }
  setExpression(id: number) {
    try { this.model?.internalModel?.motionManager?.expressionManager?.setExpression(id); } catch { /* noop */ }
  }
  resetExpression() {
    try { this.model?.internalModel?.motionManager?.expressionManager?.resetExpression(); } catch { /* noop */ }
  }
  resize(w: number, h: number) {
    this.app.renderer?.resize(w, h);
  }
  destroy() {
    this._destroyed = true;
    try { this.model?.destroy(); } catch { /* noop */ }
    try { this.app.destroy(true); } catch { /* noop */ }
    this.model = null;
  }
  get loaded() { return this._loaded; }
}
