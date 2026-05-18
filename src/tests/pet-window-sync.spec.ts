import { expect, test } from "@playwright/test";

import { createAppHarness, goku, pethover } from "./app-harness";

function logicalSetSize(call: { args?: Record<string, unknown> }) {
  const rawValue = call.args?.value as
    | {
        Logical?: { width: number; height: number };
        size?: { type: string; width: number; height: number };
        toJSON?: () => unknown;
      }
    | undefined;

  return (rawValue?.size?.type === "Logical"
    ? { Logical: { width: rawValue.size.width, height: rawValue.size.height } }
    : typeof rawValue?.toJSON === "function"
      ? rawValue.toJSON()
      : rawValue) as { Logical?: { width: number; height: number } } | undefined;
}

function physicalSetPosition(call: { args?: Record<string, unknown> }) {
  const rawValue = call.args?.value as
    | {
        Physical?: { x: number; y: number };
        position?: { type: string; x: number; y: number };
        toJSON?: () => unknown;
      }
    | undefined;

  return (rawValue?.position?.type === "Physical"
    ? { Physical: { x: rawValue.position.x, y: rawValue.position.y } }
    : typeof rawValue?.toJSON === "function"
      ? rawValue.toJSON()
      : rawValue) as { Physical?: { x: number; y: number } } | undefined;
}

test("selecting a pet in settings updates the visible pet window immediately", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover, goku],
      onboardingComplete: false,
    },
  });

  const petPage = await harness.openPage("pet");
  await expect(petPage.getByRole("img", { name: "PetHover" })).toBeVisible();

  const settingsPage = await harness.openPage("settings");
  await settingsPage.getByRole("button", { name: /goku/i }).click();

  await expect(petPage.getByRole("img", { name: "Goku" })).toBeVisible();
});

test("settings header is a draggable window region", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("settings");

  await expect(page.locator(".settings-titlebar")).toHaveAttribute(
    "data-tauri-drag-region",
    /^(|true)$/,
  );
  await expect(page.getByRole("button", { name: "Close" })).not.toHaveAttribute(
    "data-tauri-drag-region",
    "",
  );

  await page.locator(".settings-titlebar").dispatchEvent("pointerdown", {
    button: 0,
    pointerType: "mouse",
  });
  expect(harness.calls).toContainEqual({
    command: "plugin:window|start_dragging",
    args: { label: "settings" },
  });

  await page.locator(".settings-logo-image").dispatchEvent("pointerdown", {
    button: 0,
    pointerType: "mouse",
  });
  await page.locator(".settings-brand-name").dispatchEvent("pointerdown", {
    button: 0,
    pointerType: "mouse",
  });
  expect(
    harness.calls.filter((call) => call.command === "plugin:window|start_dragging"),
  ).toHaveLength(3);

  const dragCallsBeforeClose = harness.calls.filter(
    (call) => call.command === "plugin:window|start_dragging",
  ).length;

  await page.getByRole("button", { name: "Close" }).click();
  expect(harness.calls).toContainEqual({
    command: "plugin:window|hide",
    args: { label: "settings" },
  });
  expect(
    harness.calls.filter((call) => call.command === "plugin:window|start_dragging"),
  ).toHaveLength(dragCallsBeforeClose);
});

test("pet window exposes a draggable Tauri region while keeping settings clickable", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");

  await expect(page.locator("main.pet-window")).toHaveAttribute(
    "data-tauri-drag-region",
    /^(|true)$/,
  );
  await expect(page.getByRole("button", { name: "Open settings" })).toHaveCount(0);

  await page.locator("main.pet-window").dispatchEvent("pointerdown", {
    button: 0,
    pointerType: "mouse",
  });
  expect(harness.calls).toContainEqual({
    command: "plugin:window|start_dragging",
    args: { label: "pet" },
  });
});

test("pet sprite stays inside the pet window when the selected pet frame is large", async ({
  browser,
}) => {
  const largePet = {
    ...pethover,
    id: "large-pet",
    slug: "large-pet",
    displayName: "Large Pet",
    frameWidth: 400,
    frameHeight: 400,
    spritePath: "/pets/large-pet/spritesheet.webp",
  };
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: largePet.id,
      pets: [largePet],
      onboardingComplete: false,
      petWindowSize: 1,
    },
  });
  const page = await harness.openPage("pet");
  await page.setViewportSize({ width: 95, height: 110 });
  await expect(page.getByRole("img", { name: "Large Pet" })).toBeVisible();

  const bounds = await page.evaluate(() => {
    const petWindow = document.querySelector("main.pet-window");
    const spriteFrame = document.querySelector(".pet-sprite-frame");
    if (!petWindow || !spriteFrame) {
      throw new Error("Expected pet window and sprite frame to be rendered");
    }

    const windowRect = petWindow.getBoundingClientRect();
    const frameRect = spriteFrame.getBoundingClientRect();
    return {
      frame: {
        bottom: frameRect.bottom,
        left: frameRect.left,
        right: frameRect.right,
        top: frameRect.top,
      },
      window: {
        bottom: windowRect.bottom,
        left: windowRect.left,
        right: windowRect.right,
        top: windowRect.top,
      },
    };
  });

  expect(bounds.frame.left).toBeGreaterThanOrEqual(bounds.window.left);
  expect(bounds.frame.top).toBeGreaterThanOrEqual(bounds.window.top);
  expect(bounds.frame.right).toBeLessThanOrEqual(bounds.window.right);
  expect(bounds.frame.bottom).toBeLessThanOrEqual(bounds.window.bottom);
});

