// 📂 SAVE THIS FILE AT: lib/renderServer.js
// (new file — nothing existing is replaced)
//
// Manages latex_renderer.py as a singleton background process:
//   - First render request after the Next.js server starts: boots the Python server
//     automatically (you don't run anything manually — just click "render").
//   - Every render after that reuses the same already-running server (warm browser,
//     no relaunch cost).
//   - The Python server is killed ONLY when this Next.js process itself stops
//     (Ctrl+C / server restart) — never after a single render finishes.

import { spawn } from "child_process";
import path from "path";

const PORT = process.env.RENDER_SERVER_PORT || "8731";
const BASE_URL = `http://127.0.0.1:${PORT}`;

let pyProcess = null;
let bootPromise = null;
let cleanupRegistered = false;

async function isHealthy() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const shutdown = () => {
    if (pyProcess && !pyProcess.killed) {
      pyProcess.kill();
    }
  };

  // Covers normal exit, Ctrl+C, and kill signals — but deliberately NOT wired to
  // fire per-request, so the server survives between renders.
  process.on("exit", shutdown);
  process.on("SIGINT", () => { shutdown(); process.exit(0); });
  process.on("SIGTERM", () => { shutdown(); process.exit(0); });
}

/**
 * Ensures the Python render server is up and warm. Safe to call on every request —
 * it's a no-op (just a fast health check) once the server is already running.
 * Returns the base URL to POST /render against.
 */
export async function ensureRenderServer() {
  if (await isHealthy()) return BASE_URL;

  // If a render request is already mid-boot, piggyback on it instead of spawning
  // a second Python process.
  if (bootPromise) {
    await bootPromise;
    return BASE_URL;
  }

  bootPromise = (async () => {
    const rootDir = process.cwd();

    pyProcess = spawn("python", [path.join(rootDir, "latex_renderer.py")], {
      cwd: rootDir,
      env: { ...process.env, RENDER_SERVER_PORT: PORT },
      stdio: "ignore", // switch to "inherit" temporarily if you need to see Python's own errors
    });

    registerCleanup();

    // Poll instead of a fixed sleep — first boot (Chromium launch) can take a
    // couple seconds; if it's already warm from a previous request it returns instantly.
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await isHealthy()) return;
      await wait(250);
    }
    throw new Error("Render server did not become healthy within 10s of starting.");
  })();

  try {
    await bootPromise;
  } finally {
    bootPromise = null;
  }

  return BASE_URL;
}