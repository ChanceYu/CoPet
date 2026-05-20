---
name: pethover
description: Use when generating or updating a PetHover-compatible Codex pet package from a user image or text description, especially when the package needs PetHover display translations, audio, or behavior metadata.
---

# PetHover

## Overview

This skill is the **single orchestration entry point** for creating or updating a PetHover pet. Given either an uploaded reference image or a textual description, it:

1. **Presents a task checklist** with three independently-selectable task domains: **Sprite atlas** (codex-compatible spritesheet + display strings via `$hatch-pet`), **PetHover audio** (interaction & agent MP3 clips), and **PetHover omni** (8-direction body atlas + eye overlay). The two PetHover-branded tasks correspond to PetHover-runtime-only features; the sprite task is the codex-compatible base shared with other ecosystems.
2. **Executes the selected tasks honoring their dependencies.** Sprite and PetHover audio are both driven directly from the user's raw input and run **in parallel** when both are selected. PetHover omni needs a spritesheet for **character identity and visual style** — it depicts the same character as the sprite atlas at additional viewing angles — so it runs after the sprite task (or directly, reading the existing package's spritesheet for visual conditioning, when sprite is not selected). All sub-tasks emit in-memory manifest fragments only — they do not write `pet.json` themselves.
3. **Merges** each task's manifest fragments into a single `pet.json` under a per-run **temporary staging directory** (`$HOME/.pethover/tmp/pet-<unix-epoch>-<pet-id>/`), alongside the generated assets, using a write-temp-then-rename atomic pattern, then reconciles the staging directory to remove any file not referenced by the final manifest.
4. **Validates** the merged manifest and the on-disk staging directory as a single coherent package before returning. Only after validation passes is the staging directory **atomically renamed** into its final location at `$HOME/.pethover/pets/<pet-id>/`. Until then, the live package directory is untouched.

It is the only PetHover skill. All PetHover-side configuration lives under the top-level `pethover` key of `pet.json`. Codex-compatible top-level fields (`id`, `displayName`, `description`, `spritesheetPath`, frame geometry) are owned by the sprite task; PetHover audio and PetHover omni each own a disjoint subtree under `pethover`.

## Upstream skill

This skill depends on the sibling **`$hatch-pet`** skill. Every `$hatch-pet` reference in this doc points to that one upstream skill, resolved in the following order:

1. **Sibling install** — a `hatch-pet/` folder installed alongside this skill (same skills root).
2. **Codex install** — `$HOME/.codex/skills/hatch-pet/`.
3. **Upstream source** — fetch / install from <https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md>.

Stop at the first hit. If none of the three resolves, the sprite sub-task cannot run; audio is still runnable on its own.

**Always invoke `$hatch-pet` with explicit parameters and treat its execution as a black box.** Specifically: set the `CODEX_HOME` env var to `<staging-dir>/.hatch-codex` and pass `--style-preset`, `--pet-name`, `--description`, `--output-dir`, and (per input) `--reference`, `--pet-notes`, `--style-notes`, `--force`, and the brand-discovery flag set. Never rely on `$hatch-pet`'s default `auto` modes — they infer from the surrounding sprite-atlas context, which leads to pixel-art output even when prose describes a 3D rendering. Never reach into `$hatch-pet`'s scratch (its `imagegen-jobs.json`, decoded rows, prompt files, contact sheet) to influence row-level retries or visual judgments — those are its internals, and we only ever read its three documented consumer outputs: `qa/review.json` (verdict), the final spritesheet, and the final manifest. See [`references/sub-task-sprite.md`](./references/sub-task-sprite.md) for the full parameter table and example invocations.

## Pet package layout

```
$HOME/.pethover/pets/<pet-id>/
├── pet.json
├── spritesheet.webp            ← or spritesheet.png; Codex 8×9 atlas, 192×208 per cell
└── pethover/
    ├── audio/                  ← optional generated MP3 clips
    │   ├── click.mp3
    │   ├── surprised.mp3
    │   ├── purr.mp3
    │   └── ...
    ├── omni-spritesheet.webp   ← optional 8-direction atlas (see references/sub-task-omni.md)
    └── eyes.webp               ← optional 3×3 pupil overlay for omni pets
```

`<pet-id>` is a kebab-case identifier, unique within `$HOME/.pethover/pets/`. Built-in pets ship in the app bundle using the same layout. This skill writes its final package only to `$HOME/.pethover/pets/<pet-id>/`; do not write or mirror the finished PetHover package into `$HOME/.codex/pets/`.

