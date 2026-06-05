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

  await page.getByRole("button", { name: "Import" }).click();

  const drawer = page.getByRole("dialog", { name: "Import pets" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Codex" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Folders" })).toBeVisible();
  await expect(drawer.locator('[data-slot="empty-title"]')).toContainText(
    "No preview pets yet.",
  );
  await expect(drawer.getByRole("button", { name: "Choose folders" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Choose zip" })).toHaveCount(0);
});

test("codex import button is disabled with empty Codex pets and shows the empty hint", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    codexPets: [],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  const drawer = page.getByRole("dialog", { name: "Import pets" });
  const codexButton = drawer.getByRole("button", { name: "Codex" });
  const codexAction = drawer.locator(".pet-import-source-action").filter({
    hasText: "Codex",
  });

  await expect(codexButton).toBeDisabled();
  await codexAction.hover();

  await expect(
    drawer.getByRole("tooltip", {
      name: "No preview pets yet. Choose a source to show them here.",
    }),
  ).toBeVisible();
  await expect(drawer.locator('[data-slot="empty-title"]')).toContainText(
    "No preview pets yet.",
  );
});

test("codex import availability is refreshed every time the drawer opens", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    codexPets: [],
    importPreviews: [previewFox],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  let drawer = page.getByRole("dialog", { name: "Import pets" });
  await expect(drawer.getByRole("button", { name: "Codex" })).toBeDisabled();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toHaveCount(0);

  harness.setCodexPets([goku]);
  await page.getByRole("button", { name: "Import" }).click();
  drawer = page.getByRole("dialog", { name: "Import pets" });
  const codexButton = drawer.getByRole("button", { name: "Codex" });

  await expect(codexButton).toBeEnabled();
  await codexButton.click();

  await expect(drawer.getByRole("button", { name: "Local Fox" })).toBeVisible();
  expect(harness.invocations("list_codex_pets").length).toBeGreaterThan(2);
});

