#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Listener, ipc::Response};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, CheckMenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

// ── Tauri State ──────────────────────────────────────────────────

struct AppModelsDir(PathBuf);

// ── Model Info types ─────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ModelInfo {
    name: String,
    path: String,
    model_json_path: String,
    #[serde(rename = "sizeMB")]
    size_mb: f64,
    expression_count: u32,
    added_at: String,
}

// ── Commands ─────────────────────────────────────────────────────

#[tauri::command]
fn list_models(state: tauri::State<AppModelsDir>) -> Vec<ModelInfo> {
    let mut models: Vec<ModelInfo> = Vec::new();
    let dir = &state.0;
    if !dir.exists() { let _ = fs::create_dir_all(dir); }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() { continue; }
            let fname = entry.file_name().to_string_lossy().to_string();
            if !fname.to_lowercase().ends_with(".zip") { continue; }
            let name = fname.strip_suffix(".zip").unwrap_or(&fname).to_string();
            let size = entry.metadata().ok().map(|m| m.len()).unwrap_or(0);
            let added = entry.metadata().ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs().to_string())
                .unwrap_or_else(|| "0".to_string());
            models.push(ModelInfo {
                name,
                path: path.to_string_lossy().to_string(),
                model_json_path: path.to_string_lossy().to_string(),
                size_mb: size as f64 / (1024.0 * 1024.0),
                expression_count: 0,
                added_at: added,
            });
        }
    }
    models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    models
}

#[tauri::command]
fn save_model_zip(
    state: tauri::State<AppModelsDir>,
    zip_data: String,
    filename: String,
) -> Result<ModelInfo, String> {
    println!("[Rust] save_model_zip: filename={}, base64_len={}", filename, zip_data.len());
    let decoded = BASE64.decode(&zip_data).map_err(|e| format!("base64 decode: {e}"))?;
    println!("[Rust] decoded {} bytes", decoded.len());
    let dir = &state.0;
    if !dir.exists() { fs::create_dir_all(dir).map_err(|e| format!("mkdir: {e}"))?; }
    let safe = filename.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_");
    let model_name = safe.strip_suffix(".zip").unwrap_or(&safe).to_string();
    let zip_path = dir.join(&safe);
    fs::write(&zip_path, &decoded).map_err(|e| format!("write: {e}"))?;
    let size = decoded.len();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());
    Ok(ModelInfo {
        name: model_name,
        path: zip_path.to_string_lossy().to_string(),
        model_json_path: zip_path.to_string_lossy().to_string(),
        size_mb: size as f64 / (1024.0 * 1024.0),
        expression_count: 0,
        added_at: now,
    })
}

#[tauri::command]
fn delete_model(state: tauri::State<AppModelsDir>, name: String) -> Result<(), String> {
    let dir = &state.0;
    let zip_path = dir.join(format!("{}.zip", &name));
    if !zip_path.exists() { return Err("Model file not found".to_string()); }
    // Also cleanup unpacked temp dir (legacy from the old seren-model:// path; harmless no-op now)
    let unpack_dir = std::env::temp_dir().join("seren").join("models").join(&name);
    if unpack_dir.exists() { let _ = fs::remove_dir_all(&unpack_dir); }
    fs::remove_file(&zip_path).map_err(|e| format!("Failed to delete model: {}", e))
}

/// Read a model ZIP's raw bytes. Returned as a binary `Response` so the JS side
/// receives an `ArrayBuffer` (no base64 / JSON overhead). The frontend wraps it
/// in a `File` and feeds it to pixi-live2d-display's `ZipLoader` via
/// `window.__seren_model_source`, which loads everything in-browser and avoids
/// the cross-scheme XHR block that killed the old `seren-model://` protocol.
#[tauri::command]
fn read_model_zip(state: tauri::State<AppModelsDir>, name: String) -> Result<Response, String> {
    let dir = &state.0;
    let zip_path = dir.join(format!("{}.zip", &name));
    if !zip_path.exists() { return Err(format!("Model '{}' not found", name)); }
    let bytes = fs::read(&zip_path).map_err(|e| format!("read zip: {e}"))?;
    println!("[Rust] read_model_zip: '{}' ({} bytes)", name, bytes.len());
    Ok(Response::new(bytes))
}

