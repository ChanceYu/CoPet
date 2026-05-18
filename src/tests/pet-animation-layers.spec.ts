import { expect, test } from "@playwright/test";

import { createAppHarness, pethover } from "./app-harness";
import { composeLayers } from "../lib/petAnimation";

test("idle backend state renders idle sprite row and no emotion overlay", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: { currentPetId: pethover.id, pets: [pethover], onboardingComplete: false },
  });
  const page = await harness.openPage("pet");
  const sprite = page.locator(".pet-sprite");
  const frame = page.locator(".pet-sprite-frame");

  await expect(sprite).toHaveAttribute("data-pet-state", "idle");
  await expect(frame).toHaveAttribute("data-emotion", "");
});

test("user.prompt → waiting row + loading-bubble overlay", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: { currentPetId: pethover.id, pets: [pethover], onboardingComplete: false },
  });
  const page = await harness.openPage("pet");
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "idle");

  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "jumping" },
    messages: [
      { agent: "claude-code", displayName: "Claude Code", text: "thinking", updatedAtMs: 1 },
    ],
  });

  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "waiting");
  await expect(page.locator(".pet-sprite-frame")).toHaveAttribute(
    "data-emotion",
    "loading-bubble",
  );
  await expect(page.locator('[data-testid="pet-emotion-overlay"]')).toBeVisible();
});

test("tool.before with Edit → running row", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: { currentPetId: pethover.id, pets: [pethover], onboardingComplete: false },
  });
  const page = await harness.openPage("pet");
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "idle");
  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "running" },
    messages: [{ agent: "codex", displayName: "Codex", text: "editing", updatedAtMs: 1 }],
  });
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "running");
});

test("review/inspecting state (e.g. cargo test resolved server-side) renders review row", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: { currentPetId: pethover.id, pets: [pethover], onboardingComplete: false },
  });
  const page = await harness.openPage("pet");
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "idle");
  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "review" },
    messages: [
      { agent: "claude-code", displayName: "Claude Code", text: "inspecting", updatedAtMs: 1 },
    ],
  });
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "review");
});

test("session.stop → waving + sparkle overlay, sparkle clears", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: { currentPetId: pethover.id, pets: [pethover], onboardingComplete: false },
  });
  const page = await harness.openPage("pet");
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "idle");
  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "waving" },
    messages: [{ agent: "codex", displayName: "Codex", text: "done", updatedAtMs: 1 }],
  });

  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "waving");
  await expect(page.locator(".pet-sprite-frame")).toHaveAttribute("data-emotion", "sparkle");

  await page.waitForTimeout(900);
  await expect(page.locator(".pet-sprite-frame")).toHaveAttribute("data-emotion", "");
});

test("session.error → failed + smoke overlay, smoke clears", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: { currentPetId: pethover.id, pets: [pethover], onboardingComplete: false },
  });
  const page = await harness.openPage("pet");
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "idle");
  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "failed" },
    messages: [{ agent: "codex", displayName: "Codex", text: "error", updatedAtMs: 1 }],
  });

  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "failed");
  await expect(page.locator(".pet-sprite-frame")).toHaveAttribute("data-emotion", "smoke");

  await page.waitForTimeout(1_100);
  await expect(page.locator(".pet-sprite-frame")).toHaveAttribute("data-emotion", "");
});

test("permission.waiting → waiting row, no overlay", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: { currentPetId: pethover.id, pets: [pethover], onboardingComplete: false },
  });
  const page = await harness.openPage("pet");
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "idle");
  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "waiting" },
    messages: [
      { agent: "claude-code", displayName: "Claude Code", text: "awaiting", updatedAtMs: 1 },
    ],
  });
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "waiting");
  await expect(page.locator(".pet-sprite-frame")).toHaveAttribute("data-emotion", "");
});

test("hover overrides agent editing with looking sprite", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: { currentPetId: pethover.id, pets: [pethover], onboardingComplete: false },
  });
  const page = await harness.openPage("pet");
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "idle");
  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "running" },
    messages: [{ agent: "codex", displayName: "Codex", text: "editing", updatedAtMs: 1 }],
  });
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "running");

  const frame = page.locator(".pet-sprite-frame");
  const box = await frame.boundingBox();
  if (!box) throw new Error("pet sprite frame not laid out");
  await frame.dispatchEvent("pointerover", {
    clientX: box.x + box.width * 0.8,
    clientY: box.y + box.height / 2,
    pointerType: "mouse",
    isPrimary: true,
    pointerId: 1,
    bubbles: true,
  });
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "running-right");
});

test("drag suppresses emotion overlay even during agent thinking", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: { currentPetId: pethover.id, pets: [pethover], onboardingComplete: false },
  });
  const page = await harness.openPage("pet");
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "idle");
  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "jumping" },
    messages: [
      { agent: "claude-code", displayName: "Claude Code", text: "thinking", updatedAtMs: 1 },
    ],
  });
  const frame = page.locator(".pet-sprite-frame");
  await expect(frame).toHaveAttribute("data-emotion", "loading-bubble");

  await frame.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 50,
    clientY: 50,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
    detail: 1,
  });
  await expect(frame).toHaveAttribute("data-dragging", "true");
  await expect(frame).toHaveAttribute("data-emotion", "");

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 } as PointerEventInit));
  });
  await expect(frame).toHaveAttribute("data-dragging", "false");
});

test("reduced motion still renders emotion overlay element", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: { currentPetId: pethover.id, pets: [pethover], onboardingComplete: false },
  });
  const page = await harness.openPage("pet");
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "idle");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "jumping" },
    messages: [
      { agent: "claude-code", displayName: "Claude Code", text: "thinking", updatedAtMs: 1 },
    ],
  });
  await expect(page.locator('[data-testid="pet-emotion-overlay"]')).toBeVisible();
});

// ---------- Unit tests for new input/emotion variants ----------

test("composeLayers maps surprised → waving with no overlay by default", () => {
  const view = composeLayers({
    base: { kind: "blink" },
    agent: { kind: "none" },
    input: { kind: "surprised" },
    motion: { kind: "anchored" },
    emotion: { kind: "none" },
  });
  expect(view.bodySpriteRow).toBe("waving");
});

test("composeLayers maps petted → jumping", () => {
  const view = composeLayers({
    base: { kind: "blink" },
    agent: { kind: "none" },
    input: { kind: "petted" },
    motion: { kind: "anchored" },
    emotion: { kind: "heart" },
  });
  expect(view.bodySpriteRow).toBe("jumping");
  expect(view.emotionOverlay).toBe("heart");
});

test("composeLayers maps pettedSlow → waiting", () => {
  const view = composeLayers({
    base: { kind: "blink" },
    agent: { kind: "none" },
    input: { kind: "pettedSlow" },
    motion: { kind: "anchored" },
    emotion: { kind: "heart" },
  });
  expect(view.bodySpriteRow).toBe("waiting");
  expect(view.emotionOverlay).toBe("heart");
});

test("composeLayers maps questionMark overlay through", () => {
  const view = composeLayers({
    base: { kind: "blink" },
    agent: { kind: "none" },
    input: { kind: "surprised" },
    motion: { kind: "anchored" },
    emotion: { kind: "questionMark" },
  });
  expect(view.emotionOverlay).toBe("question-mark");
});