test("codex import previews pets selected by default", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    codexPets: [goku],
    importPreviews: [previewFox, previewPanda],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Codex" }).click();

  await expect(page.getByRole("button", { name: "Local Fox" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Local Panda" })).toBeVisible();
  const foxCard = page.locator(".pet-card").filter({ hasText: "Local Fox" });
  await expect(foxCard).toContainText("Compact martial arts pet");
  await expect(foxCard).not.toContainText("Codex · user:local-fox");
  await expect(foxCard.getByTestId("pet-card-custom-badge")).toHaveCount(0);
  await expect(
    foxCard.locator(
      ".pet-card-preview-identity > .pet-card-checkbox + .pet-card-id",
    ),
  ).toHaveCount(1);
  const foxCheckbox = page.getByRole("checkbox", {
    name: "Select Local Fox",
  });
  const pandaCheckbox = page.getByRole("checkbox", {
    name: "Select Local Panda",
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

test("codex import preview refresh replaces prior codex previews", async ({
  browser,
}) => {
  const codexFox: PetImportPreview = {
    ...previewFox,
    sourceLabel: "local-fox",
  };
  const codexPanda: PetImportPreview = {
    ...previewPanda,
    sourceLabel: "local-panda",
  };
  const refreshedFox: PetImportPreview = {
    ...codexFox,
    previewId: "preview-fox-refresh",
    sourceLabel: "local-fox-refresh",
    summary: {
      ...codexFox.summary,
      displayName: "Local Fox Refresh",
    },
  };
  const harness = await createAppHarness(browser, {
    codexPets: [goku],
    importPreviews: [codexFox, codexPanda],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  const drawer = page.getByRole("dialog", { name: "Import pets" });
  await drawer.getByRole("button", { name: "Codex" }).click();
  await expect(drawer.getByRole("button", { name: "Local Fox" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Local Panda" })).toBeVisible();

  harness.setImportPreviews([refreshedFox]);
  await drawer.getByRole("button", { name: "Codex" }).click();

  await expect(drawer.getByRole("button", { name: "Local Fox Refresh" })).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Local Fox", exact: true }),
  ).toHaveCount(0);
  await expect(
    drawer.getByRole("button", { name: "Local Panda", exact: true }),
  ).toHaveCount(0);
  await expect(drawer.locator(".pet-card")).toHaveCount(1);
});

test("import preview pet cards animate inline sprites while hovered", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    codexPets: [goku],
    importPreviews: [previewFox],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Codex" }).click();

  const card = page.locator(".pet-card").filter({ hasText: "Local Fox" });
  const sprite = card.locator(".pet-sprite");
  await expect(sprite).toHaveAttribute("data-animated", "false");
  await expect(page.getByTestId("pet-preview-popover")).toHaveCount(0);

  await card.hover();

  await expect(page.getByTestId("pet-preview-popover")).toHaveCount(0);
  await expect(sprite).toHaveAttribute("data-animated", "true");
  await expect(sprite).toHaveAttribute("data-pet-state", "waving");

  await page.mouse.move(4, 4);
  await expect(sprite).toHaveAttribute("data-animated", "false");
});

test("select all checkbox toggles all previews", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    codexPets: [goku],
    importPreviews: [previewFox, previewPanda],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  const drawer = page.getByRole("dialog", { name: "Import pets" });
  await drawer.getByRole("button", { name: "Codex" }).click();

  const selectAll = drawer.getByRole("checkbox", { name: "Select all" });
  await expect(selectAll).toBeChecked();
  await expect(drawer.getByText("2 selected")).toBeVisible();

  await selectAll.click();

  await expect(selectAll).not.toBeChecked();
  await expect(
    drawer.getByRole("checkbox", { name: "Select Local Fox" }),
  ).not.toBeChecked();
  await expect(
    drawer.getByRole("checkbox", { name: "Select Local Panda" }),
  ).not.toBeChecked();
  await expect(drawer.getByText("0 selected")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Import selected" })).toBeDisabled();

  await selectAll.click();
  await drawer.getByRole("button", { name: "Import selected" }).click();

  expect(harness.calls).toContainEqual({
    command: "commit_pet_import_previews",
    args: {
      sessionId: "session-1",
      previewIds: ["preview-fox", "preview-panda"],
    },
  });
});

test("codex preview failure shows toast without inline error", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    codexPets: [goku],
    commandErrors: {
      preview_codex_pet_imports: "Codex preview failed",
    },
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Codex" }).click();

  await expect(drawer.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]")).toContainText(
    "Codex preview failed",
  );
});

test("import failure shows toast without inline error", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    codexPets: [goku],
    commandErrors: {
      commit_pet_import_previews: "Import commit failed",
    },
    importPreviews: [previewFox],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Codex" }).click();
  await drawer.getByRole("button", { name: "Import selected" }).click();

  await expect(drawer.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]")).toContainText(
    "Import commit failed",
  );
});

test("preview rows can be unselected removed and imported", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    codexPets: [goku],
    importPreviews: [previewFox, previewPanda],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Codex" }).click();

  await page.getByRole("checkbox", { name: "Select Local Panda" }).click();
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
    codexPets: [goku],
    importPreviews: [firstSharedPreview, secondSharedPreview],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  const drawer = page.getByRole("dialog", { name: "Import pets" });
  await drawer.getByRole("button", { name: "Codex" }).click();

  const firstCard = drawer.locator('[data-pet-id="shared-preview-first"]');
  const secondCard = drawer.locator('[data-pet-id="shared-preview-second"]');
  await expect(firstCard).toHaveCount(1);
  await expect(secondCard).toHaveCount(1);
  await expect(firstCard).toContainText("Compact martial arts pet");
  await expect(secondCard).toContainText("Compact martial arts pet");
  await expect(firstCard).not.toContainText("Folder A");
  await expect(secondCard).not.toContainText("Folder B");

  await firstCard.hover();
  await firstCard.getByTitle("Remove from preview").click();

  await expect(firstCard).toHaveCount(0);
  await expect(secondCard).toHaveCount(1);
  await secondCard.getByRole("checkbox", { name: "Select Shared Fox" }).click();
  await drawer.getByRole("checkbox", { name: "Select all" }).click();
  await drawer.getByRole("button", { name: "Import selected" }).click();

  expect(harness.calls).toContainEqual({
    command: "commit_pet_import_previews",
    args: { sessionId: "session-1", previewIds: ["shared-preview-second"] },
  });
});

test("all previews can be imported together", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    codexPets: [goku],
    importPreviews: [previewFox, previewPanda],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Codex" }).click();
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
    codexPets: [goku],
    commandDelayMs: {
      commit_pet_import_previews: 250,
    },
    importPreviews: [previewFox],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  const drawer = page.getByRole("dialog", { name: "Import pets" });
  await drawer.getByRole("button", { name: "Codex" }).click();
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
    codexPets: [goku],
    importPreviews: [previewFox],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Codex" }).click();
  const foxCard = page.locator(".pet-card").filter({ hasText: "Local Fox" });

  await expect(foxCard).toBeVisible();
  await foxCard.hover();
  await foxCard.getByTitle("Remove from preview").click();

  await expect(page.getByRole("button", { name: "Local Fox" })).toHaveCount(0);
  expect(harness.calls.some((call) => call.command === "remove_pet")).toBe(false);
});

test("closing the drawer discards the preview session", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    codexPets: [goku],
    importPreviews: [previewFox],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  const drawer = page.getByRole("dialog", { name: "Import pets" });
  await drawer.getByRole("button", { name: "Codex" }).click();
  await expect(page.getByRole("button", { name: "Local Fox" })).toBeVisible();

  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toHaveCount(0);

  expect(harness.calls).toContainEqual({
    command: "discard_pet_import_previews",
    args: { sessionId: "session-1" },
  });
});

test("folder source button directly triggers the folder dialog", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    dialogOpenPaths: [["/pets/folder-one", "/pets/folder-two"]],
    importPreviews: [previewFox],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Folders" }).click();
  await expect(drawer.getByRole("button", { name: "Choose folders" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Choose zip" })).toHaveCount(0);
  await expect
    .poll(() =>
      harness.calls.some((call) => call.command === "preview_pet_import_folders"),
    )
    .toBe(true);

  expect(harness.calls).toContainEqual({
    command: "preview_pet_import_folders",
    args: {
      sessionId: "session-1",
      folderPaths: ["/pets/folder-one", "/pets/folder-two"],
    },
  });
  expect(harness.calls.some((call) => call.command === "preview_pet_import_zips")).toBe(false);
});
