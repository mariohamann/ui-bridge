// src/node/plugin.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
var clientBundlePath = fileURLToPath(new URL("../browser/client.js", import.meta.url));
var CLIENT_URL = "/__design-bridge/client.js";
var DB_PORT = parseInt(process.env.DB_PORT ?? "7378", 10);
var DB_WS_URL = `ws://localhost:${DB_PORT}/design-bridge`;
async function isServerRunning(port) {
  try {
    const resp = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(600)
    });
    return resp.ok;
  } catch {
    return false;
  }
}
function spawnServer(rootDir) {
  const _req = createRequire(import.meta.url);
  const serverEntry = _req.resolve("@design-bridge/server");
  const child = spawn(process.execPath, [serverEntry, "--root", rootDir], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DB_PORT: String(DB_PORT) }
  });
  child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  child.on("error", (e) => console.error("[design-bridge] server error:", e));
  return child;
}
function designBridge() {
  let rootDir = "";
  let child = null;
  return {
    name: "design-bridge",
    config() {
      return {
        server: { watch: { ignored: ["**/tweaks/.cache/**"] } }
      };
    },
    async configResolved(config) {
      rootDir = config.root;
    },
    configureServer(server) {
      isServerRunning(DB_PORT).then((running) => {
        if (running) {
          console.log(`[design-bridge] using existing server on :${DB_PORT}`);
        } else {
          console.log(`[design-bridge] spawning server on :${DB_PORT} (root: ${rootDir})`);
          child = spawnServer(rootDir);
        }
      });
      server.httpServer?.once("close", () => {
        if (child && !child.killed) {
          child.kill();
          child = null;
        }
      });
      server.middlewares.use(CLIENT_URL, (_req, res) => {
        const content = readFileSync(clientBundlePath);
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(content);
      });
    },
    transformIndexHtml: {
      order: "pre",
      handler(_html, ctx) {
        if (!ctx.server) return;
        return [
          // Tell the browser client which WS URL to connect to
          {
            tag: "script",
            attrs: { type: "text/javascript" },
            children: `window.__DB_WS_URL__=${JSON.stringify(DB_WS_URL)};`,
            injectTo: "head-prepend"
          },
          { tag: "script", attrs: { src: CLIENT_URL }, injectTo: "head" }
        ];
      }
    }
  };
}
export {
  designBridge
};
