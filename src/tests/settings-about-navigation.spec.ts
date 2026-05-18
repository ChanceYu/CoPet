import { expect, test } from "@playwright/test";

import { createAppHarness, pethover } from "./app-harness";

test("navigate-to-section event activates the About tab", async ({ browser }) => {
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

  const page = await harness.openPage("settings");
  // Initial tab is Pets.
  await expect(page.getByRole("heading", { name: "Pets" })).toBeVisible();

  await page.evaluate(({ event, payload }) => {
    (window as unknown as { __pethoverTestEmit: (e: string, p: unknown) => void })
      .__pethoverTestEmit(event, payload);
  }, { event: "pethover-navigate-to-section", payload: "about" });

  await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
});
