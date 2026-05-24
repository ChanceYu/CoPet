import { expect, test } from "@playwright/test";
import { petStartupAnimationConfig } from "../lib/petStartupAnimation";
import {
  copet,
  copetSoundPack,
  createAppHarness,
  goku,
  retroSoundPack,
} from "./app-harness";

function runtimeWithMessage() {
  return {
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
    ],
    acceptedEvents: 1,
    rejectedEvents: 0,
  };
}

test("startup animation hides messages while running-left from off-screen", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    reducedMotion: "no-preference",
    commandDelayMs: {
      run_pet_startup_window_animation: petStartupAnimationConfig.enterDurationMs,
    },
    runtimeStatus: runtimeWithMessage(),
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");

  await expect(page.locator(".pet-sprite")).toHaveAttribute(
    "data-pet-state",
    "running-left",
  );
  await expect(page.getByTestId("pet-agent-message")).toHaveCount(0);
  await expect
    .poll(() => harness.invocations("run_pet_startup_window_animation"))
    .toEqual([
      {
        command: "run_pet_startup_window_animation",
        args: { durationMs: petStartupAnimationConfig.enterDurationMs },
      },
    ]);
});

test("arrival shows heart, plays pettedSlow, then restores messages and Agent state", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    reducedMotion: "no-preference",
    commandDelayMs: {
      run_pet_startup_window_animation: petStartupAnimationConfig.enterDurationMs,
    },
    runtimeStatus: runtimeWithMessage(),
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const sprite = page.locator(".pet-sprite");
  const spriteFrame = page.locator(".pet-sprite-frame");

  await expect(sprite).toHaveAttribute("data-pet-state", "running-left");
  await expect(sprite).toHaveAttribute("data-pet-state", "waiting");
  await expect(spriteFrame).toHaveAttribute("data-emotion", "heart");
  await expect(page.getByTestId("pet-agent-message")).toHaveCount(0);

  await expect.poll(() => harness.playedSoundUrls(page)).toEqual([
    "/sounds/copet/yay.mp3",
    "/sounds/copet/sigh.mp3",
  ]);

  await expect(page.getByTestId("pet-agent-message"), {
    timeout: petStartupAnimationConfig.arrivalDurationMs + 1000,
  }).toHaveText("Reading App.tsx");
  await expect(sprite).toHaveAttribute("data-pet-state", "running");
  await expect(spriteFrame).toHaveAttribute("data-emotion", "");
  await expect.poll(() => harness.playedSoundUrls(page)).toEqual([
    "/sounds/copet/yay.mp3",
    "/sounds/copet/sigh.mp3",
  ]);
});

test("messages received during startup render after startup completes", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    reducedMotion: "no-preference",
    commandDelayMs: {
      run_pet_startup_window_animation: petStartupAnimationConfig.enterDurationMs,
    },
    runtimeStatus: runtimeWithMessage(),
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");

  await expect(page.locator(".pet-sprite")).toHaveAttribute(
    "data-pet-state",
    "running-left",
  );
  await harness.emitRuntimeUpdate(page, {
    currentState: { state: "running", sinceMs: 200, idleAfterMs: 1600 },
    messages: [
      {
        agent: "codex",
        displayName: "Codex",
        text: "Writing pet startup spec",
        updatedAtMs: 200,
      },
    ],
  });
  await expect(page.getByTestId("pet-agent-message")).toHaveCount(0);

  await expect(page.getByTestId("pet-agent-message"), {
    timeout: petStartupAnimationConfig.arrivalDurationMs + 1000,
  }).toHaveText("Writing pet startup spec");
});

test("startup enter phase does not run frontend reset-position sizing", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    reducedMotion: "no-preference",
    commandDelayMs: {
      run_pet_startup_window_animation: petStartupAnimationConfig.enterDurationMs,
    },
    runtimeStatus: runtimeWithMessage(),
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");

  await expect(page.locator(".pet-sprite")).toHaveAttribute(
    "data-pet-state",
    "running-left",
  );
  await page.waitForTimeout(100);

  expect(harness.invocations("plugin:window|set_position")).toHaveLength(0);
});