test("pet window content sizing keeps the logical window width at least 180", async ({
  browser,
}) => {
  const tinyPet = {
    ...pethover,
    id: "tiny-pet",
    slug: "tiny-pet",
    displayName: "Tiny Pet",
    frameWidth: 1,
    frameHeight: 1,
    spritePath: "/pets/tiny-pet/spritesheet.webp",
  };
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: tinyPet.id,
      pets: [tinyPet],
      onboardingComplete: false,
      petWindowSize: 1,
    },
  });
  const page = await harness.openPage("pet");
  await page.setViewportSize({ width: 95, height: 110 });
  await expect(page.getByRole("img", { name: "Tiny Pet" })).toBeVisible();

  await expect
    .poll(() =>
      harness.calls
        .filter((call) => call.command === "plugin:window|set_size")
        .map((call) => {
          const rawValue = call.args?.value as
            | {
                Logical?: { width: number };
                size?: { type: string; width: number };
                toJSON?: () => unknown;
              }
            | undefined;
          const value = (rawValue?.size?.type === "Logical"
            ? { Logical: { width: rawValue.size.width } }
            : typeof rawValue?.toJSON === "function"
              ? rawValue.toJSON()
              : rawValue
          ) as { Logical?: { width: number } } | undefined;
          return value?.Logical?.width ?? 0;
        })
        .at(-1),
    )
    .toBeGreaterThanOrEqual(180);
});

test("pet window height follows the message container plus pet height", async ({
  browser,
}) => {
  const tinyPet = {
    ...pethover,
    id: "height-fit-pet",
    slug: "height-fit-pet",
    displayName: "Height Fit Pet",
    frameWidth: 80,
    frameHeight: 80,
    spritePath: "/pets/height-fit-pet/spritesheet.webp",
  };
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: tinyPet.id,
      pets: [tinyPet],
      onboardingComplete: false,
      petWindowSize: 1,
    },
  });
  const page = await harness.openPage("pet");
  await page.setViewportSize({ width: 100, height: 110 });
  await expect(page.getByRole("img", { name: "Height Fit Pet" })).toBeVisible();

  await expect
    .poll(() =>
      harness.calls
        .filter((call) => call.command === "plugin:window|set_size")
        .map((call) => {
          const rawValue = call.args?.value as
            | {
                Logical?: { height: number };
                size?: { type: string; height: number };
                toJSON?: () => unknown;
              }
            | undefined;
          const value = (rawValue?.size?.type === "Logical"
            ? { Logical: { height: rawValue.size.height } }
            : typeof rawValue?.toJSON === "function"
              ? rawValue.toJSON()
              : rawValue
          ) as { Logical?: { height: number } } | undefined;
          return value?.Logical?.height ?? 0;
        })
        .at(-1),
    )
    .toBe(56);
});

test("agent messages expand the pet window without shrinking the configured pet size", async ({
  browser,
}) => {
  const largePet = {
    ...pethover,
    id: "large-message-pet",
    slug: "large-message-pet",
    displayName: "Large Message Pet",
    frameWidth: 400,
    frameHeight: 400,
    spritePath: "/pets/large-message-pet/spritesheet.webp",
  };
  const harness = await createAppHarness(browser, {
    runtimeStatus: {
      port: 8765,
      endpoint: "http://127.0.0.1:8765/v1/events",
      currentState: { state: "idle", sinceMs: 0, idleAfterMs: null },
      messages: [
        {
          agent: "codex",
          displayName: "Codex",
          text: "Reading App.tsx",
          updatedAtMs: 100,
        },
        {
          agent: "gemini",
          displayName: "Gemini",
          text: "Checking package data",
          updatedAtMs: 200,
        },
        {
          agent: "opencode",
          displayName: "OpenCode",
          text: "Writing tests",
          updatedAtMs: 300,
        },
      ],
      acceptedEvents: 3,
      rejectedEvents: 0,
    },
    state: {
      currentPetId: largePet.id,
      pets: [largePet],
      onboardingComplete: false,
      petWindowSize: 1,
    },
  });
  const page = await harness.openPage("pet");
  await page.setViewportSize({ width: 95, height: 110 });
  await expect(page.getByRole("img", { name: "Large Message Pet" })).toBeVisible();
  await expect(page.getByTestId("pet-agent-message")).toHaveCount(3);
  await expect
    .poll(() =>
      harness.calls.some((call) => {
        const rawValue = call.args?.value as
          | {
              Logical?: { height: number };
              size?: { type: string; height: number };
              toJSON?: () => unknown;
            }
          | undefined;
        const value = (rawValue?.size?.type === "Logical"
          ? { Logical: { height: rawValue.size.height } }
          : typeof rawValue?.toJSON === "function"
            ? rawValue.toJSON()
            : rawValue
        ) as { Logical?: { height: number } } | undefined;
        return call.command === "plugin:window|set_size" && (value?.Logical?.height ?? 0) > 110;
      }),
    )
    .toBe(true);

  const bounds = await page.evaluate(() => {
    const petWindow = document.querySelector("main.pet-window");
    const spriteFrame = document.querySelector(".pet-sprite-frame");
    const messagePanel = document.querySelector("[data-testid='pet-agent-messages']");
    if (!petWindow || !spriteFrame || !messagePanel) {
      throw new Error("Expected pet window, sprite frame, and messages to be rendered");
    }

    const windowRect = petWindow.getBoundingClientRect();
    const frameRect = spriteFrame.getBoundingClientRect();
    const messageRect = messagePanel.getBoundingClientRect();
    return {
      frame: {
        bottom: frameRect.bottom,
        height: frameRect.height,
        left: frameRect.left,
        right: frameRect.right,
        top: frameRect.top,
        width: frameRect.width,
      },
      messages: {
        bottom: messageRect.bottom,
        top: messageRect.top,
      },
      window: {
        bottom: windowRect.bottom,
        left: windowRect.left,
        right: windowRect.right,
        top: windowRect.top,
      },
    };
  });

  expect(bounds.frame.width).toBeCloseTo(100, 1);
  expect(bounds.frame.height).toBeCloseTo(100, 1);
  expect(bounds.messages.top).toBeGreaterThanOrEqual(bounds.window.top);
  expect(bounds.frame.bottom).toBeLessThanOrEqual(bounds.window.bottom);
  expect(bounds.messages.bottom).toBeLessThanOrEqual(bounds.window.bottom);
});

