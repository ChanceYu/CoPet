import { expect, test } from "@playwright/test";

import {
  codexAdapter,
  createAppHarness,
  copet,
} from "./app-harness";

test("default section is Pets on first open", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    adapters: [codexAdapter],
  });
  const page = await harness.openPage("settings");

  await expect(page.getByRole("tab", { name: "Pets" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("button", { name: "Refresh list" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Codex" })).toHaveCount(0);
});

test("clicking Agents shows agent switches and hides pet list", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    adapters: [codexAdapter],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("tab", { name: "Agents" }).click();

  await expect(page.getByRole("tab", { name: "Agents" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("button", { name: "Refresh list" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Codex" })).toBeVisible();
});

test("General exposes display count, language, size, and reset position controls", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser);
  const page = await harness.openPage("settings");

  await page.getByRole("tab", { name: "General" }).click();

  await expect(page.getByRole("radiogroup", { name: "Display count" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Language" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Size" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reset position" }),
  ).toBeVisible();
});

test("Reset position invokes reset_pet_window_position and shows success toast", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser);
  const page = await harness.openPage("settings");

  await page.getByRole("tab", { name: "General" }).click();
  await page.getByRole("button", { name: "Reset position" }).click();

  const successToast = page.getByText("Pet returned to the bottom-right.");
  await expect(successToast).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(successToast).toHaveCount(0, { timeout: 100 });
  expect(harness.calls).toContainEqual({
    command: "reset_pet_window_position",
    args: {},
  });
});

test("Reset position failure shows error toast and re-enables button", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    commandErrors: {
      reset_pet_window_position: "monitor unavailable",
    },
  });
  const page = await harness.openPage("settings");

  await page.getByRole("tab", { name: "General" }).click();
  const button = page.getByRole("button", { name: "Reset position" });
  await button.click();

  await expect(page.getByText("monitor unavailable")).toBeVisible();
  await expect(button).toBeEnabled();
});

test("ArrowDown moves selection through nav items", async ({ browser }) => {
  const harness = await createAppHarness(browser);
  const page = await harness.openPage("settings");

  const petsTab = page.getByRole("tab", { name: "Pets" });
  await petsTab.focus();
  await page.keyboard.press("ArrowDown");

  await expect(page.getByRole("tab", { name: "Agents" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("reopening settings returns to Pets section (non-persistent)", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      locale: "en-US",
      pets: [copet],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("settings");

  await page.getByRole("tab", { name: "About" }).click();
  await expect(page.getByRole("tab", { name: "About" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.reload();

  await expect(page.getByRole("tab", { name: "Pets" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
