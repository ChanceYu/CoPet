# PetHover omni sub-task (3c)

**Read this when:** the user selected **PetHover omni** in step 2 — you are about to generate an 8-direction body atlas + 3×3 eye overlay for cursor-aware rendering.

## What this sub-task owns

`pethover.omni`, `pethover.eyes`, and `pethover.behaviors.omniStateRows`. Nothing else.

The codex-compatible `spritesheet.webp` is **always** the source of truth for codex consumers; the omni assets emitted by this sub-task are **PetHover-only** additive resources under `pethover/` — codex tools ignore them.

## Character-consistency requirement (load-bearing)

The omni atlas **MUST depict the same character** as the sprite atlas — same species, same body plan, same color palette, same accessories, same proportions, same art style. The omni atlas is not a "themed" or "similar" character; it is the **identical pet at additional viewing angles**. A user looking at the pet in the PetHover window must see one continuous identity whether the pet is idle facing south (rendered from the codex `spritesheet.webp`) or idle facing northeast (rendered from the omni atlas) or anywhere in between.

This implicitly carries the **default visual style** (see SKILL.md "Default visual style") from sprite to omni: because omni uses the sprite atlas as visual conditioning, whatever style baseline sprite produced — rounded 3D toy by default, or the user's explicit override — propagates into the omni atlas automatically. The omni sub-task does **not** read the user's style preference directly; it reads the sprite's pixels.

## Sprite source resolution

This sub-task needs an existing spritesheet to use as both visual style **and** character-identity reference. Resolve the source in priority order:

1. **Fresh sprite from this run** — if the sprite sub-task (3a) is also selected, omni waits for 3a to finish, then reads the spritesheet 3a just wrote.
2. **Existing package spritesheet** — if 3a is not selected, omni reads the spritesheet at `spritesheetPath` from the existing `pet.json`.

If neither source resolves to a real spritesheet, step 2 of the pipeline should have already prevented this sub-task from being runnable; treat reaching this code path with no spritesheet as a generation error.

## How to enforce the character match during generation

When invoking the underlying image generator for each directional frame, you **MUST**:

- Pass the source spritesheet (or a cropped frame from it — typically `idle / row 0 / frame 0`, the canonical front-facing pose) as a **visual reference / conditioning image** for every directional generation. Use whichever the underlying image model exposes: img2img, reference-image input, IP-adapter / character-LoRA, or the model's character-consistency feature. Text-only prompts that describe the character's appearance are **insufficient** — visual conditioning is required.
- Use a prompt of the form: *"The same character as shown in the reference image, in identical art style and color palette, facing &lt;direction&gt;, [neutral idle / running / etc.] pose"*. Do not introduce new colors, accessories, lighting, or stylistic choices that aren't visible in the reference.
- Match the source's per-cell resolution exactly — `omni.frameWidth` and `omni.frameHeight` must equal the source spritesheet's `frameWidth` and `frameHeight`. Different cell sizes between the two atlases are a generation error.
- Match the source's transparency convention — pure transparent background, no synthesized shadows under the feet unless the source has them.

When the model produces a frame whose character drifts (different fur pattern, missing accessory, different proportions), discard it and regenerate. Better to spend an extra generation call than to ship a drifted frame the user will notice the moment the pet rotates.

## Choose an omni profile

Use **`balanced`** by default. Honor an explicit user override if the user requested one alongside the task selection in step 2.

| Profile | Concrete directional images | Eye atlas | Generation time delta | Output bundle delta |
|---|---|---|---|---|
| `balanced` (default) | 5 (idle: N, NE, E, SE, S) + 2 (running: E, SE) ≈ **7 generations** | 1 small image | +3–5 min over the base sprite output | +0.8–1.2 MB lossy q90 |
| `rich` | 5 (idle) + 5 (running) + 1 each for waving/jumping/failed/waiting/review ≈ **15 generations** | 1 small image | +10–15 min | +2–3 MB lossy q90 |

## Artifacts produced

