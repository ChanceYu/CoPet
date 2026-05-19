#!/usr/bin/env node
// Launches Vite for `pnpm tauri dev`. Before starting, releases any process
// still holding port 1420 — Tauri 2's dev-mode shell wrapper can leave the
// Vite child orphaned across an app quit on macOS, and Vite's strictPort
// config refuses to fall back to another port. Without this pre-kill the
// second `pnpm tauri dev` after a quit fails with "Port 1420 is already in use".

import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PORT = 1420;
const isWindows = process.platform === "win32";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = join(repoRoot, "node_modules", ".bin", isWindows ? "vite.cmd" : "vite");

function releasePort(port) {
  try {
    if (isWindows) {
      const lines = execSync(`netstat -ano -p TCP | findstr :${port} | findstr LISTENING`, {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim()
        .split(/\r?\n/);
      const pids = new Set(
        lines
          .map((line) => line.trim().split(/\s+/).pop())
          .filter((value) => value && /^\d+$/.test(value)),
      );
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        } catch {
          // PID already gone — ignore
        }
      }
    } else {
      const pids = execSync(`lsof -ti:${port}`, { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim()
        .split("\n")
        .filter(Boolean);
      for (const pid of pids) {
        try {
          execSync(`kill -9 ${pid}`, { stdio: "ignore" });
        } catch {
          // PID already gone — ignore
        }
      }
    }
  } catch {
    // No listener on the port — nothing to release
  }
}

releasePort(PORT);

// Forward any args passed by the caller (e.g. Playwright's `--host 127.0.0.1`).
const child = spawn(viteBin, process.argv.slice(2), {
  stdio: "inherit",
  shell: isWindows,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    try {
      child.kill(sig);
    } catch {
      // Already exited
    }
  });
}