## Inputs

| Input kind | Format | Notes |
|---|---|---|
| `image` | PNG or JPEG, ≤ 8 MB | A reference picture (photo, sketch, etc.). Used as primary inspiration. |
| `text`  | UTF-8 string, ≤ 2 000 chars | A description of the desired pet (appearance, personality, mood). |

Exactly one input kind per generation. An image with an optional caption is allowed; the caption is treated as additional text context but the image is the primary signal.

## Default visual style

All generated sprite art — both the sprite atlas (3a) and the omni directional frames (3c) — defaults to the `$hatch-pet` style preset **`3d-toy`**: a rounded 3D toy pet character — smooth gradient shading, soft edges, plush-figurine proportions, friendly silhouette, transparent background. No sharp pixel-art outlines, no photorealism, no rough sketch lines, no flat-shaded vector look. This default is what gives the PetHover gallery a consistent identity across pets — the existing built-in PetHover (the default mascot) is itself "a cheerful blue-purple gradient fox pet inspired by a rounded 3D toy reference," and new generations match that family by default.

**Always invoke `$hatch-pet` with an explicit `--style-preset`. Never rely on its `auto` mode.** Without an explicit preset, `$hatch-pet` infers the style from prompt context, and the surrounding sprite-atlas vocabulary (`192×208 cell`, `8×9 grid`, `frames per row`) biases auto-inference toward `pixel` regardless of any prose style description in the user prompt or `--style-notes`. The flag is the load-bearing signal; prose alone does not override `auto`.

**Style → preset mapping** (use these mappings when the user signals an override):

| User signal | `--style-preset` | Notes |
|---|---|---|
| (default — no explicit style request) | `3d-toy` | Always pass; this is the load-bearing fix. |
| "pixel art", "8-bit", "retro sprite" | `pixel` | |
| "plush", "stuffed toy", "felt" | `plush` | |
| "claymation", "stop-motion", "clay" | `clay` | |
| "sticker", "die-cut", "thick outline" | `sticker` | |
| "flat vector", "minimal vector", "logo-style" | `flat-vector` | |
| "watercolor", "painterly", "painted" | `painterly` | |
| "brand X style" (named real brand) | `brand-inspired` | Pass the brand name in `--style-notes` |

Use `--style-notes` to pass supplementary prose ("rounded plush figurine", "blue-purple gradient", etc.) **on top of** the explicit preset — notes refine within a preset's aesthetic, they do not switch presets.

**Apply the default `3d-toy` preset unless the user explicitly opts out.** Override triggers (any one is sufficient):

- The user's text or caption explicitly names a different art style — e.g. *"make it pixel art"*, *"watercolor style"*, *"flat anime"*, *"low-poly"*, *"photorealistic"*, *"line drawing"*. Treat phrases that merely describe the subject's traits (*"chubby"*, *"glowing"*, *"steampunk-themed"*) as **not** style overrides — those modify the pet's appearance within the rounded 3D toy aesthetic.
- The user uploads a reference image **and** explicitly asks to match the image's art style (e.g. *"keep the same art style as this picture"*).

**Default behavior for a reference image whose style differs from the rounded 3D toy aesthetic:** treat the image as a **subject reference** (species, color palette, accessories, pose) rather than a style reference. Pass `--style-preset 3d-toy` regardless of the image's own style; the image becomes a *subject* reference image, not a *style* reference image. Do not silently inherit pixel-art / sketch / photo styling from the upload; the user expects PetHover's gallery look.

This default propagates to every visual sub-task in the run. Sprite (3a) bakes the style into the codex spritesheet via the `--style-preset` it passes to `$hatch-pet`. Omni (3c) inherits the style automatically because it uses the sprite atlas as visual conditioning. Audio (3b) is unaffected — it has no visual style.

When an override is in effect, record the chosen style and the resulting preset explicitly in the run log so the result can be cited if it looks wrong.

## Pipeline

The pipeline has five steps: **validate → select → execute → merge → validate**. The execution step runs the user-selected task subset on a small dependency DAG, parallelizing independent sub-tasks.

**Atomic staging is a load-bearing invariant.** From step 3 (execute) onward, every artifact this skill writes lands in a per-run **staging directory** at `$HOME/.pethover/tmp/pet-<unix-epoch>-<pet-id>/`. The live package directory at `$HOME/.pethover/pets/<pet-id>/` is read-only until step 5 finishes validation; only then does the skill rename the staging directory into its final location. This means a failure at any point in steps 3–5 leaves the live package exactly as it was before the run — partial sprite generation, a failed audio batch, or a missing omni frame can never corrupt an existing pet, and a brand-new pet never appears half-baked.

