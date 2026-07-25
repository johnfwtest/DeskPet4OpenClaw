# DeskPet4OpenClaw — Live2D Desktop Pet

> 🇺🇸 [English](README.md)

代号: Seren (雪蓮)

Live2D 桌宠，接入 OpenClaw。Tauri 2 + React 19 + TypeScript + PixiJS 6。

## 为什么选择这个项目？

**这是一个轻量级的 Live2D 桌面陪伴助手  （依赖龙虾实例）**

项目专注于角色展示、聊天交互、提醒提示和语音播放，不承担大模型推理、记忆管理和 Agent 调度等复杂逻辑。所有智能能力统一通过 OpenClaw Gateway 接入，由后端负责处理。

它的目标是打造一个可长期常驻桌面的桌宠式助手：
既能与用户聊天，也能作为提醒器使用，同时通过 Live2D 角色、气泡消息和语音反馈，提供更有陪伴感的交互体验。

```
DeskPet4OpenClaw ──ws──▶ OpenClaw ──▶  LLM
                                                     ──▶  Memory
                                                     ──▶  Agent
                                                     ──▶  Skills
        Seren                  AI 网关                  功能
```

这意味着：

- **轻量**。只负责展示，全部精力放在 Live2D 渲染、打字机气泡、表情动画、TTS 语音上，而不是拼凑 AI pipeline；
- **简单**。与Openclaw的通信，直接用官方的Gateway协议， TTS使用浏览器本地自带的，或者直接接在线API。
- **高效**。LLM相关的功能，都交给更专业的AI网关， 不直接进行LLM 调用、会话存储、记忆管理，Agent调用等，本地资源占用小。

**一句话：把 AI 的事交给 Gateway，做好桌宠的事。**

> ⚠️ **重要提示**
>
> 运行 DeskPet4OpenClaw 之前，**必须**将 `http://localhost:18900` 添加到 OpenClaw Gateway 的 `controlUi.allowedOrigins` 中。否则 Gateway 会以 "origin not allowed" 错误拒绝所有 WebSocket 连接。
>
> ```json
> {
>   "controlUi": {
>     "allowedOrigins": ["http://localhost:18900"]
>   }
> }
> ```
>
> 如果连接报错信息里包含 "origin"，就是这个原因。

## 快速开始

### Web 版（开发模式）

```bash
cd desk-pet
pnpm install
pnpm dev          # → http://localhost:18900
```

浏览器打开 `http://localhost:18900`，在设置中配置 Gateway 连接即可使用。

### 桌面版（Windows .exe）

```bash
cd desk-pet
pnpm install
pnpm tauri build  # → src-tauri/target/release/seren.exe
```

运行 `seren.exe`，右键托盘 → ⚙ Settings 配置 Gateway 连接。

**两个版本使用同一端口 `18900`**，同一时间只能运行一个。

## 功能概览

| 模块 | 功能 |
|------|------|
| 🖥️ 桌面 | 透明窗口, 系统托盘, 右键菜单, 窗口拖动, 置顶/穿透开关, 隐藏时系统通知, DevTools |
| 🎭 Live2D | Cubism 4 渲染, 自动眨眼, 眼球追踪, 表情匹配, 口型同步, 模型上传/切换 |
| 💬 聊天 | Markdown GFM, 图片/文件上传, 粘贴, 引用回复, 打字机气泡 |
| 🤖 AI | Gateway WebSocket 直连, 流式 delta/final, 跨 LAN |
| 📋 会话 | 新建/切换/删除, 50 条历史, 自动加入最新会话 |
| 🎨 模型 | ZIP 上传/切换/删除, 窗口适配模型宽高比, 内置模型保护 |
| ⚙ 设置 | 独立窗口 (580×640), Gateway/Prompt/TTS/Models/System 五 Tab |
| 🌐 多语言 | 中文 / English, System Tab 一键切换 |
| 🔈 TTS | 浏览器内置 + OpenAI / Qwen 在线 API |

## 项目结构

