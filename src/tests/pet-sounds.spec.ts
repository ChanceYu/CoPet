import { expect, test } from "@playwright/test";

import { createAppHarness, pethoverWithSounds } from "./app-harness";

function soundState({
  responsePaused = false,
  enableClickSounds = true,
}: {
  responsePaused?: boolean;
  enableClickSounds?: boolean;
} = {}) {
  return {
    currentPetId: pethoverWithSounds.id,
    pets: [pethoverWithSounds],
    onboardingComplete: false,
    responsePaused,
    petInteractions: { enableClickSounds, cooldownStyle: "normal" as const },
  };
}

test("enabled interaction sound plays on successful click", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: soundState(),
  });
  const page = await harness.openPage("pet");

  await page.locator(".pet-sprite-frame").dispatchEvent("click", { button: 0, detail: 1 });

  await expect.poll(() => harness.playedAudioUrls(page)).toEqual([
    "/pets/pethover/pethover/audio/click.mp3",
  ]);
});

test("disabled pet sounds suppress interaction playback", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      ...soundState(),
      petInteractions: { enableClickSounds: false, cooldownStyle: "normal" },
    },
  });
  const page = await harness.openPage("pet");

  await page.locator(".pet-sprite-frame").dispatchEvent("click", { button: 0, detail: 1 });
  await page.waitForTimeout(100);

  expect(await harness.playedAudioUrls(page)).toEqual([]);
});

test("cooldown-suppressed gesture does not replay interaction sound", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: soundState(),
  });
  const page = await harness.openPage("pet");
  const spriteFrame = page.locator(".pet-sprite-frame");

  await spriteFrame.dispatchEvent("click", { button: 0, detail: 1 });
  await expect.poll(() => harness.playedAudioUrls(page)).toEqual([
    "/pets/pethover/pethover/audio/click.mp3",
  ]);

  await harness.clearPlayedAudioUrls(page);
  await spriteFrame.dispatchEvent("click", { button: 0, detail: 1 });
  await page.waitForTimeout(100);

  expect(await harness.playedAudioUrls(page)).toEqual([]);
});

test("agent state transition plays mapped agent sound once", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: soundState(),
  });
  const page = await harness.openPage("pet");
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "idle");

  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "running" },
    messages: [{ agent: "codex", displayName: "Codex", text: "editing", updatedAtMs: 1 }],
  });
  await expect.poll(() => harness.playedAudioUrls(page)).toEqual([
    "/pets/pethover/pethover/audio/tap.mp3",
  ]);

  await harness.clearPlayedAudioUrls(page);
  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "running" },
    messages: [{ agent: "codex", displayName: "Codex", text: "still editing", updatedAtMs: 2 }],
  });
  await page.waitForTimeout(100);

  expect(await harness.playedAudioUrls(page)).toEqual([]);
});

test("paused response updates do not play agent sounds", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: soundState({ responsePaused: true }),
  });
  const page = await harness.openPage("pet");
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "idle");

  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "jumping" },
    messages: [{ agent: "codex", displayName: "Codex", text: "thinking", updatedAtMs: 1 }],
  });
  await page.waitForTimeout(100);

  expect(await harness.playedAudioUrls(page)).toEqual([]);
});

test("initial non-silent runtime state does not play agent sound on render", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    runtimeStatus: {
      port: 8765,
      endpoint: "http://127.0.0.1:8765/v1/events",
      currentState: { state: "running", sinceMs: 0, idleAfterMs: null },
      messages: [{ agent: "codex", displayName: "Codex", text: "editing", updatedAtMs: 1 }],
      acceptedEvents: 0,
      rejectedEvents: 0,
    },
    state: soundState(),
  });
  const page = await harness.openPage("pet");

  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "running");
  await page.waitForTimeout(100);

  expect(await harness.playedAudioUrls(page)).toEqual([]);
});

test("enabling sounds while already non-silent waits for next state transition", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    runtimeStatus: {
      port: 8765,
      endpoint: "http://127.0.0.1:8765/v1/events",
      currentState: { state: "running", sinceMs: 0, idleAfterMs: null },
      messages: [{ agent: "codex", displayName: "Codex", text: "editing", updatedAtMs: 1 }],
      acceptedEvents: 0,
      rejectedEvents: 0,
    },
    state: soundState({ enableClickSounds: false }),
  });
  const page = await harness.openPage("pet");
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "running");

  await page.evaluate(() =>
    window.__pethoverInvoke("set_pet_interactions", {
      prefs: { enableClickSounds: true, cooldownStyle: "normal" },
    }),
  );
  await page.waitForTimeout(100);

  expect(await harness.playedAudioUrls(page)).toEqual([]);

  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "review" },
    messages: [{ agent: "codex", displayName: "Codex", text: "reviewing", updatedAtMs: 2 }],
  });

  await expect.poll(() => harness.playedAudioUrls(page)).toEqual([
    "/pets/pethover/pethover/audio/peek.mp3",
  ]);
});

test("paused initial non-silent runtime state does not play agent sound", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    runtimeStatus: {
      port: 8765,
      endpoint: "http://127.0.0.1:8765/v1/events",
      currentState: { state: "jumping", sinceMs: 0, idleAfterMs: null },
      messages: [{ agent: "codex", displayName: "Codex", text: "thinking", updatedAtMs: 1 }],
      acceptedEvents: 0,
      rejectedEvents: 0,
    },
    state: soundState({ responsePaused: true }),
  });
  const page = await harness.openPage("pet");

  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "waiting");
  await page.waitForTimeout(100);

  expect(await harness.playedAudioUrls(page)).toEqual([]);
});