1. **`pethover/omni-spritesheet.webp`** — a vertical atlas. Each row is `frameHeight` tall (208 px by default) and `gridColumns × frameWidth` wide (8 × 192 = 1536 px by default). Rows are stacked top-to-bottom in the order the manifest declares them. Pad unused row tail-columns with full transparency; do not stretch art across the row.
2. **`pethover/eyes.webp`** — a small 96 × 96 atlas: a 3 × 3 grid of 32 × 32 pupil-position cells (NW / N / NE / W / center / E / SW / S / SE, read left-to-right, top-to-bottom). The center cell is the "looking straight ahead" pose.
3. **Anchor table** in the manifest fragment (one `[x, y]` per body direction): the pixel offset of the eye center within the body frame. Defaults around `[96, 84]` work for most centered character art.

## Direction set and mirror declarations

Always generate the five "primary" directions (`N`, `NE`, `E`, `SE`, `S`) for each authored state. Declare the three mirror directions (`W`, `NW`, `SW`) as mirrors of `E`, `NE`, `SE` respectively — the runtime renders them by flipping the source horizontally, so no extra image generation is required.

**Never** generate a separate image for a mirror direction; it wastes generation budget and produces visible asymmetry from random AI variation.

## Encoding

Encode `omni-spritesheet.webp` as **lossy WebP at q90** (`cwebp -q 90`). Lossless WebP at this canvas size approaches 8–14 MB per pet, which is too heavy for a desktop ornament. Keep `eyes.webp` lossless — it is small enough that encoding choice does not matter. Sprite art at q90 loses no visually perceptible quality (PSNR ≥ 46 dB).

## Single-direction states

Strongly prefer authoring only a single `S` (south-facing) row for the following states: `waving`, `jumping`, `failed`, `waiting`, `review`. Players almost always see these states with the pet facing them, so multi-direction variants are a waste of generation budget. The runtime falls back to the `defaultFacing` direction when a requested direction is absent from a state.

## Omni manifest fragment

Emit `pethover.omni`, `pethover.eyes`, and `pethover.behaviors.omniStateRows`:

```json
{
  "pethover": {
    "omni": {
      "spritesheetPath": "pethover/omni-spritesheet.webp",
      "frameWidth": 192, "frameHeight": 208,
      "gridColumns": 8, "gridRows": 8,
      "defaultFacing": "S"
    },
    "eyes": {
      "spritesheetPath": "pethover/eyes.webp",
      "frameSize": 32,
      "pupilGridColumns": 3, "pupilGridRows": 3,
      "anchors": { "N": [96, 70], "NE": [108, 74], "E": [114, 84], "SE": [108, 96],
                   "S": [96, 100], "SW": [84, 96], "W": [78, 84], "NW": [84, 74] }
    },
    "behaviors": {
      "omniStateRows": {
        "idle":    { "N": {"row":0,"frames":6,"durationMs":1100}, "NE": {"row":1,"frames":6,"durationMs":1100},
                     "E": {"row":2,"frames":6,"durationMs":1100}, "SE": {"row":3,"frames":6,"durationMs":1100},
                     "S": {"row":4,"frames":6,"durationMs":1100},
                     "SW": {"mirrorOf":"SE"}, "W": {"mirrorOf":"E"}, "NW": {"mirrorOf":"NE"} },
        "running": { "E": {"row":5,"frames":8,"durationMs":820}, "SE": {"row":6,"frames":8,"durationMs":820},
                     "W": {"mirrorOf":"E"}, "SW": {"mirrorOf":"SE"} }
      }
    }
  }
}
```

The omni fragment owns only `pethover.omni`, `pethover.eyes`, and `pethover.behaviors.omniStateRows`. It does **not** touch `pethover.behaviors.stateRows` (sprite sub-task's territory) or `pethover.audio` (audio sub-task's territory). This non-overlap is what makes the merge in step 4 safe.

Hold this fragment in memory. The merge step (4) will apply it to `pet.json`. Do **not** write `pet.json` from inside this sub-task.