For existing-package updates (re-running audio or omni on a pet that already has `pet.json`), the live package's full contents are copied into the staging directory at the start of step 3, so sub-tasks that did not run still see their previous outputs preserved through the merge.

### 1. Validate input

- **Image**: decodable, within size cap, not transparent-only.
- **Text**: non-empty, within character cap, not pure whitespace.

Reject otherwise with a clear error; do not invoke any sub-task on invalid input.

### 2. Determine package state and present task selection

First, check whether the package already exists at `$HOME/.pethover/pets/<pet-id>/`. The result determines which sub-tasks are independently runnable:

- **New package** (no `pet.json` at the target path) — **sprite** and **PetHover audio** can each run independently from the user's image/text input. **PetHover omni** requires a spritesheet for visual style, so it can only run if the sprite task is also selected in the same run.
- **Existing package** (valid `pet.json` present, with `spritesheetPath` resolving to an actual file) — all three sub-tasks are independently optional. Re-running sprite replaces the spritesheet and identity; re-running PetHover audio replaces previously generated MP3 clips; re-running PetHover omni replaces omni assets and reads the existing spritesheet for visual style reference.

Then **present the task checklist to the user** and wait for confirmation before doing any generation. Use a UI affordance that supports multi-select (checkboxes, prompts with multi-pick, etc.). The wording of the options must keep the **PetHover** brand visible for the two PetHover-owned sub-tasks (audio, omni), since those features are specific to the PetHover runtime — codex-compatible consumers ignore them. Use this exact phrasing for the prompt, translated into the user's language:

> Which PetHover generation tasks should I run?
>   ☐ **Sprite atlas** — codex-compatible spritesheet pet package (via `$hatch-pet`)
>   ☐ **PetHover audio** — interaction & agent MP3 clips played by the PetHover runtime
>   ☐ **PetHover omni** — 8-direction body atlas + eye overlay for cursor-aware rendering in PetHover

For a new package, pre-check **Sprite atlas** and present the two PetHover-branded options as opt-in. For an existing package, present all three unchecked. Disable (or surface a clear message for) the **PetHover omni** option when no spritesheet would be present after this run — i.e. when the existing package lacks `spritesheetPath` *and* the user has not selected sprite atlas. Reject a submission that selects zero tasks with a clear error ("nothing to do").

The selected subset drives step 3. Do **not** prompt the user again for sub-task profile choices (e.g. omni `balanced` vs `rich`) unless the user explicitly asked for control; use the defaults documented in each sub-task reference.

### 3. Execute selected tasks

**Set up the staging directory first.** Before invoking any sub-task, compute `<staging-dir> = $HOME/.pethover/tmp/pet-<unix-epoch-seconds>-<pet-id>/` and create it (creating `$HOME/.pethover/tmp/` if missing). For existing-package updates (when `$HOME/.pethover/pets/<pet-id>/` already exists), **copy that directory's full contents into `<staging-dir>` first** — this becomes the merge base so sub-tasks not selected this run see their previous outputs preserved.

From this point on, **every artifact this skill writes lands inside `<staging-dir>`**, never in the live `$HOME/.pethover/pets/<pet-id>/`. Sub-tasks write their assets there (e.g. `<staging-dir>/spritesheet.webp`, `<staging-dir>/pethover/audio/click.mp3`, `<staging-dir>/pethover/omni-spritesheet.webp`). The merge step writes `<staging-dir>/pet.json`. Validation reads from `<staging-dir>`. Only the final swap in step 5 touches the live location.

The three sub-tasks form a small dependency DAG. Schedule them so independent sub-tasks run **in parallel** from the moment their inputs are available; only block where a real dependency exists.

| Sub-task | Inputs | Depends on | Reference |
|---|---|---|---|
| Sprite atlas (3a) | Raw user input (image / text) | nothing | [`references/sub-task-sprite.md`](./references/sub-task-sprite.md) |
| PetHover audio (3b) | Raw user input (image / text) | nothing — derives the target animal class / sound character from the user's input directly, not from sprite output | [`references/sub-task-audio.md`](./references/sub-task-audio.md) |
| PetHover omni (3c) | A spritesheet (either freshly produced by 3a in this run, *or* read from an existing `pet.json`) | Sprite atlas (3a) if it is also selected; otherwise the existing package's `spritesheetPath` | [`references/sub-task-omni.md`](./references/sub-task-omni.md) |

