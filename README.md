# DeskPet4OpenClaw — Live2D Desktop Pet

> 🇨🇳 [中文版](README_CN.md)

CodeName: Seren (雪蓮)

A Live2D desktop pet powered by OpenClaw. Tauri 2 + React 19 + TypeScript + PixiJS 6.

## Why This Project?

**A lightweight Live2D desktop pet (depends on OpenClaw).**

The project focuses on character display, chat interaction, reminders, and voice playback — it does not handle LLM inference, memory management, or Agent scheduling. All intelligence is delivered through the OpenClaw Gateway, which serves as the backend.

The goal is a long-running desktop companion:
one that can chat with you, act as a reminder, and provide a warm sense of companionship through a Live2D character, speech bubbles, and voice feedback.

```
DeskPet4OpenClaw ──ws──▶ OpenClaw ──▶  LLM
                                                       ──▶  Memory
                                                       ──▶  Agent
                                                       ──▶  Skills
        Seren                   AI Gateway               Capabilities
```

This means:

- **Lightweight.** Focused on presentation — all effort goes into Live2D rendering, typewriter bubbles, expression animations, and TTS, not stitching together AI pipelines.
- **Simple.** Communication uses OpenClaw's official Gateway protocol. TTS uses the browser's built-in synthesis or a direct online API.
- **Efficient.** LLM concerns are delegated to a dedicated AI gateway. No direct LLM calls, session storage, memory management, or Agent invocation in the client — minimal local resource usage.

**In one sentence: Leave AI to the Gateway. Focus on being a great desk pet.**

> ⚠️ **IMPORTANT**
>
> Before running DeskPet4OpenClaw, you **must** add `http://localhost:18900` to your OpenClaw Gateway's `controlUi.allowedOrigins`. Without this, the Gateway will reject all WebSocket connections with an "origin not allowed" error.
>
> ```json
> {
>   "controlUi": {
>     "allowedOrigins": ["http://localhost:18900"]
>   }
> }
> ```
>
> If you see a connection error mentioning "origin", this is why.

## Getting Started

### Web (Dev)

```bash
cd desk-pet
pnpm install
pnpm dev          # → http://localhost:18900
```

Open `http://localhost:18900` in your browser and configure the Gateway connection in Settings.

### Desktop (Windows .exe)

```bash
cd desk-pet
pnpm install
pnpm tauri build  # → src-tauri/target/release/seren.exe
```

Run `seren.exe`, right-click the tray icon → ⚙ Settings to configure your Gateway connection.

**Both versions use port `18900`.** Only one can run at a time.

## Features

| Module | Capabilities |
|--------|-------------|
| 🖥️ Desktop | Transparent window, system tray, right-click menu, drag-to-move, always-on-top & click-through toggles, system notifications when hidden, DevTools |
| 🎭 Live2D | Cubism 4 rendering, auto-blink, eye tracking, expression matching, lip-sync, model upload/switch |
| 💬 Chat | Markdown GFM, file/image upload, paste, quote reply, typewriter bubbles |
| 🤖 AI | Gateway WebSocket direct connect, streaming delta/final, cross-LAN |
| 📋 Sessions | Create/switch/delete, 50-message history, auto-join latest |
| 🎨 Models | ZIP upload/switch/delete, window auto-resize to model aspect ratio, built-in protection |
| ⚙ Settings | Standalone window (580×640), 5 tabs: Gateway / Prompt / TTS / Models / System |
| 🌐 i18n | 中文 / English, toggle in System tab |
| 🔈 TTS | Browser built-in + OpenAI / Qwen online API |

## Project Structure