test("dragging the size slider expands the pet window to the max logical height", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
      petWindowSize: 30,
    },
  });
  const petPage = await harness.openPage("pet");
  await expect(petPage.getByRole("img", { name: "PetHover" })).toBeVisible();
  await expect
    .poll(() => harness.calls.filter((call) => call.command === "plugin:window|set_size").length)
    .toBeGreaterThan(0);

  const initialSetSizeCalls = harness.calls.filter(
    (call) => call.command === "plugin:window|set_size",
  ).length;
  const settingsPage = await harness.openPage("settings");
  await settingsPage.getByRole("tab", { name: "Preferences" }).click();
  const sizeSlider = settingsPage.getByRole("slider", { name: "Size" });

  await sizeSlider.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerType: "mouse",
  });
  await sizeSlider.dispatchEvent("pointermove", {
    clientX: 18,
    clientY: 10,
    pointerType: "mouse",
  });

  await expect
    .poll(() =>
      harness.calls
        .filter((call) => call.command === "plugin:window|set_size")
        .slice(initialSetSizeCalls)
        .map((call) => logicalSetSize(call)?.Logical?.height ?? 0)
        .at(-1),
    )
    .toBeGreaterThanOrEqual(310);
});

test("starting the size slider does not resize the pet window to a fit-content size before max", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
      petWindowSize: 30,
    },
  });
  const petPage = await harness.openPage("pet");
  await expect(petPage.getByRole("img", { name: "PetHover" })).toBeVisible();
  await expect
    .poll(() => harness.calls.filter((call) => call.command === "plugin:window|set_size").length)
    .toBeGreaterThan(0);
  await petPage.waitForTimeout(100);

  const initialSetSizeCalls = harness.calls.filter(
    (call) => call.command === "plugin:window|set_size",
  ).length;
  const settingsPage = await harness.openPage("settings");
  await settingsPage.getByRole("tab", { name: "Preferences" }).click();
  const sizeSlider = settingsPage.getByRole("slider", { name: "Size" });

  await sizeSlider.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 50,
    clientY: 10,
    pointerType: "mouse",
  });
  await sizeSlider.evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "32");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settingsPage.waitForTimeout(60);
  await sizeSlider.dispatchEvent("pointermove", {
    clientX: 58,
    clientY: 10,
    pointerType: "mouse",
  });

  await expect
    .poll(() =>
      harness.calls
        .filter((call) => call.command === "plugin:window|set_size")
        .slice(initialSetSizeCalls)
        .map((call) => logicalSetSize(call)?.Logical?.height ?? 0)
        .at(-1),
    )
    .toBeGreaterThanOrEqual(310);

  const setSizeHeights = harness.calls
    .filter((call) => call.command === "plugin:window|set_size")
    .slice(initialSetSizeCalls)
    .map((call) => logicalSetSize(call)?.Logical?.height ?? 0);
  expect(setSizeHeights.every((height) => height >= 310)).toBe(true);
});

