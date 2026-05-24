import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  copet,
  copetSoundPack,
  createAppHarness,
  retroSoundPack,
} from "./app-harness";

const customRetroSoundPack = {
  ...retroSoundPack,
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
      currentSoundPackId: copetSoundPack.id,
      locale: "en-US",
      pets: [copet],
      soundPacks: [copetSoundPack, customRetroSoundPack],
      onboardingComplete: false,
      petInteractions: { enableClickSounds: false, cooldownStyle: "normal", enableStartupAnimation: true },
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

test("sound pack dropdown is grouped before the pet sounds switch", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      currentSoundPackId: copetSoundPack.id,
      locale: "en-US",
      pets: [copet],
      soundPacks: [copetSoundPack, customRetroSoundPack],
      onboardingComplete: false,
      petInteractions: { enableClickSounds: false, cooldownStyle: "normal", enableStartupAnimation: true },
    },
  });

  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();

  const groupedBeforeSwitch = await page.evaluate(() => {
    const soundPack = document.querySelector(
      '[role="combobox"][aria-label="Sound pack"]',
    );
    const petSounds = document.querySelector(
      '[role="switch"][aria-label="Pet sounds"]',
    );

    if (!soundPack || !petSounds) {
      return false;
    }

    const sameRow =
      soundPack.closest(".settings-preferences-row") ===
      petSounds.closest(".settings-preferences-row");
    const beforeSwitch = Boolean(
      soundPack.compareDocumentPosition(petSounds) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );

    return sameRow && beforeSwitch;
  });

  expect(groupedBeforeSwitch).toBe(true);
});

test("settings groups Chinese built-in and custom sound packs", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      currentSoundPackId: copetSoundPack.id,
      locale: "zh-CN",
      pets: [copet],
      soundPacks: [copetSoundPack, customRetroSoundPack],
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
      currentSoundPackId: copetSoundPack.id,
      locale: "en-US",
      pets: [copet],
      soundPacks: [copetSoundPack, customRetroSoundPack],
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
      currentSoundPackId: copetSoundPack.id,
      locale: "en-US",
      pets: [copet],
      soundPacks: [copetSoundPack, customRetroSoundPack],
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
    command: "select_sound_pack",
    args: { soundPackId: "user:retro" },
  });
});

test("sound pack selection blocks duplicate selections while pending", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    commandDelayMs: { select_sound_pack: 300 },
    state: {
      currentPetId: copet.id,
      currentSoundPackId: copetSoundPack.id,
      locale: "en-US",
      pets: [copet],
      soundPacks: [copetSoundPack, customRetroSoundPack],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();

  const soundPack = page.getByRole("combobox", { name: "Sound pack" });
  await soundPack.click();
  await page.getByRole("option", { name: "Retro" }).click();

  await expect(soundPack).toBeDisabled();
  expect(harness.calls.filter((call) => call.command === "select_sound_pack")).toHaveLength(1);

  await expect(soundPack).toBeEnabled();
  expect(harness.calls.filter((call) => call.command === "select_sound_pack")).toHaveLength(1);
});

test("no sound packs disables dropdown", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      currentSoundPackId: "",
      locale: "en-US",
      pets: [copet],
      soundPacks: [],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();

  const soundPack = page.getByRole("combobox", { name: "Sound pack" });
  await expect(soundPack).toBeDisabled();
  await expect(soundPack).toContainText("No sound packs");
});