```
desk-pet/
├── index.html                       Entry HTML
├── settings.html                    Standalone settings window HTML
├── start.cmd / start.sh             Web dev server start scripts
├── stop.cmd / stop.sh               Web dev server stop scripts
├── src/
│   ├── App.tsx                      Main app + Gateway + model switching + window interactions
│   ├── main.tsx                     React entry
│   ├── settings-main.tsx            Settings window entry
│   ├── App.css                      Global styles
│   ├── components/                  9 UI components
│   │   ├── ChatPanel.tsx            Chat sidebar
│   │   ├── ChatHeader.tsx           Title bar
│   │   ├── ChatInput.tsx            Input + attachments + model selector
│   │   ├── MessageList.tsx          Message list + Markdown
│   │   ├── SessionList.tsx          Session list
│   │   ├── SpeechBubble.tsx         Typewriter bubble + 📌 + ⚓
│   │   ├── SettingsPanel.tsx        5-tab settings panel
│   │   ├── ModelManager.tsx         Model management
│   │   └── GatewayConfigEditor.tsx  Backend config editor
│   ├── engine/                      Live2D engine
│   │   ├── Live2DModel.ts           PixiJS rendering core
│   │   ├── usePetEngine.ts          React Hook integration
│   │   ├── BlinkController.ts       Auto-blink
│   │   ├── EyeTracking.ts           Eye tracking
│   │   └── ExpressionManager.ts     Expression management
│   ├── services/                    Service layer
│   │   ├── gatewayClient.ts         Gateway WS protocol client
│   │   ├── modelStore.ts            Model storage (Tauri/Dev dual-mode)
│   │   ├── audioPlayer.ts           Web Audio playback + lip-sync
│   │   ├── ttsPlayer.ts             TTS unified interface
│   │   ├── ttsBuiltin.ts            Browser built-in TTS
│   │   ├── ttsOnline.ts             OpenAI/Qwen online TTS
│   │   └── adapters/
│   │       ├── index.ts             Adapter factory
│   │       └── openclawAdapter.ts   OpenClaw adapter
│   ├── types/
│   │   └── backend.ts               Adapter interfaces + type definitions
│   └── i18n/
│       └── index.ts                 Internationalization (zh/en)
├── src-tauri/
│   ├── src/main.rs                  Rust backend (tray / model CRUD / settings window)
│   ├── capabilities/                Permission configs
│   ├── icons/                       Paw icon
│   └── Cargo.toml                   Rust dependencies
├── channel-plugin/                  OpenClaw desk-pet channel plugin
├── public/model/                    Live2D model files
├── package.json                     Node dependencies + scripts
├── vite.config.ts                   Multi-page build (main + settings)
└── tsconfig.json                    TypeScript config
```

## Prerequisites

DeskPet4OpenClaw requires a running **OpenClaw Gateway** instance. The Gateway needs the following configuration:

```json
{
  "controlUi": {
    "allowedOrigins": [
      "http://localhost:18900",
      "http://tauri.localhost"
    ]
  }
}
```

| Setting | Value | Notes |
|---------|-------|-------|
| `allowedOrigins` | `localhost:18900` | Web dev + Tauri production origin |

If your Gateway version validates client IDs, also allow `openclaw-tui`.

## Configuration

Right-click tray → ⚙ Settings to open the standalone settings window:

| Tab | Description |
|-----|------------|
| ⚡ Gateway | WebSocket URL + Token + Password (cross-LAN supported) |
| 📝 Prompt | Custom system prompt |
| 📢 TTS | Browser built-in / Online API, speed / voice / API key |
| 🎭 Models | Upload Live2D .zip, switch / delete models |
| ⚙ System | Language toggle (中文 / English) |

## Interactions

- **Double-click desktop** → toggle chat panel
- **⚙ button** → standalone settings window (Tauri) / inline panel (Web)
- **Right-click main window** → context menu (Show / Hide / Settings / Move / TTS / Quit)
- **🔊/🔇 button** → toggle TTS
- **Right-click tray → ⚙ Settings** → settings window
- **Right-click tray → 🖱 Move Window** → drag window, click to release
- **Right-click tray → 📌 Always on Top** → toggle always-on-top (on by default)
- **Right-click tray → 👁 Click-through** → let clicks pass through to windows under the pet (pet becomes visual-only; toggle off to interact again)
- **Right-click tray → Console (DevTools)** → developer tools
- **Click message → quote reply** | **📌 → pin bubble**
- **Enter to send** (Shift+Enter for newline) | **Ctrl+V to paste image**
- **Window hidden + message received** → Windows system notification (click to restore window)

### TTS & notification sound

| State | Sound |
|---|---|
| TTS off (visible or hidden) | No sound at all (only a system toast when hidden) |
| TTS on + window visible | TTS reads the reply aloud (no ding) |
| TTS on + window hidden | Ding alert + system toast (no TTS) |

## Built-in Model

Default built-in model: **Hiyori Momose (FREE)** from Live2D.

- Source: Live2D official sample model (Free Material License)
- Author: Illustration by Kani Biimu, Modeling by Live2D
- Details: https://www.live2d.com/en/download/sample-data/
- Users can upload additional Live2D models (.zip format)
