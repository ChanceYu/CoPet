import { expect, test } from "@playwright/test";

import { createAppHarness, pethover } from "./app-harness";

test("clicking the pet sprite triggers jumping state", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const spriteFrame = page.locator(".pet-sprite-frame");
  const sprite = page.locator(".pet-sprite");

  await expect(sprite).toHaveAttribute("data-pet-state", "idle");

  await spriteFrame.dispatchEvent("click", { button: 0, detail: 1 });
  await expect(sprite).toHaveAttribute("data-pet-state", "jumping");
});

test("click auto-restores after duration", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const spriteFrame = page.locator(".pet-sprite-frame");
  const sprite = page.locator(".pet-sprite");

  await spriteFrame.dispatchEvent("click", { button: 0, detail: 1 });
  await expect(sprite).toHaveAttribute("data-pet-state", "jumping");

  await page.waitForTimeout(800);
  await expect(sprite).toHaveAttribute("data-pet-state", "idle");
});

test("hover triggers directional looking and frame data-dragging stays false", async ({
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
  const spriteFrame = page.locator(".pet-sprite-frame");
  const sprite = page.locator(".pet-sprite");

  const box = await spriteFrame.boundingBox();
  if (!box) throw new Error("pet sprite frame not laid out");

  await spriteFrame.dispatchEvent("pointerover", {
    clientX: box.x + box.width * 0.8,
    clientY: box.y + box.height / 2,
    pointerType: "mouse",
    isPrimary: true,
    pointerId: 1,
    bubbles: true,
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "running-right");
  await expect(spriteFrame).toHaveAttribute("data-dragging", "false");
});

test("dragging the pet sprite triggers directional running and dragging flag", async ({
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
  const spriteFrame = page.locator(".pet-sprite-frame");
  const sprite = page.locator(".pet-sprite");

  await expect(sprite).toHaveAttribute("data-pet-state", "idle");

  await spriteFrame.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 50,
    clientY: 50,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
    detail: 1,
  });
  // data-dragging stays false until actual movement (matches user-visible semantic)
  await expect(spriteFrame).toHaveAttribute("data-dragging", "false");

  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 90, clientY: 50, pointerId: 1 } as PointerEventInit),
    );
  });
  await expect(spriteFrame).toHaveAttribute("data-dragging", "true");
  await expect(sprite).toHaveAttribute("data-pet-state", "running-right");

  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 40, clientY: 50, pointerId: 1 } as PointerEventInit),
    );
  });
  await expect(sprite).toHaveAttribute("data-pet-state", "running-left");

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 } as PointerEventInit));
  });
  await expect(spriteFrame).toHaveAttribute("data-dragging", "false");
});

test("double-clicking the pet triggers surprised + questionMark overlay", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const spriteFrame = page.locator(".pet-sprite-frame");
  const sprite = page.locator(".pet-sprite");

  await spriteFrame.dispatchEvent("click", { button: 0, detail: 2 });
  await expect(sprite).toHaveAttribute("data-pet-state", "waving");
  await expect(spriteFrame).toHaveAttribute("data-emotion", "question-mark");
});

test("double-click while agent is thinking does not dismiss the loading bubble", async ({
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
  const spriteFrame = page.locator(".pet-sprite-frame");
  const sprite = page.locator(".pet-sprite");

  // Wait for the initial render to settle.
  await expect(sprite).toHaveAttribute("data-pet-state", "idle");

  // Drive the agent into "thinking" state via the existing emitRuntimeUpdate helper.
  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "jumping" },
    messages: [
      { agent: "claude", displayName: "Claude", text: "thinking", updatedAtMs: 1000 },
    ],
  });
  await page.waitForTimeout(100);
  await expect(spriteFrame).toHaveAttribute("data-emotion", "loading-bubble");

  // Simulate a double-click (detail=2). Even though the input transitions to
  // surprised, the emotion overlay must remain loadingBubble.
  await spriteFrame.dispatchEvent("click", { button: 0, detail: 2 });
  await page.waitForTimeout(1000);
  await expect(spriteFrame).toHaveAttribute("data-emotion", "loading-bubble");
});

test("double-click no longer opens settings window", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const spriteFrame = page.locator(".pet-sprite-frame");

  const before = harness.calls.filter((c) => c.command === "open_settings_window").length;
  await spriteFrame.dispatchEvent("click", { button: 0, detail: 2 });
  await page.waitForTimeout(200);
  const after = harness.calls.filter((c) => c.command === "open_settings_window").length;
  expect(after - before).toBe(0);
});

