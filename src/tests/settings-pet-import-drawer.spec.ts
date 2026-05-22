import { expect, test } from "@playwright/test";

import { createAppHarness, goku } from "./app-harness";
import type { PetImportPreview } from "../lib/appTypes";

const previewFox: PetImportPreview = {
  previewId: "preview-fox",
  sourceLabel: "Codex",
  intendedPetId: "user:local-fox",
  selectedByDefault: true,
  summary: {
    ...goku,
    id: "user:local-fox",
    slug: "local-fox",
    displayName: "Local Fox",
    builtIn: false,
    spritePath: "/preview/local-fox/spritesheet.webp",
  },
};

const previewPanda: PetImportPreview = {
  previewId: "preview-panda",
  sourceLabel: "Codex",
  intendedPetId: "user:local-panda",
  selectedByDefault: true,
  summary: {
    ...goku,
    id: "user:local-panda",
    slug: "local-panda",
    displayName: "Local Panda",
    builtIn: false,
    spritePath: "/preview/local-panda/spritesheet.webp",
  },
};

test("import pets opens a simple drawer", async ({ browser }) => {
  const harness = await createAppHarness(browser);
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import pets" }).click();

  const drawer = page.getByRole("dialog", { name: "Import pets" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "From Codex" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "From folders" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Choose zip" })).toHaveCount(0);
});

test("codex import previews pets selected by default", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    importPreviews: [previewFox, previewPanda],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import pets" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "From Codex" }).click();

  await expect(page.getByRole("button", { name: "Local Fox" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Local Panda" })).toBeVisible();
  const foxCheckbox = page.getByRole("checkbox", {
    name: "Select preview pet Local Fox",
  });
  const pandaCheckbox = page.getByRole("checkbox", {
    name: "Select preview pet Local Panda",
  });
  await expect(foxCheckbox).toBeChecked();
  await expect(foxCheckbox).toHaveAttribute("aria-checked", "true");
  await expect(pandaCheckbox).toBeChecked();
  await expect(pandaCheckbox).toHaveAttribute("aria-checked", "true");
  expect(harness.calls).toContainEqual({
    command: "create_pet_import_session",
    args: {},
  });
  expect(harness.calls).toContainEqual({
    command: "preview_codex_pet_imports",
    args: { sessionId: "session-1" },
  });
});

test("codex preview failure shows inline error and toast", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    commandErrors: {
      preview_codex_pet_imports: "Codex preview failed",
    },
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import pets" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "From Codex" }).click();

  const inlineErrors = page.getByRole("alert");
  await expect(inlineErrors).toContainText(
    "Codex preview failed",
  );
  await expect(page.locator("[data-sonner-toast]")).toContainText(
    "Codex preview failed",
  );
});

test("preview rows can be unselected removed and imported", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    importPreviews: [previewFox, previewPanda],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import pets" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "From Codex" }).click();

  await page.getByRole("checkbox", { name: "Select preview pet Local Panda" }).click();
  await page.getByRole("button", { name: "Import selected" }).click();

  expect(harness.calls).toContainEqual({
    command: "commit_pet_import_previews",
    args: { sessionId: "session-1", previewIds: ["preview-fox"] },
  });
});

test("duplicate preview summary ids render and act independently", async ({ browser }) => {
  const firstSharedPreview: PetImportPreview = {
    ...previewFox,
    previewId: "shared-preview-first",
    sourceLabel: "Folder A",
    intendedPetId: "user:shared-fox",
    summary: {
      ...previewFox.summary,
      id: "user:shared-fox",
      slug: "shared-fox",
      displayName: "Shared Fox",
      spritePath: "/preview/shared-fox-first/spritesheet.webp",
    },
  };
  const secondSharedPreview: PetImportPreview = {
    ...previewFox,
    previewId: "shared-preview-second",
    sourceLabel: "Folder B",
    intendedPetId: "user:shared-fox",
    summary: {
      ...previewFox.summary,
      id: "user:shared-fox",
      slug: "shared-fox",
      displayName: "Shared Fox",
      spritePath: "/preview/shared-fox-second/spritesheet.webp",
    },
  };
  const harness = await createAppHarness(browser, {
    importPreviews: [firstSharedPreview, secondSharedPreview],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import pets" }).click();
  const drawer = page.getByRole("dialog", { name: "Import pets" });
  await drawer.getByRole("button", { name: "From Codex" }).click();

  const firstCard = drawer.locator(".pet-card").filter({ hasText: "Folder A" });
  const secondCard = drawer.locator(".pet-card").filter({ hasText: "Folder B" });
  await expect(firstCard).toHaveCount(1);
  await expect(secondCard).toHaveCount(1);
  await expect(firstCard).toContainText("user:shared-fox");
  await expect(secondCard).toContainText("user:shared-fox");

  await firstCard.hover();
  await firstCard.getByTitle("Remove from preview").click();

  await expect(firstCard).toHaveCount(0);
  await expect(secondCard).toHaveCount(1);
  await secondCard.getByRole("checkbox", { name: "Select preview pet Shared Fox" }).click();
  await drawer.getByRole("button", { name: "Select all" }).click();
  await drawer.getByRole("button", { name: "Import selected" }).click();

  expect(harness.calls).toContainEqual({
    command: "commit_pet_import_previews",
    args: { sessionId: "session-1", previewIds: ["shared-preview-second"] },
  });
});

test("all previews can be imported together", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    importPreviews: [previewFox, previewPanda],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import pets" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "From Codex" }).click();
  await page.getByRole("button", { name: "Import all" }).click();

  expect(harness.calls).toContainEqual({
    command: "commit_pet_import_previews",
    args: {
      sessionId: "session-1",
      previewIds: ["preview-fox", "preview-panda"],
    },
  });
});

test("closing the drawer is ignored while preview commit is active", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    commandDelayMs: {
      commit_pet_import_previews: 250,
    },
    importPreviews: [previewFox],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import pets" }).click();
  const drawer = page.getByRole("dialog", { name: "Import pets" });
  await drawer.getByRole("button", { name: "From Codex" }).click();
  await drawer.getByRole("button", { name: "Import selected" }).click();
  await expect
    .poll(
      () =>
        harness.calls.filter(
          (call) => call.command === "commit_pet_import_previews",
        ).length,
    )
    .toBe(1);

  await page.keyboard.press("Escape");
  await expect(drawer).toBeVisible();
  expect(
    harness.calls.some((call) => call.command === "discard_pet_import_previews"),
  ).toBe(false);

  await drawer.getByRole("button", { name: "Close" }).dispatchEvent("click");
  await expect(drawer).toBeVisible();
  expect(
    harness.calls.some((call) => call.command === "discard_pet_import_previews"),
  ).toBe(false);

  await page.locator(".ui-drawer-overlay").dispatchEvent("click");
  await expect(drawer).toBeVisible();
  expect(
    harness.calls.some((call) => call.command === "discard_pet_import_previews"),
  ).toBe(false);

  await expect(drawer.getByRole("button", { name: "Local Fox" })).toHaveCount(0);
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toHaveCount(0);
  expect(harness.calls).toContainEqual({
    command: "discard_pet_import_previews",
    args: { sessionId: "session-1" },
  });
});

test("remove preview only deletes the drawer row", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    importPreviews: [previewFox],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import pets" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "From Codex" }).click();
  const foxCard = page.locator(".pet-card").filter({ hasText: "Local Fox" });

  await expect(foxCard).toBeVisible();
  await foxCard.hover();
  await foxCard.getByTitle("Remove from preview").click();

  await expect(page.getByRole("button", { name: "Local Fox" })).toHaveCount(0);
  expect(harness.calls.some((call) => call.command === "remove_pet")).toBe(false);
});

test("closing the drawer discards the preview session", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    importPreviews: [previewFox],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import pets" }).click();
  const drawer = page.getByRole("dialog", { name: "Import pets" });
  await drawer.getByRole("button", { name: "From Codex" }).click();
  await expect(page.getByRole("button", { name: "Local Fox" })).toBeVisible();

  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toHaveCount(0);

  expect(harness.calls).toContainEqual({
    command: "discard_pet_import_previews",
    args: { sessionId: "session-1" },
  });
});

test("local source choice triggers folder and zip dialogs", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    dialogOpenPaths: [["/pets/folder-one", "/pets/folder-two"], ["/pets/zip-one.zip"]],
    importPreviews: [previewFox],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import pets" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "From folders" }).click();
  await drawer.getByRole("button", { name: "Choose folders" }).click();
  await expect
    .poll(() =>
      harness.calls.some((call) => call.command === "preview_pet_import_folders"),
    )
    .toBe(true);
  await expect(drawer.getByRole("button", { name: "Choose zip" })).toBeEnabled();
  await drawer.getByRole("button", { name: "Choose zip" }).click();
  await expect
    .poll(() =>
      harness.calls.some((call) => call.command === "preview_pet_import_zips"),
    )
    .toBe(true);

  expect(harness.calls).toContainEqual({
    command: "preview_pet_import_folders",
    args: {
      sessionId: "session-1",
      folderPaths: ["/pets/folder-one", "/pets/folder-two"],
    },
  });
  expect(harness.calls).toContainEqual({
    command: "preview_pet_import_zips",
    args: {
      sessionId: "session-1",
      zipPaths: ["/pets/zip-one.zip"],
    },
  });
});
