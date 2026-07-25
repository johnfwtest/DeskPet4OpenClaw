/**
 * modelStore.ts — Model storage management.
 *
 * In Tauri (exe): ZIP files stored next to exe in <exe_dir>/models/
 * In browser (dev): ZIP files stored in project-root models/ via Vite middleware
 */

export interface ModelInfo {
  name: string;
  path: string;
  modelJsonPath: string;
  sizeMB: number;
  expressionCount: number;
  addedAt: string; // "built-in" | unix timestamp string
}

function isTauri(): boolean {
  return typeof window.__TAURI_INTERNALS__ !== "undefined";
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const BUILTIN_MODEL_PATH = "/model/hiyori/runtime/hiyori_free_t08.model3.json";

const BUILTIN_MODELS: ModelInfo[] = [
  {
    name: "Hiyori (Free)",
    path: "/model/hiyori",
    modelJsonPath: "/model/hiyori/runtime/hiyori_free_t08.model3.json",
    sizeMB: 13.4,
    expressionCount: 0,
    addedAt: "built-in",
  },
];

// ── Web-mode HTTP helpers ──────────────────────────────────────────

async function webListModels(): Promise<ModelInfo[]> {
  const res = await fetch("/api/models/list", { method: "POST" });
  if (!res.ok) throw new Error(`List models failed: ${res.status}`);
  return res.json();
}

async function webUploadModel(file: File): Promise<ModelInfo> {
  const buffer = await file.arrayBuffer();
  const res = await fetch("/api/models/upload", {
    method: "POST",
    headers: { "X-Filename": file.name },
    body: buffer,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error || `Upload failed: ${res.status}`);
  }
  return res.json();
}

async function webDeleteModel(name: string): Promise<void> {
  const res = await fetch(`/api/models/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete failed: ${res.status}`);
  }
}

// ── Public API ─────────────────────────────────────────────────────

export async function listModels(): Promise<ModelInfo[]> {
  if (isTauri()) {
    try {
      const tauriModels = await tauriInvoke<ModelInfo[]>("list_models");
      return [...BUILTIN_MODELS, ...tauriModels];
    } catch {
      // fall through to dev mode
    }
  }
  // Web mode: fetch from Vite middleware
  try {
    const webModels = await webListModels();
    return [...BUILTIN_MODELS, ...webModels];
  } catch {
    return [...BUILTIN_MODELS];
  }
}

export async function uploadModel(file: File): Promise<ModelInfo> {
  if (isTauri()) {
    // invoke() serialises params via JSON.  Sending a Vec<u8> as a
    // JSON Array<number> explodes a 10 MB zip into millions of
    // individual numbers and the IPC frame times out.  We base64-
    // encode the zip so it becomes a single compact String param.
    const data = await file.arrayBuffer();
    const bytes = new Uint8Array(data);
    const chunks: string[] = [];
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
    }
    const zipData = btoa(chunks.join(""));
    try {
      return await tauriInvoke<ModelInfo>("save_model_zip", {
        zipData,
        filename: file.name,
      });
    } catch (e: unknown) {
      const msg = (e as any)?.message || (e as any)?.toString() || "invoke error";
      throw new Error("save_model_zip: " + msg);
    }
  }

  // Web mode: POST raw bytes to Vite middleware
  return webUploadModel(file);
}

export async function deleteModel(name: string): Promise<void> {
  // Built-in protection: never allow deleting the default model
  if (BUILTIN_MODELS.some(m => m.name === name)) {
    throw new Error("Built-in model cannot be deleted");
  }

  if (isTauri()) {
    await tauriInvoke<void>("delete_model", { name });
    return;
  }

  // Web mode: DELETE via Vite middleware
  await webDeleteModel(name);
}

export function getCurrentModel(): string {
  try {
    return localStorage.getItem("seren-current-model") || "Hiyori (Free)";
  } catch {
    return "Hiyori (Free)";
  }
}

export function setCurrentModel(name: string): void {
  try {
    localStorage.setItem("seren-current-model", name);
  } catch {}
}
