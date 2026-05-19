import { expect, test } from "@playwright/test";

import { createAppHarness, pethover } from "./app-harness";

test("pause toggle calls set_response_paused and syncs across windows", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      locale: "en-US",
      localePreference: "en-US",
      pets: [pethover],
      onboardingComplete: false,
      petWindowSize: 30,
      responsePaused: false,
    },
  });

  const settingsPage = await harness.openPage("settings");
  await settingsPage.getByRole("tab", { name: "General" }).click();

  const pauseToggle = settingsPage.getByRole("switch", { name: "Pause messages" });
  await expect(pauseToggle).toHaveAttribute("aria-checked", "false");

  await pauseToggle.click();

  expect(harness.calls).toContainEqual({
    command: "set_response_paused",
    args: { paused: true },
  });
  await expect(pauseToggle).toHaveAttribute("aria-checked", "true");

  await pauseToggle.click();

  expect(
    harness.calls.filter((call) => call.command === "set_response_paused"),
  ).toEqual([
    { command: "set_response_paused", args: { paused: true } },
    { command: "set_response_paused", args: { paused: false } },
  ]);
  await expect(pauseToggle).toHaveAttribute("aria-checked", "false");
});

test("pet visibility switch toggles the pet window", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      locale: "en-US",
      localePreference: "en-US",
      pets: [pethover],
      onboardingComplete: false,
      petWindowSize: 30,
      responsePaused: false,
    },
  });

  const settingsPage = await harness.openPage("settings");
  await settingsPage.getByRole("tab", { name: "General" }).click();

  const visibilityToggle = settingsPage.getByRole("switch", { name: "Show pet" });
  await expect(visibilityToggle).toHaveAttribute("aria-checked", "true");

  await visibilityToggle.click();

  expect(harness.calls).toContainEqual({
    command: "toggle_pet_window_visibility",
    args: {},
  });
  await expect(visibilityToggle).toHaveAttribute("aria-checked", "false");

  await visibilityToggle.click();

  expect(
    harness.calls.filter((call) => call.command === "toggle_pet_window_visibility"),
  ).toHaveLength(2);
  await expect(visibilityToggle).toHaveAttribute("aria-checked", "true");
});

test("pet visibility switch follows system menu visibility changes", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      locale: "en-US",
      localePreference: "en-US",
      pets: [pethover],
      onboardingComplete: false,
      petWindowSize: 30,
      responsePaused: false,
    },
  });

  const settingsPage = await harness.openPage("settings");
  await settingsPage.getByRole("tab", { name: "General" }).click();

  const visibilityToggle = settingsPage.getByRole("switch", { name: "Show pet" });
  await expect(visibilityToggle).toHaveAttribute("aria-checked", "true");

  await settingsPage.evaluate(() => {
    window.__pethoverTestEmit("pethover-pet-window-visibility-changed", false);
  });
  await expect(visibilityToggle).toHaveAttribute("aria-checked", "false");

  await settingsPage.evaluate(() => {
    window.__pethoverTestEmit("pethover-pet-window-visibility-changed", true);
  });
  await expect(visibilityToggle).toHaveAttribute("aria-checked", "true");
});
