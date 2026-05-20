#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.resolve(scriptDir, "../references/sticker-examples");

const petStates = new Set([
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review",
]);

const agentStates = new Set([
  "none",
  "thinking",
  "editing",
  "inspecting",
  "awaitingApproval",
  "celebrating",
  "hurt",
]);

const emotionStates = new Set([
  "none",
  "loadingBubble",
  "sparkle",
  "smoke",
  "heart",
  "questionMark",
]);

const allowedTopLevelKeys = new Set([
  "id",
  "displayName",
  "displayNameZh",
  "schemaVersion",
  "kind",
  "slot",
  "animationPath",
  "viewBox",
  "playback",
  "trigger",
  "visibility",
]);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertString(value, name) {
  assert(typeof value === "string" && value.trim().length > 0, `${name} must be a non-empty string`);
}

function assertArraySubset(value, legal, name) {
  assert(Array.isArray(value), `${name} must be an array`);
  for (const item of value) {
    assert(typeof item === "string", `${name} entries must be strings`);
    assert(legal.has(item), `${name} contains illegal value ${JSON.stringify(item)}`);
  }
}

function assertSafeRelativeSvgPath(value, name) {
  assertString(value, name);
  assert(value.endsWith(".svg"), `${name} must end with .svg`);
  assert(!path.isAbsolute(value), `${name} must be relative`);
  assert(!value.includes("\\"), `${name} must use forward-slash paths`);
  const parts = value.split("/");
  assert(parts.length === 1, `${name} must stay in the example directory`);
  assert(!parts.includes(".."), `${name} must not contain ..`);
}

function parseJson(source, label) {
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`${label} is not well-formed JSON: ${error.message}`);
  }
}

function tagName(rawTag) {
  const match = rawTag.match(/^<\/?\s*([A-Za-z_][A-Za-z0-9_.:-]*)/);
  return match ? match[1] : null;
}

function assertXmlLooksWellFormed(svg, label) {
  const stack = [];
  const tagRegex = /<[^>]+>/g;
  for (const match of svg.matchAll(tagRegex)) {
    const rawTag = match[0];
    if (rawTag.startsWith("<!--") || rawTag.startsWith("<!DOCTYPE") || rawTag.startsWith("<?")) continue;
    const name = tagName(rawTag);
    assert(name, `${label} has malformed tag ${rawTag}`);
    if (rawTag.startsWith("</")) {
      const expected = stack.pop();
      assert(expected === name, `${label} closes </${name}> while <${expected}> is open`);
      continue;
    }
    if (rawTag.endsWith("/>")) continue;
    stack.push(name);
  }
  assert(stack.length === 0, `${label} has unclosed tags: ${stack.join(", ")}`);
}

function isIgnorableMarkup(rawTag) {
  return rawTag.startsWith("<!--") || rawTag.startsWith("<!") || rawTag.startsWith("<?");
}

function rootElementInfo(svg, label) {
  const tagRegex = /<[^>]+>/g;
  let cursor = 0;
  let rootTag = null;
  let rootDepth = 0;
  for (const match of svg.matchAll(tagRegex)) {
    assert(svg.slice(cursor, match.index).trim().length === 0, `${label} has content before root element`);
    const rawTag = match[0];
    cursor = match.index + rawTag.length;
    if (isIgnorableMarkup(rawTag)) continue;
    assert(!rawTag.startsWith("</"), `${label} first real element must be <svg>`);
    const name = tagName(rawTag);
    assert(name === "svg", `${label} first real element must be <svg>`);
    rootTag = rawTag;
    rootDepth = rawTag.endsWith("/>") ? 0 : 1;
    break;
  }
  assert(rootTag, `${label} root element is missing`);

  const afterRootStart = cursor;
  for (const match of svg.slice(afterRootStart).matchAll(tagRegex)) {
    const absoluteIndex = afterRootStart + match.index;
    if (rootDepth === 0) {
      assert(svg.slice(cursor, absoluteIndex).trim().length === 0, `${label} has non-whitespace content outside root element`);
    }
    const rawTag = match[0];
    cursor = absoluteIndex + rawTag.length;
    if (isIgnorableMarkup(rawTag)) continue;
    const name = tagName(rawTag);
    assert(name, `${label} has malformed tag ${rawTag}`);
    if (rootDepth === 0) fail(`${label} has more than one root element`);
    if (rawTag.startsWith("</")) {
      rootDepth -= 1;
      continue;
    }
    if (!rawTag.endsWith("/>")) rootDepth += 1;
  }
  if (rootDepth === 0) {
    assert(svg.slice(cursor).trim().length === 0, `${label} has non-whitespace content outside root element`);
  }

  return rootTag;
}