test("clicking the size slider directly does not expand the pet window to max", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
      petWindowSize: 30,
    },
  });
  const petPage = await harness.openPage("pet");
  await expect(petPage.getByRole("img", { name: "PetHover" })).toBeVisible();
  await expect
    .poll(() => harness.calls.filter((call) => call.command === "plugin:window|set_size").length)
    .toBeGreaterThan(0);

  const initialSetSizeCalls = harness.calls.filter(
    (call) => call.command === "plugin:window|set_size",
  ).length;
  const settingsPage = await harness.openPage("settings");
  await settingsPage.getByRole("tab", { name: "Preferences" }).click();
  const sizeSlider = settingsPage.getByRole("slider", { name: "Size" });

  await sizeSlider.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 80,
    clientY: 10,
    pointerType: "mouse",
  });
  await sizeSlider.evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "55");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sizeSlider.dispatchEvent("pointerup", {
    button: 0,
    clientX: 80,
    clientY: 10,
    pointerType: "mouse",
  });
  await petPage.waitForTimeout(260);

  const sliderSetSizeHeights = harness.calls
    .filter((call) => call.command === "plugin:window|set_size")
    .slice(initialSetSizeCalls)
    .map((call) => logicalSetSize(call)?.Logical?.height ?? 0);
  expect(sliderSetSizeHeights.every((height) => height < 310)).toBe(true);
});

test("pet size control mouse press alone does not start slider window resizing", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
      petWindowSize: 30,
    },
  });
  const petPage = await harness.openPage("pet");
  await expect(petPage.getByRole("img", { name: "PetHover" })).toBeVisible();
  await expect
    .poll(() => harness.calls.filter((call) => call.command === "plugin:window|set_size").length)
    .toBeGreaterThan(0);

  const initialSetSizeCalls = harness.calls.filter(
    (call) => call.command === "plugin:window|set_size",
  ).length;
  const settingsPage = await harness.openPage("settings");
  await settingsPage.getByRole("tab", { name: "Preferences" }).click();
  const sizeControl = settingsPage.locator(".pet-size-control");

  await sizeControl.dispatchEvent("mousedown", { button: 0 });
  await sizeControl.dispatchEvent("mouseup", { button: 0 });
  await petPage.waitForTimeout(260);

  const sliderSetSizeHeights = harness.calls
    .filter((call) => call.command === "plugin:window|set_size")
    .slice(initialSetSizeCalls)
    .map((call) => logicalSetSize(call)?.Logical?.height ?? 0);
  expect(sliderSetSizeHeights.every((height) => height < 310)).toBe(true);
});

test("size slider window resizing does not change pet scale without a value change", async ({
  browser,
}) => {
  const largePet = {
    ...pethover,
    id: "slider-stable-pet",
    slug: "slider-stable-pet",
    displayName: "Slider Stable Pet",
    frameWidth: 400,
    frameHeight: 400,
    spritePath: "/pets/slider-stable-pet/spritesheet.webp",
  };
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: largePet.id,
      pets: [largePet],
      onboardingComplete: false,
      petWindowSize: 90,
    },
  });
  const petPage = await harness.openPage("pet");
  await petPage.setViewportSize({ width: 100, height: 160 });
  await expect(petPage.getByRole("img", { name: "Slider Stable Pet" })).toBeVisible();
  await petPage.waitForTimeout(50);

  const initialSetSizeCalls = harness.calls.filter(
    (call) => call.command === "plugin:window|set_size",
  ).length;
  const initialSpriteWidth = await petPage
    .locator(".pet-sprite-frame")
    .evaluate((node) => node.getBoundingClientRect().width);
  const settingsPage = await harness.openPage("settings");
  await settingsPage.getByRole("tab", { name: "Preferences" }).click();
  const sizeSlider = settingsPage.getByRole("slider", { name: "Size" });

  await sizeSlider.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerType: "mouse",
  });
  await sizeSlider.dispatchEvent("pointermove", {
    clientX: 18,
    clientY: 10,
    pointerType: "mouse",
  });
  await expect
    .poll(() =>
      harness.calls
        .filter((call) => call.command === "plugin:window|set_size")
        .slice(initialSetSizeCalls)
        .map((call) => logicalSetSize(call)?.Logical?.height ?? 0)
        .at(-1),
    )
    .toBeGreaterThanOrEqual(310);

  const widthAfterDragStart = await petPage
    .locator(".pet-sprite-frame")
    .evaluate((node) => node.getBoundingClientRect().width);
  expect(widthAfterDragStart).toBeCloseTo(initialSpriteWidth, 1);

  await sizeSlider.dispatchEvent("pointerup", {
    button: 0,
    clientX: 18,
    clientY: 10,
    pointerType: "mouse",
  });
  await petPage.waitForTimeout(260);

  const widthAfterDragEnd = await petPage
    .locator(".pet-sprite-frame")
    .evaluate((node) => node.getBoundingClientRect().width);
  expect(widthAfterDragEnd).toBeCloseTo(initialSpriteWidth, 1);
});

