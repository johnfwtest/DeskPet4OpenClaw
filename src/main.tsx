import React from "react";
import ReactDOM from "react-dom/client";
import { I18nProvider } from "@/i18n";
import App from "./App";
import "./App.css";

// ── Intercept console for Seren DevTools console window ─────────
{
  const O = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug } as Record<string, Function>;
  let bc: BroadcastChannel | null = null;
  try { bc = new BroadcastChannel("seren-devtools"); } catch {}

  const hook = (tag: string, orig: Function) => (...args: unknown[]) => {
    orig(...args);
    try {
      bc?.postMessage({ tag, args: args.map((a: unknown) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a))) });
    } catch {}
  };

  Object.keys(O).forEach((k) => { (console as unknown as Record<string, unknown>)[k] = hook(k.toUpperCase(), O[k]); });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