**Concrete scheduling rules.**

- If sprite and audio are both selected, they **MUST start together** and run in parallel — audio does not wait for sprite.
- If omni is selected and sprite is **also** selected, omni waits for sprite to finish, then runs concurrently with whatever else is still running (typically just audio).
- If omni is selected and sprite is **not** selected, omni reads the existing package's spritesheet for style reference and starts immediately, concurrently with audio.
- If only one sub-task is selected, run it alone.

Each sub-task produces:

1. A set of asset files written under the pet package directory (the spritesheet at the package root for sprite; MP3 clips for audio; omni atlas + eyes for omni).
2. A **manifest fragment** — a JSON object describing only the keys that sub-task owns. The fragment is held in memory until step 4 (merge).

Sub-tasks **MUST NOT** write `pet.json` themselves. They produce assets + an in-memory fragment; the merge step is the sole writer. If a sub-task fails after the others have started, abort the whole run and surface the error — do not write a partial `pet.json`. Any already-written asset files from sibling sub-tasks may be left in place (the next run's merge will reconcile them) but `pet.json` itself must not be touched.

For per-sub-task details (inputs, prompts, output artifacts, manifest fragment shape), read the matching reference doc above before invoking that sub-task.

### 4. Merge manifest fragments into `pet.json`

The merge collects the fragments produced by the selected sub-tasks (any subset of sprite, audio, omni) into a single `pet.json` **inside the staging directory** (`<staging-dir>/pet.json`). This is also the only step that writes `pet.json` and the only point that reconciles the staging directory's file layout.

The live package directory at `$HOME/.pethover/pets/<pet-id>/` is **not** touched by this step. The live → staging seed copy happened at the start of step 3; the staging → live swap happens at the end of step 5.

**Read the full algorithm in [`references/merge-and-validate.md`](./references/merge-and-validate.md).** It covers:

- The fragment ownership matrix (which sub-task owns which manifest keys), plus the merge-step-owned keys (`pethover.displayNameZh`, `pethover.descriptionZh`) that no sub-task produces.
- The 8-step merge algorithm operating inside the staging directory (read base → apply sprite → apply audio → apply omni → preserve unowned keys → **derive Chinese display strings** → atomic write → reconcile directory). The Chinese-translation sub-step is the only translation pass in the whole pipeline; it runs against the merged document, not against any individual fragment, and re-uses the previous Chinese siblings unchanged when the English source is byte-identical to the seeded base.
- The staging directory reconciliation rules (keep-set + deletion rules + empty-directory cleanup + temp-file cleanup + removal of `$hatch-pet`'s `.hatch-run/` and `.hatch-codex/` scratch sub-directories) that ensure the staging directory contains exactly what the manifest references — no orphaned spritesheets in stale formats, no scratch directories, no leftover audio clips from the previous run that was seeded in.
- The fully-merged package schema as a reference.

### 5. Validate the merged manifest, then atomically swap into the live location

Run all checks on the **merged `<staging-dir>/pet.json` and the on-disk artifacts under the staging directory together** — not on individual fragments and not on the live package. Validation is the final gate before the swap; a failure here is a generation failure, not a warning. Validation runs even when only one sub-task ran, because the full document must be coherent.

**Read the full validation checklist in [`references/merge-and-validate.md`](./references/merge-and-validate.md).** It covers:

- Manifest shape checks (JSON well-formed; required top-level fields; PetHover-namespace required fields; schema version; path safety).
- Sprite artifact checks (file exists, dimensions match frame geometry, stateRows in bounds).
- Audio artifact checks (file paths resolve under `pethover/audio/`; MP3 format and size).
- Omni artifact checks (file exists; dimensions; frame geometry matches sprite atlas; omniStateRows bounds; mirror entries resolve; no chains; defaultFacing valid).
- Eyes artifact checks (file exists; dimensions; all 8 anchors present).
- **Package cleanliness checks**: the staging directory contains exactly the files the manifest references — no more, no less. No stale spritesheets, no scratch directories, no `.tmp` / `.bak` / `.DS_Store`, no orphaned audio clips, no `.hatch-run/`, no `.hatch-codex/`.

If any check fails, treat the run as failed, leave the staging directory in place for debugging, and surface the specific failing bullet. The live `$HOME/.pethover/pets/<pet-id>/` is **never** touched on validation failure.

**On validation success, atomically promote staging to live.** See `references/merge-and-validate.md` "Atomic promotion" for the exact swap protocol (handles both new packages and updates of existing packages without leaving the live location in a half-renamed state). After a successful promotion, the staging directory no longer exists at its original path — it has been renamed into the live location.

## Write principle

The merge step (step 4) is the **only place** `pet.json` is written to disk. Sub-tasks emit in-memory fragments; they never write the manifest themselves. This invariant is what makes the parallel execution of any independent sub-tasks (sprite ∥ audio, or audio ∥ omni, or all three respecting omni's dependency on sprite) safe — N concurrent writers to the same `pet.json` would race; N concurrent fragment producers feeding a single serialized merge cannot.

Implementations must:

- Read the existing `pet.json` (treat a missing file as `{}`).
- Apply only the fragments that this run produced. Fields owned by sub-tasks that were not selected are preserved verbatim from the base manifest.
- Ensure `id`, `displayName`, `description`, and `spritesheetPath` are present in the final manifest. For a new package these come from the sprite fragment; for an existing package they come from the base.
- Preserve every unrelated top-level key (and every unowned key under `pethover`) verbatim from the base — both value and, where practical, formatting.
- Write the final package only under `$HOME/.pethover/pets/<pet-id>/`, using a write-temp-then-rename atomic pattern so a crash mid-write never leaves a half-merged manifest.
- Reconcile the on-disk directory after writing `pet.json`, per the rules in [`references/merge-and-validate.md`](./references/merge-and-validate.md). The package must not ship leftover files.

Never rewrite the whole file from a hard-coded template, and never delete sibling keys whose schema this skill does not own.

## Channels

| Channel | Triggered by |
|---|---|
| `interactionSounds` | User gestures (click, petted, etc.) |
| `agentSounds` | Agent CLI events (`pet-state-changed`) |

Generated audio is package-provided capability. The PetHover app may still apply user preferences such as mute or click-sound settings before playback. If playback is enabled and the package configures a sound for an event, the runtime may play that sound when the event fires.

### Cooldown coupling (interaction sounds only)

Interaction sounds piggy-back on the runtime's per-gesture cooldown: a gesture suppressed by cooldown does not fire at all, so no sound is emitted for it. Audio playback should not add a second package-level cooldown.

Agent sounds have no cooldown coupling — they fire as agent events arrive (subject to PetHover's own debouncing of high-frequency state changes).

## Anti-patterns

**Read the full grouped anti-pattern list in [`references/anti-patterns.md`](./references/anti-patterns.md)** — pipeline orchestration, audio sourcing, manifest discipline, package cleanliness, and omni-specific groups.

Three cross-cutting reminders worth keeping in front of you:

- **Don't write `pet.json` from inside a sub-task.** Sub-tasks emit in-memory fragments only; step 4 is the sole writer.
- **Don't return success before step 5 validates the merged manifest and the on-disk package.** Manifest correctness and package cleanliness are independent checks; both must pass.
- **Don't generate a "similar" or "themed" character for omni — generate the SAME character as the sprite atlas.** Pass the sprite atlas (or a frame from it) as visual conditioning to the image generator; text-only prompts are insufficient.

## References

- [`references/sub-task-sprite.md`](./references/sub-task-sprite.md) — Sprite atlas sub-task (3a): `$hatch-pet` invocation, English/Chinese display strings, manifest fragment.
- [`references/sub-task-audio.md`](./references/sub-task-audio.md) — PetHover audio sub-task (3b): animal-class inference from raw input, vocal palette, 11-clip set, manifest fragment.
- [`references/sub-task-omni.md`](./references/sub-task-omni.md) — PetHover omni sub-task (3c): character-consistency requirement, image conditioning, layout, mirror declarations, encoding, manifest fragment.
- [`references/merge-and-validate.md`](./references/merge-and-validate.md) — Step 4 merge algorithm + directory reconciliation rules + step 5 validation checklist + fully-merged schema reference.
- [`references/anti-patterns.md`](./references/anti-patterns.md) — Full grouped anti-pattern list.
- [`references/audio-asset-format.md`](./references/audio-asset-format.md) — MP3 format rules, size caps, loudness target, silence trimming, validation notes.
- [`references/gesture-sound-map.md`](./references/gesture-sound-map.md) — suggested gesture-to-sound-role mapping (advisory).
