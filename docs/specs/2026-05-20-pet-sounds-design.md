# Pet Sounds Design

- Status: Draft, approved in brainstorming
- Date: 2026-05-20
- Scope: feature module `feature/pet-sounds`
- Branch/worktree: `feature/pet-sounds` in `.worktrees/pet-sounds/`

## 1. Background

The built-in `pethover` pet package already ships short MP3 files under
`src-tauri/assets/pets/pethover/pethover/audio/` and declares them in
`src-tauri/assets/pets/pethover/pet.json` under
`pethover.audio.interactionSounds` and `pethover.audio.agentSounds`.

The app currently exposes a persisted `enableClickSounds` preference, but the
settings switch is disabled and marked "Coming soon". No runtime code reads the
PetHover audio manifest or plays sound.

This feature implements both user interaction sounds and agent state sounds
from the package manifest. It keeps package assets under `src-tauri/assets/`
because Rust enumerates pet packages at runtime and the webview accesses them
through Tauri's asset protocol.

## 2. Goals

1. Read `pethover.audio.interactionSounds` and `pethover.audio.agentSounds`
   from pet package manifests.
2. Expose validated sound file paths to the frontend as part of `PetSummary`.
3. Play interaction sounds for successful gesture events:
   `click`, `doubleClick`, `petted`, `pettedSlow`, and `dragLand`.
4. Play agent state sounds for runtime states:
   `thinking`, `editing`, `inspecting`, `awaitingApproval`, `celebrating`, and
   `failed`.
5. Turn the existing disabled "Enable click sounds" setting into a single
   enabled "Pet sounds" switch that controls both sound groups.
6. Keep animation, state updates, and settings usable when sound files are
   missing, invalid, unsupported, or blocked by the browser.

## 3. Non-goals

- No per-channel volume slider.
- No separate interaction and agent sound toggles in v1.
- No native Rust audio playback layer.
- No non-MP3 sound support.
- No automatic loudness analysis in v1.
- No UI for listing individual sounds or reporting skipped sound files.

## 4. Chosen approach

Rust validates package sound paths and exposes them through `PetSummary`; the
frontend plays them through `HTMLAudioElement` after converting paths with
`convertFileSrc`.

This matches the existing Tauri boundary:

- Rust owns package discovery and filesystem validation.
- Frontend owns user events, runtime state presentation, and HTML5 media
  playback.
- Presentational components do not call `invoke` for sound behavior.

Rejected approaches:

- Letting the frontend infer package directories from `spritePath` would move
  untrusted manifest parsing and path validation into the webview.
- Playing sounds natively from Rust would add a platform audio dependency and
  make tests and bundling more complex than needed for short feedback clips.

## 5. Manifest schema

PetHover sound metadata lives under the existing top-level `pethover` object:

```json
{
  "pethover": {
    "audio": {
      "interactionSounds": {
        "click": "pethover/audio/click.mp3",
        "doubleClick": "pethover/audio/surprised.mp3",
        "petted": "pethover/audio/purr.mp3",
        "pettedSlow": "pethover/audio/sigh.mp3",
        "dragLand": "pethover/audio/wheee.mp3"
      },
      "agentSounds": {
        "thinking": "pethover/audio/hmm.mp3",
        "editing": "pethover/audio/tap.mp3",
        "inspecting": "pethover/audio/peek.mp3",
        "awaitingApproval": "pethover/audio/wait.mp3",
        "celebrating": "pethover/audio/yay.mp3",
        "failed": "pethover/audio/oof.mp3"
      }
    }
  }
}
```

All keys are optional. A missing key means that event is silent for that pet.

Accepted paths:

- Relative to the pet package root.
- Inside `pethover/audio/`.
- File extension `.mp3`.
- Existing regular file.
- File size at most 16 MB.

Rejected paths:

- Absolute paths.
- Paths containing `..`.
- Paths outside `pethover/audio/`.
- Non-MP3 files.
- Missing files.
- Files over the size cap.

## 6. Rust data model

Add serializable types in `src-tauri/src/pet_package.rs`:

- `PetSounds`
- `PetInteractionSounds`
- `PetAgentSounds`

Extend `PetSummary` with:

```ts
sounds?: {
  interactionSounds?: {
    click?: string;
    doubleClick?: string;
    petted?: string;
    pettedSlow?: string;
    dragLand?: string;
  };
  agentSounds?: {
    thinking?: string;
    editing?: string;
    inspecting?: string;
    awaitingApproval?: string;
    celebrating?: string;
    failed?: string;
  };
}
```

Rust reads the full manifest into a struct that preserves the current
Codex-compatible fields and optionally parses `pethover.audio`. The summary
contains absolute local paths for accepted sound files, mirroring how
`spritePath` is exposed today.

Invalid sound entries are filtered out during package scanning. The pet package
itself remains visible if its required manifest fields and spritesheet are
valid. This keeps a broken optional sound from disabling the pet.

Folder import preserves valid `pethover/audio/*.mp3` resources by copying the
audio files referenced by accepted manifest entries into the installed package.
The existing file-based import path still imports only `pet.json` and the
spritesheet, so sounds are unavailable for that import path in v1.

## 7. Frontend playback

Add `src/hooks/usePetSounds.ts`.

Inputs:

- selected pet sound summary
- `enabled` boolean from `petInteractions.enableClickSounds`

Outputs:

- `playInteractionSound(kind)`
- `playAgentSound(kind)`
- `stopAllSounds()` for pet switch or disable cleanup

Behavior:

- Convert file paths with `convertFileSrc`.
- Cache `HTMLAudioElement` instances per path.
- For one-shot feedback, reset `currentTime` to `0` before play.
- Keep playback fire-and-forget.
- Catch and swallow `audio.play()` promise rejections.
- Use existing dev logging for diagnostics; do not show user-facing errors.
- Stop currently playing sounds when the selected pet changes or the global
  sound switch turns off.

## 8. Interaction sound flow

Interaction sounds are emitted from the same flow that owns gesture cooldowns.
A gesture suppressed by cooldown emits no state change, no counter increment,
and no sound.

Mapping:

| Runtime gesture | Sound key |
|---|---|
| Single click | `interactionSounds.click` |
| Double click | `interactionSounds.doubleClick` |
| Rapid repeated clicks | `interactionSounds.petted` |
| Long press | `interactionSounds.pettedSlow` |
| Drag land after the existing drag threshold | `interactionSounds.dragLand` |

Implementation shape:

- `useInteractionState` accepts optional callbacks for sound events:
  `onInteractionSound(kind)`.
- The sound callback fires after the relevant cooldown check passes and before
  or near the visual state update.
- The callback is not gated by `responsePaused`, because user-initiated
  gestures remain active while agent responses are paused.

## 9. Agent sound flow

Agent sounds are derived from the frontend's runtime state updates.

Mapping:

| `PetStateId` | Sound key |
|---|---|
| `jumping` | `agentSounds.thinking` |
| `running` | `agentSounds.editing` |
| `review` | `agentSounds.inspecting` |
| `waiting` | `agentSounds.awaitingApproval` |
| `waving` | `agentSounds.celebrating` |
| `failed` | `agentSounds.failed` |
| `idle`, `running-left`, `running-right` | no sound |

Agent sounds play on state transitions, not on every render. The implementation
tracks the last emitted non-silent agent sound key to avoid repeated playback
when the same runtime state is received more than once.

`responsePaused` continues to gate agent updates. The existing event consumer
already ignores `pet-state-changed` while paused; agent sounds follow
that same path. User interaction sounds are not gated by `responsePaused`.

## 10. Settings

Replace the disabled "Enable click sounds" row with an enabled global sound
switch:

- English label: `Pet sounds`
- Chinese label: `宠物音效`
- Remove the "Coming soon" badge.
- Keep using `petInteractions.enableClickSounds` on disk for compatibility.
- The switch calls existing `set_pet_interactions` with the current cooldown
  style preserved.

The field name remains available for a future config migration, but v1 avoids a
schema churn just to change wording.

## 11. Error handling

Invalid manifest sound entries:

- Filter the invalid sound key from the summary.
- Keep the pet visible if required pet package data is valid.
- Do not crash startup or settings.

Playback failures:

- Swallow `HTMLAudioElement.play()` rejections.
- Leave animation and runtime state unchanged.
- Emit dev logs only.

Missing sound keys:

- Treat as silence.
- Do not show placeholder UI.

## 12. Tests

Frontend Playwright specs under `src/tests/`:

- Settings switch is enabled, no longer shows "Coming soon", and persists via
  `set_pet_interactions`.
- With sounds enabled, a successful click plays the selected pet's click sound.
- With sounds disabled, the same interaction does not play.
- A gesture suppressed by cooldown does not trigger a second sound.
- `pet-state-changed` transitions play the mapped agent sound.
- Repeated identical agent state updates do not replay the same sound.
- Paused responses do not play agent sounds from ignored runtime updates.

The shared harness stubs `HTMLAudioElement.prototype.play` so tests can assert
requested URLs without decoding real MP3 files.

Rust integration tests under `src-tauri/tests/`:

- Built-in `pethover` exposes valid interaction and agent sound paths in
  `PetSummary`.
- Missing `pethover.audio` yields no sounds and keeps the pet visible.
- Invalid sound paths are filtered: absolute path, `..`, outside
  `pethover/audio/`, non-MP3 extension, missing file.
- Oversized MP3 entries are filtered.
- Valid audio resources stay under the existing asset protocol scope.

Verification for the completed feature follows the feature-module definition of
done:

- `pnpm test:frontend`
- `pnpm test:rust`
- `pnpm build`
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`

## 13. Expected files changed

- `src-tauri/src/pet_package.rs`
- `src-tauri/src/config_store.rs`
- `src-tauri/tests/config_store.rs` or a new `src-tauri/tests/pet_sounds.rs`
- `src/lib/appTypes.ts`
- `src/hooks/usePetSounds.ts`
- `src/hooks/useInteractionState.ts`
- `src/hooks/useLayeredPetState.ts`
- `src/hooks/useAppData.ts` or `src/PetWindow.tsx`
- `src/components/SettingsPreferencesSection.tsx`
- `src/lib/i18n.ts`
- `src/tests/app-harness.ts`
- `src/tests/pet-gestures.spec.ts` or a new `src/tests/pet-sounds.spec.ts`
- `src/tests/settings-workflows.spec.ts`

## 14. Definition of done

- Branch is `feature/pet-sounds` in `.worktrees/pet-sounds/`.
- Rust exposes validated package sounds through `PetSummary`.
- The frontend plays both interaction and agent sounds through one hook.
- The global sound switch is enabled and controls both sound groups.
- Existing cooldown and pause semantics are preserved.
- Broken optional sounds cannot disable an otherwise valid pet package.
- Frontend behavior is covered by Playwright specs in `src/tests/`.
- Rust behavior is covered by Cargo integration tests in `src-tauri/tests/`.
- `pnpm test:frontend`, `pnpm test:rust`, `pnpm build`, and
  `cargo fmt --manifest-path src-tauri/Cargo.toml --check` pass before final
  implementation handoff.
