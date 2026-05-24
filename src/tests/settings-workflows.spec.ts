import { expect, test } from "@playwright/test";

import {
  antigravityAdapter,
  codexAdapter,
  copilotAdapter,
  createAppHarness,
  goku,
  nebula,
  copet,
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

test("agent integration config path abbreviates mac home paths", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    adapters: [
      {
        ...codexAdapter,
        configPath: "/Users/elu/.codex/hooks.json",
        installed: true,
        healthy: true,
        message: "CoPet hook installed",
      },
    ],
  });
  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "Agents" }).click();

  const configPath = page.locator(".adapter-config-path");
  await expect(configPath.locator("code")).toHaveText("~/.codex/hooks.json");
  await expect(configPath).toHaveAttribute("title", "/Users/elu/.codex/hooks.json");
});

test("agent integrations render Copilot CLI before Gemini", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    adapters: [
      {
        id: "claude-code",
        displayName: "Claude Code",
        configPath: "/home/.claude/settings.json",
        installed: false,
        healthy: false,
        message: "Configuration path not created yet",
      },
      codexAdapter,
      antigravityAdapter,
      {
        id: "opencode",
        displayName: "OpenCode",
        configPath: "/home/.config/opencode/plugins/copet.js",
        installed: false,
        healthy: false,
        message: "Configuration path not created yet",
      },
      copilotAdapter,
      {
        id: "gemini",
        displayName: "Gemini",
        configPath: "/home/.gemini/settings.json",
        installed: false,
        healthy: false,
        message: "Configuration path not created yet",
      },
    ],
  });
  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "Agents" }).click();

  await expect(page.locator(".adapter-card-name")).toHaveText([
    "Claude Code",
    "Codex",
    "Antigravity",
    "OpenCode",
    "Copilot CLI",
    "Gemini",
  ]);
  await expect(page.getByText("GitHub Copilot's terminal agent.")).toBeVisible();
});

test("copilot cli integration switch installs and uninstalls the adapter", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    adapters: [copilotAdapter],
  });
  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "Agents" }).click();
  const copilotSwitch = page.getByRole("switch", { name: "Copilot CLI" });

  await expect(copilotSwitch).toHaveAttribute("aria-checked", "false");
  await copilotSwitch.click();
  await expect(copilotSwitch).toHaveAttribute("aria-checked", "true");

  await copilotSwitch.click();
  await expect(copilotSwitch).toHaveAttribute("aria-checked", "false");

  const adapterCalls = harness.calls.filter(
    (call) =>
      call.command === "install_agent_adapter" ||
      call.command === "uninstall_agent_adapter",
  );
  expect(adapterCalls).toEqual([
    {
      command: "install_agent_adapter",
      args: { adapterId: "copilot" },
    },
    {
      command: "uninstall_agent_adapter",
      args: { adapterId: "copilot" },
    },
  ]);
});

test("antigravity integration switch installs and uninstalls the adapter", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    adapters: [antigravityAdapter],
  });
  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "Agents" }).click();
  const antigravitySwitch = page.getByRole("switch", { name: "Antigravity" });

  await expect(antigravitySwitch).toHaveAttribute("aria-checked", "false");
  await antigravitySwitch.click();
  await expect(antigravitySwitch).toHaveAttribute("aria-checked", "true");

  await antigravitySwitch.click();
  await expect(antigravitySwitch).toHaveAttribute("aria-checked", "false");

  const adapterCalls = harness.calls.filter(
    (call) =>
      call.command === "install_agent_adapter" ||
      call.command === "uninstall_agent_adapter",
  );
  expect(adapterCalls).toEqual([
    {
      command: "install_agent_adapter",
      args: { adapterId: "antigravity" },
    },
    {
      command: "uninstall_agent_adapter",
      args: { adapterId: "antigravity" },
    },
  ]);
});

test("settings page uses Chinese copy from app locale", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      locale: "zh-CN",
      pets: [copet],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");

  await expect(page.getByRole("heading", { name: "宠物", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新" })).toBeVisible();
  await expect(page.getByRole("button", { name: "导入" })).toBeVisible();

  await page.getByRole("tab", { name: "通用" }).click();
  await expect(page.getByRole("slider", { name: "尺寸" })).toBeVisible();
});

test("settings page uses English copy from app locale", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      locale: "en-US",
      pets: [copet],
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
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import" })).toBeVisible();

  await page.getByRole("tab", { name: "General" }).click();
  await expect(page.getByRole("slider", { name: "Size" })).toBeVisible();
});

test("language switch persists preference and updates settings copy", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      locale: "en-US",
      localePreference: "en-US",
      pets: [copet],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();

  const languageGroup = page.getByRole("radiogroup", { name: "Language" });
  await expect(languageGroup).toBeVisible();
  await expect(languageGroup.getByRole("radio", { name: "English" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByText("Choose the display language for CoPet.")).toHaveCount(0);

  await languageGroup.getByRole("radio", { name: "中文" }).click();

  await expect(
    page.getByRole("radiogroup", { name: "语言" }).getByRole("radio", { name: "中文" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("选择 CoPet 的显示语言。")).toHaveCount(0);
  expect(harness.calls).toContainEqual({
    command: "set_locale_preference",
    args: { localePreference: "zh-CN" },
  });
});

test("display count preference toggles between latest and all", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      locale: "en-US",
      localePreference: "en-US",
      pets: [copet],
      onboardingComplete: false,
      agentMessageDisplay: "latest",
    },
  });

  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();

  const messageDisplay = page.getByRole("radiogroup", { name: "Display count" });
  await expect(messageDisplay).toBeVisible();
  await expect(
    messageDisplay.getByRole("radio", { name: "Most recent only" }),
  ).toHaveAttribute("aria-checked", "true");

  await messageDisplay.getByRole("radio", { name: "All agents" }).click();

  await expect(
    messageDisplay.getByRole("radio", { name: "All agents" }),
  ).toHaveAttribute("aria-checked", "true");
  expect(harness.calls).toContainEqual({
    command: "set_agent_message_display",
    args: { agentMessageDisplay: "all" },
  });
});