test("long-press (>800ms hold without movement) triggers pettedSlow + heart", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const spriteFrame = page.locator(".pet-sprite-frame");
  const sprite = page.locator(".pet-sprite");

  await spriteFrame.dispatchEvent("pointerdown", {
    button: 0,
    clientX: 50,
    clientY: 50,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    detail: 1,
  });

  await page.waitForTimeout(900);
  await expect(sprite).toHaveAttribute("data-pet-state", "waiting");
  await expect(spriteFrame).toHaveAttribute("data-emotion", "heart");

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 } as PointerEventInit));
  });
});

test("3 clicks within 1.5s escalate to petted + heart", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const spriteFrame = page.locator(".pet-sprite-frame");
  const sprite = page.locator(".pet-sprite");

  for (let i = 0; i < 3; i++) {
    await spriteFrame.dispatchEvent("click", { button: 0, detail: 1 });
    await page.waitForTimeout(150);
  }
  await expect(sprite).toHaveAttribute("data-pet-state", "jumping");
  await expect(spriteFrame).toHaveAttribute("data-emotion", "heart");
});

test("double-click does not contaminate rapid-click history", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const spriteFrame = page.locator(".pet-sprite-frame");
  const sprite = page.locator(".pet-sprite");

  // A double-click followed by exactly TWO single clicks should NOT escalate to petted.
  await spriteFrame.dispatchEvent("click", { button: 0, detail: 2 });
  await page.waitForTimeout(950); // let surprised reaction time out
  await spriteFrame.dispatchEvent("click", { button: 0, detail: 1 });
  await page.waitForTimeout(150);
  await spriteFrame.dispatchEvent("click", { button: 0, detail: 1 });
  await page.waitForTimeout(50);

  // After 2 deliberate single-clicks post-doubleclick, sprite should be happy
  // (jumping) — NOT petted (also jumping). They share the sprite row, so
  // discriminate via emotion overlay: petted shows heart, happy shows nothing.
  await expect(spriteFrame).not.toHaveAttribute("data-emotion", "heart");
});

test("drag-land after ≥200px movement triggers surprised + sparkle", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const spriteFrame = page.locator(".pet-sprite-frame");
  const sprite = page.locator(".pet-sprite");

  await spriteFrame.dispatchEvent("pointerdown", {
    button: 0, clientX: 50, clientY: 50, pointerId: 1, pointerType: "mouse", isPrimary: true, detail: 1,
  });
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 50, pointerId: 1 } as PointerEventInit));
  });
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 } as PointerEventInit));
  });

  await expect(sprite).toHaveAttribute("data-pet-state", "waving");
  await expect(spriteFrame).toHaveAttribute("data-emotion", "sparkle");
});

test("double-click surprised yields question-mark; drag-land surprised yields sparkle", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const spriteFrame = page.locator(".pet-sprite-frame");

  await spriteFrame.dispatchEvent("click", { button: 0, detail: 2 });
  await expect(spriteFrame).toHaveAttribute("data-emotion", "question-mark");

  // Wait for surprised to fully clear before testing drag-land
  await page.waitForTimeout(1100);

  await spriteFrame.dispatchEvent("pointerdown", {
    button: 0, clientX: 50, clientY: 50, pointerId: 2, pointerType: "mouse", isPrimary: true, detail: 1,
  });
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 50, pointerId: 2 } as PointerEventInit));
  });
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2 } as PointerEventInit));
  });
  await expect(spriteFrame).toHaveAttribute("data-emotion", "sparkle");
});

test("a second double-click within cooldown is a no-op", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    state: {
      currentPetId: pethover.id,
      pets: [pethover],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const spriteFrame = page.locator(".pet-sprite-frame");
  const sprite = page.locator(".pet-sprite");

  await spriteFrame.dispatchEvent("click", { button: 0, detail: 2 });
  await expect(sprite).toHaveAttribute("data-pet-state", "waving");
  await page.waitForTimeout(200);

  // Wait for surprised to auto-clear (800ms total, 200ms elapsed, need 600ms more)
  await page.waitForTimeout(700);
  await expect(sprite).toHaveAttribute("data-pet-state", "idle");

  // Now within doubleClick cooldown window (1500ms), a second double-click should not retrigger
  await spriteFrame.dispatchEvent("click", { button: 0, detail: 2 });
  await page.waitForTimeout(100);
  await expect(sprite).toHaveAttribute("data-pet-state", "idle");
});
