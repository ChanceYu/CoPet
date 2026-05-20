# Anti-patterns

**Read this when:** before committing to a generation step, OR when something is failing and you want to check whether you have violated a known rule.

Grouped by concern. Each "Don't" is a hard rule; violating it is a generation error.

## Pipeline orchestration

- Don't run any sub-task without first presenting the task checklist and receiving user confirmation, except when the calling agent has been given explicit pre-selection by the user (e.g. "regenerate audio only").
- Don't proceed when the user selected zero tasks — surface a "nothing to do" error and re-prompt.
- Don't drop the **PetHover** brand from the audio and omni options on the user-facing checklist. These features are PetHover-runtime-specific and the brand belongs in the label, not in a footnote.
- Don't hold the audio sub-task back to wait for the sprite sub-task. They share the same raw user input; they must start together when both are selected.
- Don't start the omni sub-task before a spritesheet exists — either freshly written by 3a in this run, or already on disk via an existing `pet.json`.
- Don't run audio and omni sequentially when both are selected and the omni precondition is met. They are independent of each other and **must** run in parallel.
- Don't write `pet.json` from inside a sub-task. Sub-tasks emit in-memory fragments only; the merge step (4) is the sole writer.
- Don't return success before step 5 (validate) has passed on the merged manifest.
- Don't write a partial `pet.json` when a sub-task fails. Abort the run and surface the error; leave the prior `pet.json` (if any) untouched.

## Audio sourcing

- Don't read sprite output (manifest, spritesheet, frames) to drive audio character. Audio's vocal class and traits are inferred from the **raw user input** (image + caption / text) — the very same input sprite receives. Both sub-tasks consume the input independently.
- Don't refuse to run audio when sprite was not selected. Audio is an independently runnable PetHover task; it does not need `$hatch-pet` to have run.
- Don't infer the animal class from the spritesheet pixels post-hoc — if the user input is text-only, infer from the text; if it's an image, classify from the image directly.
- Don't author long clips. ≤ 1 second is plenty for gesture feedback; longer is fine for ambient agent sounds but rare.
- Don't include silence padding — trim at generation time.

## Visual style defaults

- **Don't omit `--style-preset` from the `$hatch-pet` invocation.** This is the load-bearing fix for the "skill says 3D, output is pixel art" failure. `$hatch-pet`'s default `auto` mode infers style from prompt context, and the surrounding sprite-atlas vocabulary biases it toward `pixel` regardless of any prose description in the user prompt or `--style-notes`. The preset flag, not the prose, drives the rendering style.
- Don't deviate from the **`3d-toy`** default preset unless the user has explicitly named a different art style (pixel art, watercolor, anime, photorealistic, etc.). Subject descriptors like "chubby", "glowing", "steampunk-themed" are not style overrides — they modify the pet's appearance within the default aesthetic, so they go in `--style-notes`, not into the preset choice.
- Don't conflate `--style-preset` with `--style-notes`. The preset is one of the fixed first-class values (`pixel`, `plush`, `clay`, `sticker`, `flat-vector`, `3d-toy`, `painterly`, `brand-inspired`); notes are freeform prose that refines *within* the chosen preset's aesthetic. Notes alone cannot switch presets.
- Don't silently inherit the art style of an uploaded reference image when that style differs from the default. A user-uploaded image is a **subject reference** (species, color, accessories), not a style reference, unless the user explicitly asked to match the image's art style. The `$hatch-pet` invocation still carries `--style-preset 3d-toy`.
- Don't apply different visual styles to sprite and omni in the same package. Omni inherits style from sprite via image conditioning; a style mismatch between the two atlases breaks the character-continuity guarantee.
- Don't fail to log the style override. When the user opts out of the default, record both the user's wording and the resulting `--style-preset` value in the run log so the result can be cited if it looks wrong.

## `$hatch-pet` parameter discipline