test("starting the size slider resizes the pet window from its center", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    monitor: {
      name: "Secondary",
      position: { x: 1440, y: 0 },
      scaleFactor: 2,
      size: { width: 2560, height: 1440 },
      workArea: {
        position: { x: 1440, y: 0 },
        size: { width: 2560, height: 1440 },
      },
    },
    scaleFactor: 2,
    windowPositions: {
      pet: { x: 1540, y: 80 },
    },
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
      petWindowSize: 1,
    },
  });
  const petPage = await harness.openPage("pet");
  await petPage.setViewportSize({ width: 100, height: 110 });
  await expect(petPage.getByRole("img", { name: "PetHover" })).toBeVisible();
  await petPage.waitForTimeout(50);

  const settingsPage = await harness.openPage("settings");
  await settingsPage.getByRole("tab", { name: "Preferences" }).click();
  const sizeControl = settingsPage.locator(".pet-size-control");

  await sizeControl.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerType: "mouse",
  });
  await sizeControl.dispatchEvent("pointermove", {
    clientX: 18,
    clientY: 10,
    pointerType: "mouse",
  });

  await expect
    .poll(() =>
      harness.calls
        .filter((call) => call.command === "plugin:window|set_position")
        .map((call) => physicalSetPosition(call)?.Physical)
        .at(-1),
    )
    .toEqual({ x: 1370, y: -120 });
  expect(harness.calls).toContainEqual({
    command: "plugin:window|monitor_from_point",
    args: { x: 1640, y: 190 },
  });
  await expect
    .poll(() =>
      harness.calls
        .filter((call) => call.command === "plugin:window|set_size")
        .map((call) => logicalSetSize(call)?.Logical)
        .at(-1),
    )
    .toEqual({ width: 270, height: 310 });

  const startPositionCallCount = harness.calls.filter(
    (call) => call.command === "plugin:window|set_position",
  ).length;

  await sizeControl.dispatchEvent("pointerup", {
    button: 0,
    clientX: 18,
    clientY: 10,
    pointerType: "mouse",
  });

  await expect
    .poll(
      () =>
        harness.calls.filter((call) => call.command === "plugin:window|set_position")
          .length,
    )
    .toBeGreaterThan(startPositionCallCount);
});

test("growing the size slider expands the pet window to max while rendering slider changes", async ({
  browser,
}) => {
  const largePet = {
    ...pethover,
    id: "ordered-grow-pet",
    slug: "ordered-grow-pet",
    displayName: "Ordered Grow Pet",
    frameWidth: 400,
    frameHeight: 400,
    spritePath: "/pets/ordered-grow-pet/spritesheet.webp",
  };
  const harness = await createAppHarness(browser, {
    commandDelayMs: {
      "plugin:window|set_size": 300,
    },
    runtimeStatus: {
      port: 8765,
      endpoint: "http://127.0.0.1:8765/v1/events",
      currentState: { state: "idle", sinceMs: 0, idleAfterMs: null },
      messages: [
        {
          agent: "codex",
          displayName: "Codex",
          text: "Reading App.tsx",
          updatedAtMs: 100,
        },
        {
          agent: "gemini",
          displayName: "Gemini",
          text: "Checking package data",
          updatedAtMs: 200,
        },
      ],
      acceptedEvents: 2,
      rejectedEvents: 0,
    },
    state: {
      currentPetId: largePet.id,
      pets: [largePet],
      onboardingComplete: false,
      petWindowSize: 1,
    },
  });
  const petPage = await harness.openPage("pet");
  await petPage.setViewportSize({ width: 100, height: 160 });
  await expect(petPage.getByRole("img", { name: "Ordered Grow Pet" })).toBeVisible();
  await expect
    .poll(() => harness.calls.filter((call) => call.command === "plugin:window|set_size").length)
    .toBeGreaterThan(0);
  await petPage.waitForTimeout(350);

  const initialSetSizeCalls = harness.calls.filter(
    (call) => call.command === "plugin:window|set_size",
  ).length;
  const initialSpriteWidth = await petPage
    .locator(".pet-sprite-frame")
    .evaluate((node) => node.getBoundingClientRect().width);
  const settingsPage = await harness.openPage("settings");
  await settingsPage.getByRole("tab", { name: "Preferences" }).click();
  const sizeSlider = settingsPage.getByRole("slider", { name: "Size" });

  await sizeSlider.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerType: "mouse",
  });
  await sizeSlider.dispatchEvent("pointermove", {
    clientX: 18,
    clientY: 10,
    pointerType: "mouse",
  });
  await expect
    .poll(() => harness.calls.filter((call) => call.command === "plugin:window|set_size").length)
    .toBeGreaterThan(initialSetSizeCalls);
  const maxWindowSetSizeCalls = harness.calls.filter(
    (call) => call.command === "plugin:window|set_size",
  ).length;

  await sizeSlider.evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "90");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await expect
    .poll(() =>
      petPage
        .locator(".pet-sprite-frame")
        .evaluate((node) => node.getBoundingClientRect().width),
    )
    .toBeGreaterThan(initialSpriteWidth);

  await sizeSlider.dispatchEvent("pointerup", {
    button: 0,
    pointerType: "mouse",
  });

  await expect
    .poll(() => harness.calls.filter((call) => call.command === "plugin:window|set_size").length)
    .toBeGreaterThan(maxWindowSetSizeCalls);
});

