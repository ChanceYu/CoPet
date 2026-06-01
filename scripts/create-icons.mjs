import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceIcon = join(repoRoot, "src", "assets", "logo.png");
const outputDir = join(repoRoot, "src-tauri", "icons");
const workDir = mkdtempSync(join(tmpdir(), "copet-icons-"));
const roundedIcon = join(workDir, "app-icon-rounded.png");
const trayIcon = join(outputDir, "tray.png");
const mobileIconDirs = [join(outputDir, "android"), join(outputDir, "ios")];

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
  for (const mobileIconDir of mobileIconDirs) {
    rmSync(mobileIconDir, { recursive: true, force: true });
  }

  // macOS renders tray icons as template masks. Keep the 36px menu-bar mark
  // mostly solid, with translucent eye whites and solid pupils.
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
    "32x32",
    "-background",
    "none",
    "-gravity",
    "center",
    "-extent",
    "36x36",
    "-alpha",
    "extract",
    "-level",
    "4%,100%",
    "-fill",
    "gray35",
    "-draw",
    "ellipse 12.9,22.6 2.25,2.55 0,360",
    "-draw",
    "ellipse 25.2,20.6 2.25,2.55 0,360",
    "-fill",
    "white",
    "-draw",
    "ellipse 14.0,23.0 0.9,1.1 0,360",
    "-draw",
    "ellipse 25.1,21.0 0.9,1.1 0,360",
    "(",
    "-size",
    "36x36",
    "xc:black",
    ")",
    "+swap",
    "-alpha",
    "off",
    "-compose",
    "CopyOpacity",
    "-composite",
    `PNG32:${trayIcon}`,
  ]);

  console.log("Generated app icons and macOS tray template from src/assets/logo.png");
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