- **Don't omit `--pet-name`.** PetHover owns the package directory name (`$HOME/.pethover/pets/<pet-id>/`); we must pass the canonical kebab-case id to `$hatch-pet` so its manifest's `id` matches ours. Letting `$hatch-pet` auto-generate a name leads to a manifest/path mismatch and a downstream merge error.
- **Don't omit `--description`.** We already derive the one-sentence English description (≤ 140 chars) during sub-task 3a; pass it via `--description` so `$hatch-pet`'s manifest matches ours. Two independent description strings would be a manifest inconsistency.
- **Don't put style-related prose into `--pet-notes`.** `--pet-notes` is the "Stable pet description or avatar seed" field — *species, color, personality, distinguishing features*. Style guidance (e.g. "smooth gradient shading") goes in `--style-notes`. Crossing these channels makes `$hatch-pet`'s auto-inference noisier.
- **Don't put subject-related prose into `--style-notes`.** Subject (what the pet *is*) belongs in `--pet-notes`; style (how it's rendered) belongs in `--style-notes`. Notes only ever refine *within* the chosen preset's aesthetic.
- **Don't pass an uploaded image as part of a prompt string.** Use the `--reference <absolute-path>` flag. Reference images carry positional/structural cues that prose cannot reproduce.
- **Don't skip the brand pre-flight when the user input names a brand.** If the user mentions a brand/product/company by name, run the brand-discovery worker before `prepare_pet_run.py` and pass `--brand-name`, `--brand-brief`, `--brand-source`, `--brand-discovery-file`. Without these, `$hatch-pet` cannot ground brand details. Also switch `--style-preset` to `brand-inspired` for brand pets.
- **Don't omit `--output-dir` and let `$hatch-pet` auto-place its run-dir.** Pass an absolute path inside our own scratch (`$HOME/.pethover/pets/<pet-id>/.hatch-run/`) so cleanup is local to the package directory, and step 4 sub-step 7's reconciliation can delete it.
- **Don't omit `--force` when regenerating sprite on an existing package.** Without it, `$hatch-pet` refuses to overwrite the run-dir and the sub-task fails. Re-running sprite is an explicit user opt-in in step 2, so `--force` is the correct semantics.
- **Don't accept `$hatch-pet`'s output without checking `qa/review.json` AND `qa/contact-sheet.png`.** `review.json` reporting zero errors is necessary but not sufficient; the contact sheet can still show cropped references, repeated tiles, white backgrounds, identity drift, style drift, or size popping. All six are visual-only failures that `review.json` does not catch.
- **Don't trust `$hatch-pet`'s manifest when its `id` or `description` disagrees with what we passed.** Treat any mismatch as a generation error; `$hatch-pet` should echo our values, not invent new ones.
- **Don't leave `.hatch-run/` in the final package.** That directory is `$hatch-pet`'s scratch; step 4 sub-step 7 deletes it before the package-cleanliness check.

## Manifest discipline

- Don't reference files outside the pet package (absolute paths, `../` segments, URLs).
- Don't put PetHover fields at the top level except for the single `pethover` object.
- Don't duplicate `spritesheetPath` as a PetHover-only spritesheet field.
- Don't write the final PetHover package under `$HOME/.codex/pets/`.
- Don't rewrite `pet.json` from a template or delete unowned top-level fields — other ecosystems may share this manifest.
- Don't let two sub-task fragments write the same key (see the ownership matrix in `merge-and-validate.md`). Overlapping writes are a generation error.

## Package cleanliness

- Don't leave a stale spritesheet from a previous run in a different format. If this run writes `spritesheet.png`, the prior `spritesheet.webp` must be deleted in step 4's reconciliation sweep — and vice versa. Two files at the package root that both look like spritesheets is a cleanliness failure even if only one is referenced by the manifest.
- Don't ship staging / QA / preview / source / intermediate directories inside `pethover/`. Common offenders: `pethover/qa/`, `pethover/staging/`, `pethover/preview/`, `pethover/source/`, `pethover/omni-src/`. If you need scratch space during generation, use a path **outside** the pet package directory (e.g. an OS temp dir) and clean it up regardless of success or failure.
- Don't ship intermediate per-direction frames as siblings of `omni-spritesheet.webp` — the omni atlas is the only artifact omni produces under `pethover/`; the individual frames it was composed from must not survive into the package.
- Don't ship audio clips from previous runs that the current manifest no longer references. If the user's current run shrinks the audio set (e.g. agent sounds dropped), the orphaned MP3s must be deleted from `pethover/audio/`.
- Don't leave `.tmp`, `.bak`, `.swp`, or `.DS_Store` files anywhere in the package. Atomic-write temp files must be renamed or deleted before the run returns success.
- Don't skip step 4's reconciliation sweep "because the manifest is correct". The manifest being correct is not enough — the on-disk directory must also be exactly the set of files the manifest references, no more and no less.

## Omni-specific

- **Don't generate a "similar" or "themed" character for omni — generate the SAME character as the sprite atlas.** Omni's purpose is to add viewing angles to one pet identity, not to ship a second pet that happens to look related. Always pass the sprite atlas (or a frame cropped from it) as visual conditioning to the image generator; never run omni generation from text prompts alone.
- Don't change cell dimensions between the sprite atlas and the omni atlas. `pethover.omni.frameWidth` / `frameHeight` must equal the top-level `frameWidth` / `frameHeight` of the sprite atlas. Different cell sizes break the visual continuity guarantee even if the character art matches.
- Don't introduce colors, accessories, lighting, or stylistic touches in omni that don't appear in the sprite atlas. If the sprite atlas's character has no scarf, omni's character has no scarf. If it has one, every omni frame has it in the right place.
- Don't accept a directional frame whose character has drifted (changed fur pattern, lost an accessory, changed proportions). Discard and regenerate — a drifted frame is more visible than a missing direction.
- Don't generate a fresh image for a mirror direction (`W`, `NW`, `SW`). Always declare them as `{ "mirrorOf": <primary direction> }`. Generating both halves wastes generation budget and produces visible left/right asymmetry from random AI variation.
- Don't emit `omni-spritesheet.webp` as lossless WebP at full omni dimensions — the file balloons past 8 MB. Use lossy q90.
- Don't emit `omniStateRows` keys for states the pet does not need direction for (`waving`, `jumping`, `failed`, `waiting`, `review`) beyond a single front-facing `S` entry.
- Don't emit a partial `eyes` block — anchors covering only some directions are rejected by the runtime. Either supply all 8 or omit `eyes` entirely.
- Don't reference the legacy `spritesheet.webp` from `omniStateRows`. Omni rows always index into `omni-spritesheet.webp`; the two atlases are independent.