test("startup stays in arrival for hooks mounted after enter resolves", async ({
  browser,
}) => {
  const page = await browser.newPage();
  let routedProbe = false;
  await page.route(/.*/, async (route) => {
    if (
      route.request().resourceType() !== "document" ||
      !route.request().url().includes("/strict-startup-probe")
    ) {
      await route.continue();
      return;
    }

    routedProbe = true;
    await route.fulfill({
      contentType: "text/html",
      body: `<html><body><div id="root"></div></body></html>`,
    });
  });

  await page.goto("http://127.0.0.1:1420/strict-startup-probe");
  expect(routedProbe, page.url()).toBe(true);
  await page.evaluate(async () => {
    type StrictStartupWindow = typeof window & {
      __strictStartupCommandCalls: Array<{
        command: string;
        args?: Record<string, unknown>;
      }>;
      __strictStartupSounds: string[];
      __resolveStrictStartupCommand: () => void;
      __showStrictStartupSecondProbe: () => void;
      __TAURI_INTERNALS__: {
        metadata: {
          currentWindow: { label: string };
          currentWebview: { label: string };
        };
        transformCallback: () => number;
        unregisterCallback: () => void;
        convertFileSrc: (filePath: string) => string;
        invoke: (
          command: string,
          args?: Record<string, unknown>,
        ) => Promise<unknown>;
      };
    };

    const testWindow = window as StrictStartupWindow;
    let resolveStartupCommand = () => undefined;
    testWindow.__strictStartupCommandCalls = [];
    testWindow.__strictStartupSounds = [];
    testWindow.__resolveStrictStartupCommand = () => resolveStartupCommand();
    testWindow.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "pet" },
        currentWebview: { label: "pet" },
      },
      transformCallback: () => 1,
      unregisterCallback: () => undefined,
      convertFileSrc: (filePath) => filePath,
      invoke: async (command, args = {}) => {
        testWindow.__strictStartupCommandCalls.push({ command, args });
        if (command === "run_pet_startup_window_animation") {
          return new Promise<boolean>((resolve) => {
            resolveStartupCommand = () => resolve(true);
          });
        }
        return null;
      },
    };

    const ReactModule = await import("/node_modules/.vite/deps/react.js");
    const React = ReactModule.default;
    const ReactDomClient = await import(
      "/node_modules/.vite/deps/react-dom_client.js"
    );
    const createRoot = ReactDomClient.default.createRoot;
    const { usePetStartupAnimation } = await import(
      "/src/hooks/usePetStartupAnimation.ts"
    );

    function StartupProbe({ testId }: { testId: string }) {
      const startup = usePetStartupAnimation({
        enabled: true,
        selectedPetId: "copet",
        selectedSoundPackId: "system:copet",
        onInteractionSound: (kind: string) => {
          testWindow.__strictStartupSounds.push(kind);
        },
        onAgentSound: (kind: string) => {
          testWindow.__strictStartupSounds.push(kind);
        },
      });
      const bodySpriteRow = startup.composedOverride?.bodySpriteRow ?? "normal";
      return React.createElement(
        "div",
        {
          "data-testid": testId,
          "data-body": bodySpriteRow,
          "data-hidden": startup.hideMessages ? "true" : "false",
        },
        startup.hideMessages ? "" : "Reading App.tsx",
      );
    }

    function StartupProbeShell() {
      const [showSecondProbe, setShowSecondProbe] = React.useState(false);
      testWindow.__showStrictStartupSecondProbe = () => {
        setShowSecondProbe(true);
      };
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(StartupProbe, { testId: "startup-probe" }),
        showSecondProbe
          ? React.createElement(StartupProbe, { testId: "startup-probe-remount" })
          : null,
      );
    }

    createRoot(document.getElementById("root") as HTMLElement).render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(StartupProbeShell),
      ),
    );
  });
  const probe = page.getByTestId("startup-probe");

  await expect(probe).toHaveAttribute("data-body", "running-left");
  await expect(probe).toHaveAttribute("data-hidden", "true");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __strictStartupCommandCalls: unknown[];
            }
          ).__strictStartupCommandCalls.length,
      ),
    )
    .toBe(1);

  await page.evaluate(() => {
    (
      window as typeof window & {
        __resolveStrictStartupCommand: () => void;
      }
    ).__resolveStrictStartupCommand();
  });

  await expect(probe).toHaveAttribute("data-body", "waiting");
  await expect(probe).toHaveAttribute("data-hidden", "true");
  await page.evaluate(() => {
    (
      window as typeof window & {
        __showStrictStartupSecondProbe: () => void;
      }
    ).__showStrictStartupSecondProbe();
  });
  const remountedProbe = page.getByTestId("startup-probe-remount");
  await expect(remountedProbe).toHaveAttribute("data-body", "waiting");
  await expect(remountedProbe).toHaveAttribute("data-hidden", "true");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __strictStartupSounds: string[];
            }
          ).__strictStartupSounds,
      ),
    )
    .toEqual([
      petStartupAnimationConfig.enterSoundKey,
      petStartupAnimationConfig.arrivalSoundKey,
    ]);

  await expect(probe, {
    timeout: petStartupAnimationConfig.arrivalDurationMs + 1000,
  }).toHaveText("Reading App.tsx");
  await expect(probe).toHaveAttribute("data-body", "normal");
  await expect(probe).toHaveAttribute("data-hidden", "false");
});

