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
  await expect(spriteFrame).toHaveAttribute("data-dragging", "true");

  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 90, clientY: 50, pointerId: 1 } as PointerEventInit),
    );
  });
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