```
desk-pet/
├── index.html                       入口 HTML
├── settings.html                    独立设置窗口 HTML
├── start.cmd / start.sh             Web 版启动脚本
├── stop.cmd / stop.sh               Web 版停止脚本
├── src/
│   ├── App.tsx                      主应用 + Gateway + 模型切换 + 窗口交互
│   ├── main.tsx                     React 入口
│   ├── settings-main.tsx            设置窗口入口
│   ├── App.css                      全局样式
│   ├── components/                  9 个 UI 组件
│   │   ├── ChatPanel.tsx            聊天侧边栏
│   │   ├── ChatHeader.tsx           标题栏
│   │   ├── ChatInput.tsx            输入框 + 附件 + 模型选择
│   │   ├── MessageList.tsx          消息列表 + Markdown
│   │   ├── SessionList.tsx          会话列表
│   │   ├── SpeechBubble.tsx         打字机气泡 + 📌 + ⚓
│   │   ├── SettingsPanel.tsx        5-Tab 设置面板
│   │   ├── ModelManager.tsx         模型管理
│   │   └── GatewayConfigEditor.tsx  后端配置编辑器
│   ├── engine/                      Live2D 引擎
│   │   ├── Live2DModel.ts           PixiJS 渲染核心
│   │   ├── usePetEngine.ts          React Hook 集成
│   │   ├── BlinkController.ts       自动眨眼
│   │   ├── EyeTracking.ts           眼球追踪
│   │   └── ExpressionManager.ts     表情管理
│   ├── services/                    服务层
│   │   ├── gatewayClient.ts         Gateway WS 协议客户端
│   │   ├── modelStore.ts            模型存储 (Tauri/Dev 双模式)
│   │   ├── audioPlayer.ts           Web Audio 播放 + 口型
│   │   ├── ttsPlayer.ts             TTS 统一接口
│   │   ├── ttsBuiltin.ts            浏览器内置 TTS
│   │   ├── ttsOnline.ts             OpenAI/Qwen 在线 TTS
│   │   └── adapters/
│   │       ├── index.ts             适配器工厂
│   │       └── openclawAdapter.ts   OpenClaw 适配器
│   ├── types/
│   │   └── backend.ts               适配器接口 + 类型定义
│   └── i18n/
│       └── index.ts                 多语言 (zh/en)
├── src-tauri/
│   ├── src/main.rs                  Rust 后端 (托盘/模型CRUD/设置窗口)
│   ├── capabilities/                权限配置
│   ├── icons/                       爪子图标
│   └── Cargo.toml                   Rust 依赖
├── channel-plugin/                  OpenClaw desk-pet channel 插件
├── public/model/                    Live2D 模型文件
├── package.json                     Node 依赖 + 脚本
├── vite.config.ts                   多页面构建 (main + settings)
└── tsconfig.json                    TypeScript 配置
```

## 前置条件

DeskPet4OpenClaw 需要一个运行中的 **OpenClaw Gateway** 实例。Gateway 需要以下配置：

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

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `allowedOrigins` | `localhost:18900` | Web 开发 + Tauri 生产 origin |

如果 Gateway 版本有 client ID 校验，也需允许 `openclaw-tui`。

## 配置

托盘右键 → ⚙ Settings 打开独立设置窗口：

| Tab | 说明 |
|-----|------|
| ⚡ Gateway | WebSocket URL + Token + 密码（支持跨 LAN） |
| 📝 Prompt | 自定义系统提示词 |
| 📢 TTS | 浏览器内置 / 在线 API, 语速/语音/Key 配置 |
| 🎭 Models | 上传 Live2D .zip, 切换/删除模型 |
| ⚙ System | 语言切换 (中文 / English) |

## 交互

- **双击桌面** → 切换聊天面板
- **⚙ 按钮** → 独立设置窗口（Tauri）/ 内嵌面板（Web）
- **右键主窗口** → 右键菜单（显示/隐藏/设置/拖动/TTS/退出）
- **🔊/🔇 按钮** → 开关 TTS 语音
- **右键托盘 → ⚙ Settings** → 设置窗口
- **右键托盘 → 🖱 Move Window** → 拖动窗口，点击释放
- **右键托盘 → 📌 Always on Top** → 开关窗口置顶（默认开启）
- **右键托盘 → 👁 Click-through** → 鼠标点击穿透到宠物下方窗口（宠物仅作展示；关闭后恢复可交互）
- **右键托盘 → Console (DevTools)** → 开发者工具
- **单击消息 → 引用回复** | **📌 → 固定气泡**
- **Enter 发送** (Shift+Enter 换行) | **Ctrl+V 粘贴图片**
- **窗口隐藏后收到消息** → Windows 系统通知（点击可恢复窗口）

### TTS 与提示音

| 状态 | 声音 |
|---|---|
| TTS 关（可见或隐藏） | 完全无声（隐藏时仅有系统 toast） |
| TTS 开 + 窗口可见 | TTS 读出回复（无 ding） |
| TTS 开 + 窗口隐藏 | ding 提示音 + 系统 toast（不读 TTS） |

## 内置模型

默认内置 **Hiyori Momose (FREE)** Live2D 模型。

- 来源：Live2D 官方示例模型 (Free Material License)
- 作者：Illustration by Kani Biimu, Modeling by Live2D
- 详情：https://www.live2d.com/en/download/sample-data/
- 用户可上传其他 Live2D 模型 (.zip 格式)
