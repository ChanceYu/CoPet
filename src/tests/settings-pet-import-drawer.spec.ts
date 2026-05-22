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
  await expect(page.getByRole("checkbox", { name: "Select preview pet Local Fox" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Select preview pet Local Panda" })).toBeChecked();
  expect(harness.calls).toContainEqual({
    command: "create_pet_import_session",
    args: {},
  });
  expect(harness.calls).toContainEqual({
    command: "preview_codex_pet_imports",
    args: { sessionId: "session-1" },
  });
});

test("preview rows can be unselected removed and imported", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    importPreviews: [previewFox, previewPanda],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import pets" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "From Codex" }).click();

  await page.getByRole("checkbox", { name: "Select preview pet Local Panda" }).uncheck();
  await page.getByRole("button", { name: "Import selected" }).click();

  expect(harness.calls).toContainEqual({
    command: "commit_pet_import_previews",
    args: { sessionId: "session-1", previewIds: ["preview-fox"] },
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