function parseRootViewBox(rootTag, label) {
  const match = rootTag.match(/\bviewBox="0 0 ([0-9]+) ([0-9]+)"/i);
  assert(match, `${label} root must have viewBox="0 0 W H"`);
  return {
    width: Number.parseInt(match[1], 10),
    height: Number.parseInt(match[2], 10),
  };
}

function validateManifest(manifest, label) {
  for (const key of Object.keys(manifest)) {
    assert(allowedTopLevelKeys.has(key), `${label} has unexpected key ${key}`);
  }

  assertString(manifest.id, `${label}.id`);
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id), `${label}.id must be kebab-case`);
  assertString(manifest.displayName, `${label}.displayName`);
  assertString(manifest.displayNameZh, `${label}.displayNameZh`);
  assert(manifest.schemaVersion === 1, `${label}.schemaVersion must be 1`);
  assert(["persistent", "burst"].includes(manifest.kind), `${label}.kind must be persistent or burst`);
  assert(["behind", "over", "corner"].includes(manifest.slot), `${label}.slot must be behind, over, or corner`);
  assertSafeRelativeSvgPath(manifest.animationPath, `${label}.animationPath`);

  assert(typeof manifest.viewBox === "object" && manifest.viewBox !== null, `${label}.viewBox is required`);
  assert(Number.isInteger(manifest.viewBox.width) && manifest.viewBox.width > 0, `${label}.viewBox.width must be positive integer`);
  assert(Number.isInteger(manifest.viewBox.height) && manifest.viewBox.height > 0, `${label}.viewBox.height must be positive integer`);

  assert(typeof manifest.playback === "object" && manifest.playback !== null, `${label}.playback is required`);
  assert(typeof manifest.playback.loop === "boolean", `${label}.playback.loop must be boolean`);
  assert(typeof manifest.playback.speed === "number" && manifest.playback.speed > 0, `${label}.playback.speed must be positive number`);

  if (manifest.kind === "burst") {
    assert(manifest.trigger && typeof manifest.trigger === "object", `${label}.trigger is required for burst stickers`);
    assert(manifest.visibility === undefined, `${label}.visibility is forbidden for burst stickers`);
    const triggerKeys = Object.keys(manifest.trigger);
    assert(triggerKeys.every((key) => ["states", "agentStates", "emotions"].includes(key)), `${label}.trigger has illegal keys`);
    if (manifest.trigger.states !== undefined) assertArraySubset(manifest.trigger.states, petStates, `${label}.trigger.states`);
    if (manifest.trigger.agentStates !== undefined) assertArraySubset(manifest.trigger.agentStates, agentStates, `${label}.trigger.agentStates`);
    if (manifest.trigger.emotions !== undefined) assertArraySubset(manifest.trigger.emotions, emotionStates, `${label}.trigger.emotions`);
    const hasBinding = ["states", "agentStates", "emotions"].some(
      (key) => Array.isArray(manifest.trigger[key]) && manifest.trigger[key].length > 0,
    );
    assert(hasBinding, `${label}.trigger must contain at least one non-empty binding array`);
  }

  if (manifest.kind === "persistent") {
    assert(manifest.trigger === undefined, `${label}.trigger is forbidden for persistent stickers`);
    assert(manifest.visibility && typeof manifest.visibility === "object", `${label}.visibility is required for persistent stickers`);
    assertArraySubset(manifest.visibility.states, petStates, `${label}.visibility.states`);
    assert(manifest.visibility.states.length > 0, `${label}.visibility.states must not be empty`);
  }
}