test("display count defaults to all agents", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      locale: "en-US",
      localePreference: "en-US",
      pets: [copet],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();

  const messageDisplay = page.getByRole("radiogroup", { name: "Display count" });
  await expect(messageDisplay.getByRole("radio", { name: "All agents" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("refresh list reloads settings data", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    commandDelayMs: {
      get_app_state: 1_000,
      list_codex_pets: 1_000,
    },
    state: {
      currentPetId: copet.id,
      locale: "en-US",
      pets: [copet],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");
  const initialLoads = harness.calls.filter((call) => call.command === "get_app_state").length;
  const refreshButton = page.getByRole("button", { name: "Refresh" });
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
      currentPetId: copet.id,
      pets: [copet, goku],
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
      pets: [copet, goku],
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
      currentPetId: copet.id,
      pets: [copet, goku],
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
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
      petWindowSize: 70,
    },
  });
  const settings = await harness.openPage("settings");
  await settings.getByRole("tab", { name: "General" }).click();
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

test("import pets drawer opens a native directory preview dialog", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    dialogOpenPaths: [["/tmp/dialog-pet"]],
  });
  const page = await harness.openPage("settings");

  await page.getByRole("button", { name: "Import" }).click();
  const drawer = page.getByRole("dialog", { name: "Import pets" });
  await drawer.getByRole("button", { name: "Folders" }).click();
  await expect(drawer.getByRole("button", { name: "Choose folders" })).toHaveCount(0);
  await expect
    .poll(() =>
      harness.calls.some((call) => call.command === "preview_pet_import_folders"),
    )
    .toBe(true);

  expect(harness.calls).toContainEqual({
    command: "plugin:dialog|open",
    args: {
      options: expect.objectContaining({
        canCreateDirectories: false,
        directory: true,
        multiple: true,
        title: "Choose folders",
      }),
    },
  });
  expect(harness.calls).toContainEqual({
    command: "preview_pet_import_folders",
    args: { sessionId: "session-1", folderPaths: ["/tmp/dialog-pet"] },
  });
});

test("settings tip box presents custom pet guidance without an import button", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser);
  const page = await harness.openPage("settings");

  await expect(
    page.getByRole("heading", { name: "Create your own pet" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Bring your imagination to life. Create or import your own Codex-compatible pet package.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import package" }),
  ).toHaveCount(0);
});

test("pet interactions settings sub-section renders all controls", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
      locale: "en-US",
      petInteractions: { enableClickSounds: false, cooldownStyle: "normal", enableStartupAnimation: true },
    },
  });
  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();

  await expect(page.getByText("Pet interactions")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Pet sounds" })).toBeEnabled();
  await expect(page.getByText("Coming soon")).toHaveCount(0);
  const cooldownGroup = page.getByRole("radiogroup", { name: "Interaction cooldown" });
  await expect(cooldownGroup).toBeVisible();
  await expect(cooldownGroup.getByRole("radio", { name: "Normal" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("pet interactions cooldown radio calls set_pet_interactions", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
      locale: "en-US",
      petInteractions: { enableClickSounds: false, cooldownStyle: "normal", enableStartupAnimation: true },
    },
  });
  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();

  const cooldownGroup = page.getByRole("radiogroup", { name: "Interaction cooldown" });
  await cooldownGroup.getByRole("radio", { name: "Lazy" }).click();

  expect(harness.calls).toContainEqual({
    command: "set_pet_interactions",
    args: {
      prefs: { enableClickSounds: false, cooldownStyle: "lazy", enableStartupAnimation: true },
    },
  });
});

test("pet sounds switch calls set_pet_interactions", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
      locale: "en-US",
      petInteractions: { enableClickSounds: false, cooldownStyle: "lazy", enableStartupAnimation: true },
    },
  });
  const page = await harness.openPage("settings");
  await page.getByRole("tab", { name: "General" }).click();

  const soundSwitch = page.getByRole("switch", { name: "Pet sounds" });
  const soundRow = page.locator(".settings-switch-row").filter({ has: soundSwitch });
  await soundSwitch.click();

  await expect(soundSwitch).toHaveAttribute("aria-checked", "true");
  expect(harness.calls.filter((call) => call.command === "set_pet_interactions")).toEqual([
    {
      command: "set_pet_interactions",
      args: {
        prefs: { enableClickSounds: true, cooldownStyle: "lazy", enableStartupAnimation: true },
      },
    },
  ]);

  await soundRow.getByText("On", { exact: true }).click();

  await expect(soundSwitch).toHaveAttribute("aria-checked", "false");
  expect(harness.calls.filter((call) => call.command === "set_pet_interactions")).toEqual([
    {
      command: "set_pet_interactions",
      args: {
        prefs: { enableClickSounds: true, cooldownStyle: "lazy", enableStartupAnimation: true },
      },
    },
    {
      command: "set_pet_interactions",
      args: {
        prefs: { enableClickSounds: false, cooldownStyle: "lazy", enableStartupAnimation: true },
      },
    },
  ]);
});