fn main() {
    let port = 18900u16;

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_localhost::Builder::new(port).build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let models_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.join("models")))
                .unwrap_or_else(|| std::env::temp_dir().join("seren").join("models"));
            if !models_dir.exists() { let _ = fs::create_dir_all(&models_dir); }
            println!("[Rust] models_dir: {:?}", models_dir);
            app.manage(AppModelsDir(models_dir));

            // ── Tray menu ─────────────────────────────────────────
            let show = MenuItemBuilder::with_id("show", "Show Seren").build(app)?;
            let hide = MenuItemBuilder::with_id("hide", "Hide Seren").build(app)?;
            let settings = MenuItemBuilder::with_id("settings", "⚙ Settings").build(app)?;
            let devtools = MenuItemBuilder::with_id("devtools", "Console (DevTools)").build(app)?;
            let move_btn = MenuItemBuilder::with_id("move", "🖱 Move Window").build(app)?;
            // Always-on-top starts checked (tauri.conf.json has alwaysOnTop:true).
            let aot = CheckMenuItemBuilder::with_id("aot", "📌 Always on Top").checked(true).build(app)?;
            // Click-through starts off (window intercepts clicks by default).
            let clickthrough = CheckMenuItemBuilder::with_id("clickthrough", "👁 Click-through").checked(false).build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show).item(&hide).item(&settings).separator()
                .item(&devtools).item(&move_btn).item(&aot).item(&clickthrough).separator().item(&quit)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("DeskPet4OpenClaw — Live2D Desktop Pet")
                .icon(app.default_window_icon().cloned().unwrap())
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show(); let _ = w.set_focus();
                            let _ = app.emit("seren:window-shown", ());
                        }
                    }
                })
                .on_menu_event({
                    let aot = aot.clone();
                    let clickthrough = clickthrough.clone();
                    move |app, event| match event.id().as_ref() {
                    "show" => { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); let _ = app.emit("seren:window-shown", ()); } }
                    "hide" => { if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); let _ = app.emit("seren:window-hidden", ()); } }
                    "settings" => {
                        if let Some(existing) = app.get_webview_window("settings") { let _ = existing.set_focus(); }
                        else { let _ = tauri::WebviewWindowBuilder::new(app, "settings", tauri::WebviewUrl::External(url::Url::parse("http://localhost:18900/settings.html").unwrap())).title("Settings — DeskPet4OpenClaw").inner_size(580.0, 640.0).resizable(false).center().build(); }
                    }
                    "devtools" => { if let Some(w) = app.get_webview_window("main") { w.open_devtools(); } }
                    "move" => { if let Some(w) = app.get_webview_window("main") { let _ = w.eval("window.__seren_enable_move && window.__seren_enable_move()"); } }
                    "aot" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let new = !w.is_always_on_top().unwrap_or(true);
                            let _ = w.set_always_on_top(new);
                            let _ = aot.set_checked(new);
                        }
                    }
                    "clickthrough" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let new = !clickthrough.is_checked().unwrap_or(false);
                            let _ = w.set_ignore_cursor_events(new);
                            let _ = clickthrough.set_checked(new);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                    }
                })
                .build(app)?;

            let app_handle = app.handle().clone();
            app.listen_any("seren:open-settings", move |_event| {
                let app = app_handle.clone();
                if let Some(existing) = app.get_webview_window("settings") { let _ = existing.set_focus(); }
                else { let _ = tauri::WebviewWindowBuilder::new(&app, "settings", tauri::WebviewUrl::External(url::Url::parse("http://localhost:18900/settings.html").unwrap())).title("Settings — DeskPet4OpenClaw").inner_size(580.0, 640.0).resizable(false).center().build(); }
            });

            let app_quit = app.handle().clone();
            app.listen_any("seren:quit", move |_event| { app_quit.exit(0); });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_models,
            save_model_zip,
            delete_model,
            read_model_zip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Seren");
}