test("tray show does not replay startup animation", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    reducedMotion: "no-preference",
    commandDelayMs: {
      run_pet_startup_window_animation: petStartupAnimationConfig.enterDurationMs,
    },
    runtimeStatus: runtimeWithMessage(),
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const sprite = page.locator(".pet-sprite");

  await expect(page.getByTestId("pet-agent-message"), {
    timeout: petStartupAnimationConfig.arrivalDurationMs + 1000,
  }).toHaveText("Reading App.tsx");
  const startupAnimationCalls =
    harness.invocations("run_pet_startup_window_animation").length;

  await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("toggle_pet_window_visibility"),
  );
  await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("toggle_pet_window_visibility"),
  );

  await page.waitForTimeout(100);
  expect(harness.invocations("run_pet_startup_window_animation")).toHaveLength(
    startupAnimationCalls,
  );
  await expect(page.getByTestId("pet-agent-message")).toHaveText("Reading App.tsx");
  await expect(sprite).toHaveAttribute("data-pet-state", "running");
});

test("startup command failure restores normal messages and Agent state", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    reducedMotion: "no-preference",
    commandErrors: {
      run_pet_startup_window_animation: "startup window animation failed",
    },
    runtimeStatus: runtimeWithMessage(),
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");

  await expect
    .poll(() => harness.invocations("run_pet_startup_window_animation"))
    .toEqual([
      {
        command: "run_pet_startup_window_animation",
        args: { durationMs: petStartupAnimationConfig.enterDurationMs },
      },
    ]);
  await expect(page.getByTestId("pet-agent-message")).toHaveText("Reading App.tsx");
  await expect(page.locator(".pet-sprite")).toHaveAttribute(
    "data-pet-state",
    "running",
  );
  await expect(page.locator(".pet-sprite-frame")).toHaveAttribute(
    "data-emotion",
    "",
  );
});

