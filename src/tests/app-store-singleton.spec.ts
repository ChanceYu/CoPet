import { expect, test } from "@playwright/test";

import { createAppHarness, copet, goku } from "./app-harness";

test("PetWindow bootstrap issues exactly one logical fetch (no dual-instance)", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("pet");
  await expect(page.getByRole("img", { name: "CoPet" })).toBeVisible();

  // React Strict Mode double-mounts the bootstrap effect, so each invoke runs
  // exactly twice. The dual-instance bug (PetWindow + useLayeredPetState both
  // calling useAppData) pushed these counts to 4. A drift in either direction
  // indicates a regression worth investigating.
  expect(harness.invocations("get_app_state")).toHaveLength(2);
  expect(harness.invocations("get_runtime_status")).toHaveLength(2);
  expect(harness.invocations("list_agent_adapters")).toHaveLength(0);
  expect(harness.invocations("list_codex_pets")).toHaveLength(0);
  expect(harness.invocations("get_pet_window_visible")).toHaveLength(0);
});

test("dismissed agent message stays dismissed across pet-state events", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("pet");
  await expect(page.getByRole("img", { name: "CoPet" })).toBeVisible();

  const agentMessage = {
    agent: "codex",
    displayName: "Codex",
    text: "thinking about it",
    updatedAtMs: 1_000,
  };

  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "jumping" },
    messages: [agentMessage],
  });

  const bubble = page.getByTestId("pet-agent-message");
  await expect(bubble).toBeVisible();

  await bubble.getByRole("button", { name: "Dismiss" }).click();
  await expect(bubble).toHaveCount(0);

  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "jumping" },
    messages: [agentMessage],
  });

  await expect(page.getByTestId("pet-agent-message")).toHaveCount(0);
});

test("app harness can mock a missing downloads directory", async ({ browser }) => {
  const harness = await createAppHarness(browser, { downloadsDir: null });
  const page = await harness.openPage("settings");

  const downloadsDir = await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("get_downloads_dir"),
  );

  expect(downloadsDir).toBeNull();
});

test("app harness commit import preserves selected pet and reports missing previews", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    importPreviews: [
      {
        previewId: "preview-goku",
        summary: goku,
        sourceLabel: "goku",
        intendedPetId: goku.id,
        selectedByDefault: true,
      },
    ],
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("settings");

  const result = await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("commit_pet_import_previews", {
      sessionId: "session-1",
      previewIds: ["preview-goku", "missing-preview", "../bad"],
    }),
  );

  expect(result).toEqual({
    imported: [goku],
    failed: [
      {
        previewId: "missing-preview",
        errorMessage: "preview package is no longer available",
      },
      {
        previewId: "../bad",
        errorMessage: "preview id is invalid",
      },
    ],
    state: expect.objectContaining({
      currentPetId: copet.id,
      pets: [copet, goku],
    }),
  });
});
