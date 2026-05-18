import { expect, test } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  codexAdapter,
  createAppHarness,
  goku,
  nebula,
  pethover,
} from "./app-harness";

test("agent integration switch installs and uninstalls an adapter", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    adapters: [codexAdapter],
  });
  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "Agents" }).click();
  const codexSwitch = page.getByRole("switch", { name: "Codex" });

  await expect(codexSwitch).toHaveAttribute("aria-checked", "false");
  await codexSwitch.click();
  await expect(codexSwitch).toHaveAttribute("aria-checked", "true");

  await codexSwitch.click();
  await expect(codexSwitch).toHaveAttribute("aria-checked", "false");

  expect(harness.calls).toContainEqual({
    command: "install_agent_adapter",
    args: { adapterId: "codex" },
  });
  expect(harness.calls).toContainEqual({
    command: "uninstall_agent_adapter",
    args: { adapterId: "codex" },
  });
});

test("agent integration switch stays off and shows a toast when install fails", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    adapters: [codexAdapter],
    commandErrors: {
      install_agent_adapter: "Codex is not installed or not available on PATH",
    },
  });
  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "Agents" }).click();
  const codexSwitch = page.getByRole("switch", { name: "Codex" });

  await expect(codexSwitch).toHaveAttribute("aria-checked", "false");
  await codexSwitch.click();

  await expect(codexSwitch).toHaveAttribute("aria-checked", "false");
  await expect(
    page.getByText("Codex is not installed or not available on PATH"),
  ).toBeVisible();
  expect(harness.calls).toContainEqual({
    command: "install_agent_adapter",
    args: { adapterId: "codex" },
  });
});

test("settings page uses Chinese copy from app locale", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      locale: "zh-CN",
      pets: [pethover],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");

  await expect(page.getByRole("heading", { name: "宠物" })).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新列表" })).toBeVisible();
  await expect(page.getByRole("button", { name: "导入文件夹" })).toBeVisible();
  await expect(page.getByRole("button", { name: "关闭" })).toBeVisible();

  await page.getByRole("tab", { name: "偏好" }).click();
  await expect(page.getByRole("slider", { name: "尺寸" })).toBeVisible();
});

test("settings page uses English copy from app locale", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      locale: "en-US",
      pets: [pethover],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");

  await expect(page.getByText("Language", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Runtime Port", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Runtime endpoint and event counters.")).toHaveCount(0);
  await expect(page.getByText("Accepted")).toHaveCount(0);
  await expect(page.getByText("Rejected")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Pets" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh list" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import folder" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();

  await page.getByRole("tab", { name: "Preferences" }).click();
  await expect(page.getByRole("slider", { name: "Size" })).toBeVisible();
});

test("language switch persists preference and updates settings copy", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      locale: "en-US",
      localePreference: "en-US",
      pets: [pethover],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "Preferences" }).click();

  const languageSelect = page.getByRole("combobox", { name: "Language" });
  await expect(page.locator("select#locale-preference-select")).toHaveCount(0);
  await expect(languageSelect).toHaveText("English");
  await expect(page.getByText("Choose the display language for PetHover.")).toHaveCount(0);

  await languageSelect.click();
  await page.getByRole("option", { name: "中文" }).click();

  await expect(page.getByRole("combobox", { name: "语言" })).toHaveText("中文");
  await expect(page.getByText("选择 PetHover 的显示语言。")).toHaveCount(0);
  expect(harness.calls).toContainEqual({
    command: "set_locale_preference",
    args: { localePreference: "zh-CN" },
  });
});

test("refresh list reloads settings data", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    commandDelayMs: {
      get_app_state: 1_000,
      list_codex_pets: 1_000,
    },
    state: {
      currentPetId: pethover.id,
      locale: "en-US",
      pets: [pethover],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");
  const initialLoads = harness.calls.filter((call) => call.command === "get_app_state").length;
  const refreshButton = page.getByRole("button", { name: "Refresh list" });
  const refreshIcon = refreshButton.locator("svg");

  await expect(refreshButton).toHaveAttribute("aria-busy", "false");
  await expect(refreshIcon).toHaveAttribute("data-loading", "false");

  await refreshButton.click();

  await expect(refreshButton).toHaveAttribute("aria-busy", "true");
  await expect(refreshIcon).toHaveAttribute("data-loading", "true");

  await expect(page.getByRole("heading", { name: "Pets" })).toBeVisible({ timeout: 100 });
  await expect
    .poll(() => harness.calls.filter((call) => call.command === "get_app_state").length)
    .toBeGreaterThan(initialLoads);
  await expect(refreshButton).toHaveAttribute("aria-busy", "false");
  await expect(refreshIcon).toHaveAttribute("data-loading", "false");
});

test("removing an installed non-current pet refreshes the installed list", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover, goku],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("settings");
  const card = page.locator(".pet-card").filter({ hasText: "Goku" });

  await card.hover();
  await card.getByTitle("Remove").click();

  await expect(page.getByRole("button", { name: /goku/i })).toHaveCount(0);
  expect(harness.calls).toContainEqual({
    command: "remove_pet",
    args: { petId: "goku" },
  });
});

test("the current installed pet is marked active and cannot be removed", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: goku.id,
      pets: [pethover, goku],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("settings");
  const card = page.locator(".pet-card").filter({ hasText: "Goku" });

  await expect(card.getByTitle("Current pet")).toBeVisible();
  await expect(card.getByTitle("Remove")).toHaveCount(0);
});