test("shrinking the size slider renders the smaller pet before shrinking the window", async ({
  browser,
}) => {
  const largePet = {
    ...pethover,
    id: "ordered-shrink-pet",
    slug: "ordered-shrink-pet",
    displayName: "Ordered Shrink Pet",
    frameWidth: 400,
    frameHeight: 400,
    spritePath: "/pets/ordered-shrink-pet/spritesheet.webp",
  };
  const harness = await createAppHarness(browser, {
    commandDelayMs: {
      "plugin:window|set_size": 300,
    },
    runtimeStatus: {
      port: 8765,
      endpoint: "http://127.0.0.1:8765/v1/events",
      currentState: { state: "idle", sinceMs: 0, idleAfterMs: null },
      messages: [
        {
          agent: "codex",
          displayName: "Codex",
          text: "Reading App.tsx",
          updatedAtMs: 100,
        },
        {
          agent: "gemini",
          displayName: "Gemini",
          text: "Checking package data",
          updatedAtMs: 200,
        },
      ],
      acceptedEvents: 2,
      rejectedEvents: 0,
    },
    state: {
      currentPetId: largePet.id,
      pets: [largePet],
      onboardingComplete: false,
      petWindowSize: 90,
    },
  });
  const petPage = await harness.openPage("pet");
  await petPage.setViewportSize({ width: 420, height: 460 });
  await expect(petPage.getByRole("img", { name: "Ordered Shrink Pet" })).toBeVisible();
  await expect
    .poll(() => harness.calls.filter((call) => call.command === "plugin:window|set_size").length)
    .toBeGreaterThan(0);
  await petPage.waitForTimeout(350);

  const initialSetSizeCalls = harness.calls.filter(
    (call) => call.command === "plugin:window|set_size",
  ).length;
  const initialSpriteWidth = await petPage
    .locator(".pet-sprite-frame")
    .evaluate((node) => node.getBoundingClientRect().width);
  const settingsPage = await harness.openPage("settings");
  await settingsPage.getByRole("tab", { name: "Preferences" }).click();
  const sizeSlider = settingsPage.getByRole("slider", { name: "Size" });

  await sizeSlider.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerType: "mouse",
  });
  await sizeSlider.dispatchEvent("pointermove", {
    clientX: 18,
    clientY: 10,
    pointerType: "mouse",
  });
  await expect
    .poll(() => harness.calls.filter((call) => call.command === "plugin:window|set_size").length)
    .toBeGreaterThan(initialSetSizeCalls);
  const maxWindowSetSizeCalls = harness.calls.filter(
    (call) => call.command === "plugin:window|set_size",
  ).length;

  await sizeSlider.evaluate((node) => {
    const input = node as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "1");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect
    .poll(() =>
      petPage
        .locator(".pet-sprite-frame")
        .evaluate((node) => node.getBoundingClientRect().width),
    )
    .toBeLessThan(initialSpriteWidth);

  await sizeSlider.dispatchEvent("pointerup", {
    button: 0,
    pointerType: "mouse",
  });
  await expect
    .poll(() => harness.calls.filter((call) => call.command === "plugin:window|set_size").length)
    .toBeGreaterThan(maxWindowSetSizeCalls);
});

test("dragging the pet window switches the pet into directional running states", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const petWindow = page.locator("main.pet-window");
  const sprite = page.locator(".pet-sprite");

  await expect(sprite).toHaveAttribute("data-pet-state", "idle");

  await petWindow.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 20,
    clientY: 20,
    pointerId: 1,
    pointerType: "mouse",
  });
  await page.dispatchEvent("body", "pointermove", {
    clientX: 44,
    clientY: 22,
    pointerId: 1,
    pointerType: "mouse",
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "running-right");

  await page.dispatchEvent("body", "pointermove", {
    clientX: 30,
    clientY: 22,
    pointerId: 1,
    pointerType: "mouse",
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "running-left");

  await page.dispatchEvent("body", "pointerup", {
    clientX: 30,
    clientY: 22,
    pointerId: 1,
    pointerType: "mouse",
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "idle");
});

test("pet drag animation ignores small pointer jitter", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const petWindow = page.locator("main.pet-window");
  const sprite = page.locator(".pet-sprite");

  await petWindow.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 80,
    clientY: 20,
    pointerId: 1,
    pointerType: "mouse",
  });
  await page.dispatchEvent("body", "pointermove", {
    clientX: 104,
    clientY: 22,
    pointerId: 1,
    pointerType: "mouse",
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "running-right");

  await page.dispatchEvent("body", "pointermove", {
    clientX: 101,
    clientY: 22,
    pointerId: 1,
    pointerType: "mouse",
  });
  await page.dispatchEvent("body", "pointermove", {
    clientX: 105,
    clientY: 22,
    pointerId: 1,
    pointerType: "mouse",
  });
  await page.dispatchEvent("body", "pointermove", {
    clientX: 100,
    clientY: 22,
    pointerId: 1,
    pointerType: "mouse",
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "running-right");

  await page.dispatchEvent("body", "pointermove", {
    clientX: 84,
    clientY: 22,
    pointerId: 1,
    pointerType: "mouse",
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "running-left");

  await page.dispatchEvent("body", "pointerup", {
    clientX: 84,
    clientY: 22,
    pointerId: 1,
    pointerType: "mouse",
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "idle");
});

test("pet drag animation follows native window movement direction", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const petWindow = page.locator("main.pet-window");
  const sprite = page.locator(".pet-sprite");

  await expect(sprite).toHaveAttribute("data-pet-state", "idle");

  await petWindow.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 80,
    clientY: 20,
    pointerId: 1,
    pointerType: "mouse",
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "idle");

  await page.evaluate(() => {
    window.__pethoverTestEmit("tauri://move", { x: 120, y: 40 });
    window.__pethoverTestEmit("tauri://move", { x: 96, y: 40 });
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "running-left");

  await page.evaluate(() => {
    window.__pethoverTestEmit("tauri://move", { x: 130, y: 40 });
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "running-right");

  await page.dispatchEvent("body", "pointerup", {
    clientX: 80,
    clientY: 20,
    pointerId: 1,
    pointerType: "mouse",
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "idle");
});

test("size slider window movement does not change the pet direction animation", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const petPage = await harness.openPage("pet");
  const settingsPage = await harness.openPage("settings");
  await settingsPage.getByRole("tab", { name: "Preferences" }).click();
  const sprite = petPage.locator(".pet-sprite");

  await expect(sprite).toHaveAttribute("data-pet-state", "idle");

  const sizeControl = settingsPage.locator(".pet-size-control");
  await sizeControl.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerType: "mouse",
  });
  await sizeControl.dispatchEvent("pointermove", {
    clientX: 18,
    clientY: 10,
    pointerType: "mouse",
  });
  await petPage.evaluate(() => {
    window.__pethoverTestEmit("tauri://move", { x: 120, y: 40 });
    window.__pethoverTestEmit("tauri://move", { x: 96, y: 40 });
  });

  await expect(sprite).toHaveAttribute("data-pet-state", "idle");
});

