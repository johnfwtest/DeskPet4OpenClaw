import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, unlinkSync, createReadStream } from "fs";
import { join } from "path";

// ── Models directory (project root) ──────────────────────────────
const MODELS_DIR = resolve(__dirname, "models");

function ensureModelsDir() {
  if (!existsSync(MODELS_DIR)) mkdirSync(MODELS_DIR, { recursive: true });
}

// ── Vite plugin: model CRUD APIs ─────────────────────────────────
// Handled as a Vite plugin with configureServer + httpServer 'request' event
// to bypass connect's body parsing issues.
function modelsPlugin(): Plugin {
  return {
    name: "seren-models-api",
    configureServer(server) {
      const httpServer = server.httpServer;
      if (!httpServer) return;

      // Register early on the raw Node HTTP server, before Vite's connect app.
      // Vite's internal connect middlewares process the request first. But Node
      // http.Server fires 'request' listeners in registration order. connect
      // registers its own listener during server setup. Since this plugin's
      // configureServer runs during setup (before listen), our listener is
      // registered first and fires first.
      const originalListeners = httpServer.listeners("request");
      // Remove all existing listeners temporarily
      httpServer.removeAllListeners("request");
      // Add our handler first
      httpServer.on("request", (req, res) => {
        ensureModelsDir();
        const url = (req.url || "/").split("?")[0];

        // GET /models/* — serve ZIP files
        if (req.method === "GET" && url.startsWith("/models/")) {
          const relative = decodeURIComponent(url.slice("/models/".length));
          if (relative.includes("..") || relative.includes("\\")) {
            res.writeHead(403); res.end("Forbidden"); return;
          }
          const filePath = join(MODELS_DIR, relative);
          if (!filePath.startsWith(MODELS_DIR)) {
            res.writeHead(403); res.end("Forbidden"); return;
          }
          if (existsSync(filePath)) {
            res.writeHead(200, { "Content-Type": "application/zip" });
            createReadStream(filePath).pipe(res);
            return;
          }
          // Not found, let connect/vite handle it
          return;
        }

        // POST /api/models/upload
        if (req.method === "POST" && url === "/api/models/upload") {
          const filename = req.headers["x-filename"] || "model.zip";
          const safeName = String(filename).replace(/[\\/:*?"<>|]/g, "_");
          const chunks: any[] = [];
          req.on("data", (chunk: any) => chunks.push(chunk));
          req.on("end", () => {
            const buffer = Buffer.concat(chunks);
            if (buffer.length === 0) {
              res.writeHead(400); res.end(JSON.stringify({ error: "Empty file" })); return;
            }
            ensureModelsDir();
            const dest = join(MODELS_DIR, safeName);
            writeFileSync(dest, buffer);
            const stats = statSync(dest);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              name: safeName.replace(/\.zip$/i, ""),
              path: dest,
              modelJsonPath: `/models/${encodeURIComponent(safeName)}`,
              sizeMB: stats.size / (1024 * 1024),
              expressionCount: 0,
              addedAt: String(Math.floor(stats.mtimeMs / 1000)),
            }));
          });
          return;
        }

        // POST /api/models/list
        if (req.method === "POST" && url === "/api/models/list") {
          ensureModelsDir();
          const files = readdirSync(MODELS_DIR)
            .filter((f: string) => f.toLowerCase().endsWith(".zip"))
            .sort((a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase()));
          const models = files.map((f: string) => {
            const filePath = join(MODELS_DIR, f);
            const stats = statSync(filePath);
            return {
              name: f.replace(/\.zip$/i, ""),
              path: filePath,
              modelJsonPath: `/models/${encodeURIComponent(f)}`,
              sizeMB: stats.size / (1024 * 1024),
              expressionCount: 0,
              addedAt: String(Math.floor(stats.mtimeMs / 1000)),
            };
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(models));
          return;
        }

        // DELETE /api/models/:name
        if (req.method === "DELETE" && url.startsWith("/api/models/")) {
          const name = decodeURIComponent(url.slice("/api/models/".length));
          const safeName = String(name).replace(/[\\/:*?"<>|]/g, "_");
          const filePath = join(MODELS_DIR, `${safeName}.zip`);
          if (!filePath.startsWith(MODELS_DIR)) {
            res.writeHead(403); res.end("Forbidden"); return;
          }
          if (existsSync(filePath)) {
            unlinkSync(filePath);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          } else {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not found" }));
          }
          return;
        }

        // Path not for us — re-emit to original connect listeners
        for (const fn of originalListeners) {
          (fn as Function).call(httpServer, req, res);
        }
      });
      console.log("[seren] models API plugin registered (first in request chain)");
    },
  };
}

// Vite dev proxy: route /api/tts → DashScope multimodal-generation (CORS bypass in dev)
const ttsProxy = {
  "/api/tts": {
    target: "https://dashscope.aliyuncs.com",
    changeOrigin: true,
    configure: (proxy: any) => {
      proxy.on("proxyReq", (proxyReq: any) => {
        proxyReq.path = "/api/v1/services/aigc/multimodal-generation/generation";
      });
    },
  },
};

export default defineConfig({
  plugins: [react(), modelsPlugin()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 18900,
    strictPort: false,
    watch: {
      ignored: ["**/src-tauri/**", "**/node_modules/**", "**/models/**"],
    },
    proxy: ttsProxy,
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    cssMinify: true,
    reportCompressedSize: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        settings: resolve(__dirname, "settings.html"),
      },
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          markdown: ["react-markdown"],
        },
      },
    },
  },
  publicDir: "public",
  define: {
    global: "globalThis",
  },
});