test("pet package cards render animated sprite previews", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover, goku],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("settings");
  const installedSprite = page
    .locator(".pet-card")
    .filter({ hasText: "Goku" })
    .locator(".pet-sprite");

  await expect(installedSprite).toHaveAttribute("data-animated", "true");
});

test("pet window size setting uses a slider and updates the pet window", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
      petWindowSize: 70,
    },
  });
  const settings = await harness.openPage("settings");
  await settings.getByRole("tab", { name: "Preferences" }).click();
  const sizeSlider = settings.getByRole("slider", { name: "Size" });

  await expect(settings.getByText("Pet Window Size")).toHaveCount(0);
  await expect(settings.getByText("Size")).toBeVisible();
  await expect(sizeSlider).toBeVisible();
  await expect(sizeSlider).toHaveAttribute("min", "1");
  await expect(sizeSlider).toHaveAttribute("max", "100");
  await expect(sizeSlider).toHaveAttribute("step", "1");
  await expect(sizeSlider).toHaveValue("70");
  await expect(settings.getByRole("button", { name: "中等" })).toHaveCount(0);
  await expect(settings.getByRole("button", { name: "大", exact: true })).toHaveCount(0);

  await sizeSlider.evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "90");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  expect(harness.calls).toContainEqual({
    command: "set_pet_window_size",
    args: { size: 90 },
  });
  await expect(sizeSlider).toHaveValue("90");
});

test("importing a local pet folder calls the import command", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser);
  const page = await harness.openPage("settings");
  const petDir = await mkdtemp(join(tmpdir(), "pethover-local-pet-"));
  const manifest = JSON.stringify({
    id: "local-fox",
    slug: "local-fox",
    displayName: "Local Fox",
    description: "Imported from a local folder.",
    frameWidth: 192,
    frameHeight: 208,
    gridColumns: 8,
    gridRows: 9,
  });
  await writeFile(join(petDir, "pet.json"), manifest);
  await writeFile(join(petDir, "spritesheet.webp"), "sprite");
  const localFolderInput = page.locator('input[type="file"]');

  await expect(localFolderInput).toHaveAttribute("directory", "");
  await expect(localFolderInput).toHaveAttribute("webkitdirectory", "");
  await localFolderInput.setInputFiles(petDir);

  await expect(page.getByRole("button", { name: /local fox/i })).toBeVisible();
  expect(harness.calls).toContainEqual(
    expect.objectContaining({
      command: "import_pet_files",
      args: expect.objectContaining({
        manifestJson: manifest,
        spriteFileName: "spritesheet.webp",
      }),
    }),
  );
});

test("import local button opens a native directory dialog", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    dialogOpenPath: "/tmp/dialog-pet",
  });
  const page = await harness.openPage("settings");
  await page.evaluate(() => {
    window.__pethoverScrolledPetIds = [];
    Element.prototype.scrollIntoView = function () {
      const petId = (this as HTMLElement).dataset.petId;
      if (petId) {
        window.__pethoverScrolledPetIds.push(petId);
      }
    };
  });

  await page.getByRole("button", { name: "Import folder" }).click();

  expect(harness.calls).toContainEqual({
    command: "plugin:dialog|open",
    args: {
      options: expect.objectContaining({
        canCreateDirectories: false,
        directory: true,
        multiple: false,
        title: "Import folder",
      }),
    },
  });
  await expect(page.getByRole("button", { name: /dialog pet/i })).toBeVisible();
  expect(harness.calls).toContainEqual({
    command: "import_pet_folder",
    args: { folderPath: "/tmp/dialog-pet" },
  });
});

test("invalid local pet folder shows a toast and skips import", async ({ browser }) => {
  const harness = await createAppHarness(browser);
  const page = await harness.openPage("settings");
  const petDir = await mkdtemp(join(tmpdir(), "pethover-invalid-pet-"));
  await writeFile(join(petDir, "pet.json"), "{}");

  await page.locator('input[type="file"]').setInputFiles(petDir);

  await expect(page.getByText(
    "The folder must contain pet.json and either spritesheet.webp or spritesheet.png.",
  )).toBeVisible();
  await expect(
    page.locator('[data-sonner-toaster][data-x-position="center"][data-y-position="top"]'),
  ).toBeAttached();
  expect(harness.calls.some((call) => call.command === "import_pet_files")).toBe(false);
});

test("importing a local pet folder accepts png spritesheet fallback", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser);
  const page = await harness.openPage("settings");
  const petDir = await mkdtemp(join(tmpdir(), "pethover-local-png-pet-"));
  const manifest = JSON.stringify({
    id: "local-png-fox",
    slug: "local-png-fox",
    displayName: "Local Png Fox",
    description: "Imported from a local folder with png fallback.",
    frameWidth: 192,
    frameHeight: 208,
    gridColumns: 8,
    gridRows: 9,
  });
  await writeFile(join(petDir, "pet.json"), manifest);
  await writeFile(join(petDir, "spritesheet.png"), "sprite");

  await page.locator('input[type="file"]').setInputFiles(petDir);

  await expect(page.getByRole("button", { name: /local png fox/i })).toBeVisible();
  expect(harness.calls).toContainEqual(
    expect.objectContaining({
      command: "import_pet_files",
      args: expect.objectContaining({
        manifestJson: manifest,
        spriteFileName: "spritesheet.png",
      }),
    }),
  );
});