test("pet drag animation ignores small opposite-direction jitter", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const petWindow = page.locator("main.pet-window");
  const sprite = page.locator(".pet-sprite");

  await petWindow.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 80,
    clientY: 20,
    pointerId: 1,
    pointerType: "mouse",
  });

  await page.evaluate(() => {
    window.__pethoverTestEmit("tauri://move", { x: 100, y: 40 });
    window.__pethoverTestEmit("tauri://move", { x: 120, y: 40 });
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "running-right");

  await page.evaluate(() => {
    window.__pethoverTestEmit("tauri://move", { x: 117, y: 40 });
    window.__pethoverTestEmit("tauri://move", { x: 121, y: 40 });
    window.__pethoverTestEmit("tauri://move", { x: 116, y: 40 });
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "running-right");

  await page.evaluate(() => {
    window.__pethoverTestEmit("tauri://move", { x: 96, y: 40 });
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "running-left");

  await page.dispatchEvent("body", "pointerup", {
    clientX: 80,
    clientY: 20,
    pointerId: 1,
    pointerType: "mouse",
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "idle");
});

test("double-clicking the pet window opens settings", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const petWindow = page.locator("main.pet-window");

  await petWindow.dispatchEvent("pointerdown", {
    button: 0,
    detail: 1,
    pointerType: "mouse",
  });
  await petWindow.dispatchEvent("pointerdown", {
    button: 0,
    detail: 2,
    pointerType: "mouse",
  });

  await expect
    .poll(() => harness.calls)
    .toContainEqual({ command: "open_settings_window", args: {} });
});

test("double-clicking pet reopens settings after the settings close button hides it", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const settingsPage = await harness.openPage("settings");

  await settingsPage.getByRole("button", { name: "Close" }).click();
  expect(harness.calls).toContainEqual({
    command: "plugin:window|hide",
    args: { label: "settings" },
  });

  const petPage = await harness.openPage("pet");
  const petWindow = petPage.locator("main.pet-window");

  await petWindow.dispatchEvent("pointerdown", {
    button: 0,
    detail: 1,
    pointerType: "mouse",
  });
  await petWindow.dispatchEvent("pointerdown", {
    button: 0,
    detail: 2,
    pointerType: "mouse",
  });

  await expect
    .poll(() => harness.calls)
    .toContainEqual({ command: "open_settings_window", args: {} });
});

test("second pet pointer press opens settings instead of starting another window drag", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const petWindow = page.locator("main.pet-window");

  await petWindow.dispatchEvent("pointerdown", {
    button: 0,
    detail: 1,
    pointerType: "mouse",
  });
  await petWindow.dispatchEvent("pointerdown", {
    button: 0,
    detail: 2,
    pointerType: "mouse",
  });

  expect(
    harness.calls.filter((call) => call.command === "plugin:window|start_dragging"),
  ).toHaveLength(1);
  await expect
    .poll(() => harness.calls)
    .toContainEqual({ command: "open_settings_window", args: {} });
});

test("pet window shows each agent message above the pet", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    runtimeStatus: {
      port: 8765,
      endpoint: "http://127.0.0.1:8765/v1/events",
      currentState: { state: "running", sinceMs: 100, idleAfterMs: 1600 },
      messages: [
        {
          agent: "codex",
          displayName: "Codex",
          text: "Reading App.tsx",
          updatedAtMs: 100,
        },
        {
          agent: "claude-code",
          displayName: "Claude Code",
          text: "Running pnpm",
          updatedAtMs: 200,
        },
      ],
      acceptedEvents: 2,
      rejectedEvents: 0,
    },
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");

  const panel = page.getByTestId("pet-agent-messages");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("pet-agent-message")).toHaveText([
    "Reading App.tsx",
    "Running pnpm",
  ]);
  await expect(panel.locator("img.pet-agent-icon")).toHaveCount(2);
});

