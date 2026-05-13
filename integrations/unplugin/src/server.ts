import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';

const _require = createRequire(import.meta.url);

/**
 * Ping the server's /health endpoint. Returns the actual port, or null if unreachable.
 */
export async function getServerPort(port: number): Promise<number | null> {
  try {
    const resp = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(600),
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as { port?: number; };
    return body.port ?? port;
  } catch {
    return null;
  }
}

/**
 * Spawn the server subprocess and resolve with the port it actually bound to.
 * The server emits "DESIGN_BRIDGE_READY:<port>" on stdout once it is listening.
 */
export function spawnServer(
  rootDir: string,
  preferredPort: number,
): { child: ChildProcess; ready: Promise<number>; } {
  const serverEntry = _require.resolve('@design-bridge/server');
  const child = spawn(process.execPath, [serverEntry, '--root', rootDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DESIGN_BRIDGE_PORT: String(preferredPort) },
  });

  const ready = new Promise<number>((resolve, reject) => {
    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line) => {
      process.stdout.write(line + '\n');
      const match = line.match(/^DESIGN_BRIDGE_READY:(\d+)$/);
      if (match) {
        rl.close();
        resolve(parseInt(match[1], 10));
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
    child.on('error', (e) => {
      console.error('[design-bridge] server error:', e);
      reject(e);
    });
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`[design-bridge] server exited with code ${code}`));
    });
  });

  return { child, ready };
}

/**
 * Ensure the Design Bridge server is running. Reuses an existing server if
 * one is already listening on the preferred port, otherwise spawns a new one.
 * Returns the resolved port.
 */
export async function ensureServer(
  rootDir: string,
  preferredPort: number,
): Promise<{ port: number; child: ChildProcess | null; }> {
  const existingPort = await getServerPort(preferredPort);
  if (existingPort !== null) {
    console.log(`[design-bridge] using existing server at http://localhost:${existingPort}`);
    return { port: existingPort, child: null };
  }
  const { child, ready } = spawnServer(rootDir, preferredPort);
  const port = await ready;
  return { port, child };
}
