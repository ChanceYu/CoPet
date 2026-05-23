import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  copet,
  copetAudioPack,
  createAppHarness,
  retroAudioPack,
} from "./app-harness";

const customRetroAudioPack = {
  ...retroAudioPack,
  id: "user:retro",
  builtIn: false,
};

const expectEnglishSoundPackOptions = async (page: Page) => {
  await expect(page.getByText("Built-in sounds")).toBeVisible();
  await expect(page.getByText("Custom sounds")).toBeVisible();
  await expect(page.getByRole("option", { name: "CoPet" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Retro" })).toBeVisible();
};

test("settings groups built-in and custom sound packs", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      currentAudioPackId: copetAudioPack.id,
      locale: "en-US",
      pets: [copet],
      audioPacks: [copetAudioPack, customRetroAudioPack],
      onboardingComplete: false,
      petInteractions: { enableClickSounds: false, cooldownStyle: "normal" },
    },
  });

  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();
  const soundPack = page.getByRole("combobox", { name: "Sound pack" });
  await expect(soundPack).toBeEnabled();
  await soundPack.click();

  await expectEnglishSoundPackOptions(page);
  await expect(page.getByText("system:copet")).toHaveCount(0);
  await expect(page.getByText("user:retro")).toHaveCount(0);
});

test("settings groups Chinese built-in and custom sound packs", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      currentAudioPackId: copetAudioPack.id,
      locale: "zh-CN",
      pets: [copet],
      audioPacks: [copetAudioPack, customRetroAudioPack],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "通用" }).click();
  await page.getByRole("combobox", { name: "音效包" }).click();

  await expect(page.getByText("内置音效")).toBeVisible();
  await expect(page.getByText("自定义音效")).toBeVisible();
  await expect(page.getByRole("option", { name: "CoPet" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Retro" })).toBeVisible();
  await expect(page.getByText("system:copet")).toHaveCount(0);
  await expect(page.getByText("user:retro")).toHaveCount(0);
});

test("sound pack dropdown opens with keyboard and closes with escape", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      currentAudioPackId: copetAudioPack.id,
      locale: "en-US",
      pets: [copet],
      audioPacks: [copetAudioPack, customRetroAudioPack],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();

  const soundPack = page.getByRole("combobox", { name: "Sound pack" });
  for (const key of ["ArrowDown", "Enter", "Space"]) {
    await soundPack.focus();
    await page.keyboard.press(key);

    await expect(page.getByRole("listbox")).toBeVisible();
    await expectEnglishSoundPackOptions(page);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
  }
});

test("selecting a sound pack persists runtime id", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      currentAudioPackId: copetAudioPack.id,
      locale: "en-US",
      pets: [copet],
      audioPacks: [copetAudioPack, customRetroAudioPack],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();

  const soundPack = page.getByRole("combobox", { name: "Sound pack" });
  await soundPack.click();
  await page.getByRole("option", { name: "Retro" }).click();

  await expect(soundPack).toContainText("Retro");
  expect(harness.calls).toContainEqual({
    command: "select_audio_pack",
    args: { audioPackId: "user:retro" },
  });
});

test("sound pack selection blocks duplicate selections while pending", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    commandDelayMs: { select_audio_pack: 300 },
    state: {
      currentPetId: copet.id,
      currentAudioPackId: copetAudioPack.id,
      locale: "en-US",
      pets: [copet],
      audioPacks: [copetAudioPack, customRetroAudioPack],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();

  const soundPack = page.getByRole("combobox", { name: "Sound pack" });
  await soundPack.click();
  await page.getByRole("option", { name: "Retro" }).click();

  await expect(soundPack).toBeDisabled();
  expect(harness.calls.filter((call) => call.command === "select_audio_pack")).toHaveLength(1);

  await expect(soundPack).toBeEnabled();
  expect(harness.calls.filter((call) => call.command === "select_audio_pack")).toHaveLength(1);
});

test("no sound packs disables dropdown", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      currentAudioPackId: "",
      locale: "en-US",
      pets: [copet],
      audioPacks: [],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();

  const soundPack = page.getByRole("combobox", { name: "Sound pack" });
  await expect(soundPack).toBeDisabled();
  await expect(soundPack).toContainText("No sound packs");
});
