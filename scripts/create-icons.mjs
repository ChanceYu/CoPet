import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceIcon = join(repoRoot, "src", "assets", "logo.png");
const outputDir = join(repoRoot, "src-tauri", "icons");
const workDir = mkdtempSync(join(tmpdir(), "pethover-icons-"));
const roundedIcon = join(workDir, "app-icon-rounded.png");
const trayIcon = join(outputDir, "tray.png");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
}

try {
  run("magick", [
    sourceIcon,
    "-resize",
    "1024x1024^",
    "-gravity",
    "center",
    "-extent",
    "1024x1024",
    "-alpha",
    "set",
    "(",
    "-size",
    "1024x1024",
    "xc:none",
    "-fill",
    "white",
    "-draw",
    "roundrectangle 0,0,1023,1023,225,225",
    ")",
    "-compose",
    "DstIn",
    "-composite",
    `PNG32:${roundedIcon}`,
  ]);

  run("pnpm", ["exec", "tauri", "icon", roundedIcon, "-o", outputDir]);

  run("magick", [
    sourceIcon,
    "-alpha",
    "set",
    "-bordercolor",
    "white",
    "-border",
    "1x1",
    "-fuzz",
    "4%",
    "-fill",
    "none",
    "-draw",
    "color 0,0 floodfill",
    "-shave",
    "1x1",
    "-trim",
    "+repage",
    "-resize",
    "30x30",
    "-background",
    "none",
    "-gravity",
    "center",
    "-extent",
    "36x36",
    `PNG32:${trayIcon}`,
  ]);

  console.log("Generated app icons from src/assets/logo.png");
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