function validateSvg(svg, label, sizeBytes, expectedViewBox) {
  assert(sizeBytes <= 64 * 1024, `${label} exceeds 64 KB`);
  assertXmlLooksWellFormed(svg, label);
  const rootTag = rootElementInfo(svg, label);
  assert(/\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/i.test(rootTag), `${label} root must be SVG with xmlns`);
  const rootViewBox = parseRootViewBox(rootTag, label);
  assert(rootViewBox.width === expectedViewBox.width, `${label} root viewBox width must match manifest viewBox.width`);
  assert(rootViewBox.height === expectedViewBox.height, `${label} root viewBox height must match manifest viewBox.height`);
  assert(!/\bwidth=/i.test(rootTag), `${label} root must not set width`);
  assert(!/\bheight=/i.test(rootTag), `${label} root must not set height`);
  assert(!/<(?:script|foreignObject|iframe|image)\b/i.test(svg), `${label} contains a forbidden element`);

  const hrefRegex = /\b(?:href|xlink:href)\s*=\s*["']([^"']+)["']/gi;
  for (const match of svg.matchAll(hrefRegex)) {
    const href = match[1];
    assert(!/^[a-z][a-z0-9+.-]*:/i.test(href), `${label} contains external href ${href}`);
  }

  assert(!/@font-face\b/i.test(svg), `${label} contains forbidden @font-face`);
  assert(!/@import\b/i.test(svg), `${label} contains forbidden CSS @import`);

  const cssUrlRegex = /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;
  for (const match of svg.matchAll(cssUrlRegex)) {
    const url = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    assert(!/^[a-z][a-z0-9+.-]*:/i.test(url), `${label} contains external CSS url ${url}`);
  }

  assert(/<(?:animate|animateTransform|animateMotion)\b/i.test(svg) || /@keyframes\b/.test(svg), `${label} must contain SMIL animation or CSS keyframes`);
  assert(/prefers-reduced-motion\s*:\s*reduce/i.test(svg), `${label} must include prefers-reduced-motion fallback`);
}

async function main() {
  const dirInfo = await stat(examplesDir).catch(() => null);
  assert(dirInfo?.isDirectory(), `missing examples directory: ${examplesDir}`);

  const entries = await readdir(examplesDir);
  const files = entries.filter((entry) => !entry.startsWith(".")).sort();
  assert(files.length > 0, "no sticker examples found");
  assert(files.every((entry) => entry.endsWith(".json") || entry.endsWith(".svg")), "examples directory may contain only .json and .svg files");

  const manifests = files.filter((entry) => entry.endsWith(".json"));
  const svgFiles = files.filter((entry) => entry.endsWith(".svg"));
  assert(manifests.length === 8, `expected 8 sticker example manifests, found ${manifests.length}`);
  assert(svgFiles.length === 8, `expected 8 sticker example SVGs, found ${svgFiles.length}`);

  const referencedSvgs = new Set();

  for (const manifestFile of manifests) {
    const manifestPath = path.join(examplesDir, manifestFile);
    const manifest = parseJson(await readFile(manifestPath, "utf8"), manifestFile);
    validateManifest(manifest, manifestFile);

    const svgFile = manifest.animationPath;
    assert(svgFiles.includes(svgFile), `${manifestFile} references missing SVG ${svgFile}`);
    assert(!referencedSvgs.has(svgFile), `${svgFile} is referenced by more than one manifest`);
    referencedSvgs.add(svgFile);
    const svgPath = path.join(examplesDir, svgFile);
    const svgBuffer = await readFile(svgPath);
    validateSvg(svgBuffer.toString("utf8"), svgFile, svgBuffer.byteLength, manifest.viewBox);
  }

  const unreferencedSvgs = svgFiles.filter((svgFile) => !referencedSvgs.has(svgFile));
  assert(unreferencedSvgs.length === 0, `unreferenced sticker example SVGs: ${unreferencedSvgs.join(", ")}`);

  console.log(`Validated ${manifests.length} sticker examples`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
