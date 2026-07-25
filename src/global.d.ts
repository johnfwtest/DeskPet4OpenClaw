/**
 * Global type declarations for the DeskPet4OpenClaw application.
 */

declare global {
  interface Window {
    /** Tauri internals — present only when running inside Tauri */
    __TAURI_INTERNALS__?: unknown;
    /** Live2D model source override consumed by Live2DStage */
    __seren_model_source?: unknown;
    /** Enable window move mode (called from Tauri tray menu) */
    __seren_enable_move?: () => void;
    /** Open settings panel (called from Tauri tray menu) */
    __seren_open_settings?: () => void;
    /** Gateway client reference for session/model access via global */
    __gw?: unknown;
    /** Session selection callback */
    __handleSelectSession?: (sessionKey: string) => void;
  }
}

export {};
