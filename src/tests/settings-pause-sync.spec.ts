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