test("clicking an agent message row does not hide the message", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    runtimeStatus: {
      port: 8765,
      endpoint: "http://127.0.0.1:8765/v1/events",
      currentState: { state: "running", sinceMs: 100, idleAfterMs: 1600 },
      messages: [
        {
          agent: "codex",
          displayName: "Codex",
          text: "Thinking...",
          updatedAtMs: 100,
        },
      ],
      acceptedEvents: 1,
      rejectedEvents: 0,
    },
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const message = page.getByTestId("pet-agent-message");

  await expect(message).toHaveText("Thinking...");

  await message.dispatchEvent("click");
  await expect(page.getByTestId("pet-agent-message")).toHaveText("Thinking...");
});

test("pet window renders simultaneous hook activity for all supported agents", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    runtimeStatus: {
      port: 8765,
      endpoint: "http://127.0.0.1:8765/v1/events",
      currentState: { state: "idle", sinceMs: 0, idleAfterMs: null },
      messages: [],
      acceptedEvents: 0,
      rejectedEvents: 0,
    },
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");

  await expect(page.getByTestId("pet-agent-messages")).toHaveCount(0);

  await page.evaluate(() => {
    window.__pethoverTestEmit("pet-state-changed", {
      currentState: { state: "running", sinceMs: 300, idleAfterMs: 1600 },
      messages: [
        {
          agent: "codex",
          displayName: "Codex",
          text: "Reading App.tsx",
          updatedAtMs: 300,
        },
        {
          agent: "claude-code",
          displayName: "Claude Code",
          text: "Editing README.md",
          updatedAtMs: 320,
        },
        {
          agent: "gemini",
          displayName: "Gemini",
          text: "Running tests",
          updatedAtMs: 340,
        },
        {
          agent: "opencode",
          displayName: "OpenCode",
          text: "Reviewing diff",
          updatedAtMs: 360,
        },
      ],
    });
  });

  const panel = page.getByTestId("pet-agent-messages");
  const messages = panel.getByTestId("pet-agent-message");

  await expect(panel).toBeVisible();
  await expect(messages).toHaveText([
    "Reading App.tsx",
    "Editing README.md",
    "Running tests",
    "Reviewing diff",
  ]);
  await expect(panel.locator("img.pet-agent-icon")).toHaveCount(4);
  await expect(panel.locator('img[alt="Codex"]')).toBeVisible();
  await expect(panel.locator('img[alt="Claude Code"]')).toBeVisible();
  await expect(panel.locator('img[alt="Gemini"]')).toBeVisible();
  await expect(panel.locator('img[alt="OpenCode"]')).toBeVisible();
  await expect(page.locator(".pet-sprite")).toHaveAttribute("data-pet-state", "running");
});

test("pet agent message truncates long text with ellipsis", async ({ browser }) => {
  const longText =
    "This is a very long message that should definitely exceed the maximum width of the message bubble container and thus should be truncated with an ellipsis instead of wrapping to multiple lines.";
  const harness = await createAppHarness(browser, {
    runtimeStatus: {
      port: 8765,
      endpoint: "http://127.0.0.1:8765/v1/events",
      currentState: { state: "running", sinceMs: 100, idleAfterMs: 1600 },
      messages: [
        {
          agent: "codex",
          displayName: "Codex",
          text: longText,
          updatedAtMs: 100,
        },
      ],
      acceptedEvents: 1,
      rejectedEvents: 0,
    },
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");

  const message = page.getByTestId("pet-agent-message");
  await expect(message).toBeVisible();
  await expect(message.locator("img.pet-agent-icon")).toBeVisible();

  const text = message.locator(".pet-agent-text");
  // Verify CSS properties for truncation on the text span
  await expect(text).toHaveCSS("text-overflow", "ellipsis");
  await expect(text).toHaveCSS("white-space", "nowrap");
  await expect(text).toHaveCSS("overflow", "hidden");
});

test("clicking the x icon on an agent message temporarily hides it on the page", async ({
  browser,
}) => {
  const agentId = "codex";
  const harness = await createAppHarness(browser, {
    runtimeStatus: {
      port: 8765,
      endpoint: "http://127.0.0.1:8765/v1/events",
      currentState: { state: "running", sinceMs: 100, idleAfterMs: 1600 },
      messages: [
        {
          agent: agentId,
          displayName: "Codex",
          text: "Thinking...",
          updatedAtMs: 100,
        },
      ],
      acceptedEvents: 1,
      rejectedEvents: 0,
    },
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });

  const page = await harness.openPage("pet");
  const message = page.getByTestId("pet-agent-message");
  await expect(message).toBeVisible();

  // Hover to make the dismiss button visible
  await message.hover();

  const dismissButton = message.locator("button.pet-agent-message-dismiss");
  await expect(dismissButton).toBeVisible();

  await dismissButton.click();

  await expect(page.getByTestId("pet-agent-message")).toHaveCount(0);
  expect(harness.calls.some((call) => call.command === "dismiss_agent_message")).toBe(false);
});