test("hidden pet during startup skips arrival sound", async ({ browser }) => {
  // The enter swoosh fires at invoke time (before the frontend knows whether
  // Rust will report the window as hidden), so it still plays. The arrival
  // heart + sigh are gated on result.completed and stay silent.
  const harness = await createAppHarness(browser, {
    reducedMotion: "no-preference",
    commandResults: {
      run_pet_startup_window_animation: false,
    },
    runtimeStatus: runtimeWithMessage(),
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");

  await expect
    .poll(() => harness.invocations("run_pet_startup_window_animation"))
    .toEqual([
      {
        command: "run_pet_startup_window_animation",
        args: { durationMs: petStartupAnimationConfig.enterDurationMs },
      },
    ]);
  await expect(page.getByTestId("pet-agent-message")).toHaveText("Reading App.tsx");
  await expect(page.locator(".pet-sprite")).toHaveAttribute(
    "data-pet-state",
    "running",
  );
  await expect.poll(() => harness.playedSoundUrls(page)).toEqual([
    "/sounds/copet/yay.mp3",
  ]);
});

test("changing pet during startup stops the startup override", async ({ browser }) => {
  const harness = await createAppHarness(browser, {
    reducedMotion: "no-preference",
    commandDelayMs: {
      run_pet_startup_window_animation: petStartupAnimationConfig.enterDurationMs,
    },
    runtimeStatus: runtimeWithMessage(),
    state: {
      currentPetId: copet.id,
      pets: [copet, goku],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const sprite = page.locator(".pet-sprite");

  await expect(sprite).toHaveAttribute("data-pet-state", "running-left");
  await page.evaluate((petId) => {
    void window.__TAURI_INTERNALS__.invoke("select_pet", { petId });
  }, goku.id);

  await expect(page.getByRole("img", { name: "Goku" })).toBeVisible();
  await expect(page.getByTestId("pet-agent-message")).toHaveText("Reading App.tsx");
  await expect(sprite).toHaveAttribute("data-pet-state", "running");
  await page.waitForTimeout(petStartupAnimationConfig.enterDurationMs + 100);
  await expect(sprite).toHaveAttribute("data-pet-state", "running");
  await expect(page.locator(".pet-sprite-frame")).toHaveAttribute(
    "data-emotion",
    "",
  );
});

test("changing sound pack during startup stops the startup override", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    reducedMotion: "no-preference",
    commandDelayMs: {
      run_pet_startup_window_animation: petStartupAnimationConfig.enterDurationMs,
    },
    runtimeStatus: runtimeWithMessage(),
    state: {
      currentPetId: copet.id,
      currentSoundPackId: copetSoundPack.id,
      pets: [copet],
      soundPacks: [copetSoundPack, retroSoundPack],
      onboardingComplete: false,
    },
  });
  const page = await harness.openPage("pet");
  const sprite = page.locator(".pet-sprite");

  await expect(sprite).toHaveAttribute("data-pet-state", "running-left");
  await page.evaluate((soundPackId) => {
    void window.__TAURI_INTERNALS__.invoke("select_sound_pack", { soundPackId });
  }, retroSoundPack.id);

  await expect(page.getByTestId("pet-agent-message")).toHaveText("Reading App.tsx");
  await expect(sprite).toHaveAttribute("data-pet-state", "running");
  await page.waitForTimeout(petStartupAnimationConfig.enterDurationMs + 100);
  await expect(sprite).toHaveAttribute("data-pet-state", "running");
  await expect(page.locator(".pet-sprite-frame")).toHaveAttribute(
    "data-emotion",
    "",
  );
  // Enter swoosh fires from the original copet pack before the sound pack
  // change lands; arrival sigh is suppressed because the startup override
  // bails out as soon as the identity changes.
  await expect.poll(() => harness.playedSoundUrls(page)).toEqual([
    "/sounds/copet/yay.mp3",
  ]);
});

test("reduced motion skips startup animation and shows messages immediately", async ({
  browser,
}) => {
  const harness = await createAppHarness(browser, {
    reducedMotion: "reduce",
    runtimeStatus: runtimeWithMessage(),
    state: {
      currentPetId: copet.id,
      pets: [copet],
      onboardingComplete: false,
      agentMessageDisplay: "all",
    },
  });
  const page = await harness.openPage("pet");

  await expect(page.getByTestId("pet-agent-message")).toHaveText("Reading App.tsx");
  await expect(page.locator(".pet-sprite")).toHaveAttribute(
    "data-pet-state",
    "running",
  );
  expect(harness.invocations("run_pet_startup_window_animation")).toEqual([
    {
      command: "run_pet_startup_window_animation",
      args: { durationMs: 0 },
    },
  ]);
});
