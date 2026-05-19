import { expect, test } from "@playwright/test";

import { createAppHarness, pethover } from "./app-harness";

const sectionCases = [
  { section: "agents", heading: "Agent integrations" },
  { section: "preferences", heading: "General" },
  { section: "about", heading: "About" },
  { section: "pets", heading: "Pets" },
] as const;

test("navigate-to-section event activates each settings tab", async ({ browser }) => {
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
  // Default landing tab is Pets.
  await expect(page.getByRole("heading", { name: "Pets" })).toBeVisible();

  for (const { section, heading } of sectionCases) {
    await page.evaluate(
      ({ event, payload }) => {
        (
          window as unknown as {
            __pethoverTestEmit: (e: string, p: unknown) => void;
          }
        ).__pethoverTestEmit(event, payload);
      },
      { event: "pethover-navigate-to-section", payload: section },
    );

    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});
