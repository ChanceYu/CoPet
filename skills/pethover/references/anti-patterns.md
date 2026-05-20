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

## Translation discipline

- **Don't translate inside the sprite sub-task.** Sub-task 3a's job is end-to-end English: derive the English `displayName` and `description`, hand them to `$hatch-pet`, write them to the sprite fragment unchanged. Chinese siblings (`pethover.displayNameZh`, `pethover.descriptionZh`) are derived during step 4 sub-step 6 — never inside any sub-task.
- **Don't include `displayNameZh` or `descriptionZh` in any fragment.** No sub-task owns these keys. A fragment that carries them violates the ownership matrix and is a generation error.
- **Don't translate twice in the same run.** Sub-step 6 is the only translation pass. If audio or omni sub-tasks somehow infer Chinese strings as a side-effect, drop them — only sub-step 6's output reaches the merged manifest.
- **Don't re-translate when the English source is unchanged.** The merge step's preserve-vs-retranslate rule keeps the base's Chinese siblings byte-identical when the merged English equals the base's English. Re-translating gratuitously produces visible churn in `displayNameZh` / `descriptionZh` across runs that didn't change the source.
- **Don't ship a manifest with missing or empty Chinese siblings.** Translation failure is a merge failure — abort the run, leave the staging dir for debugging. Never ship `pet.json` with `displayNameZh: ""` or absent.

## `$hatch-pet` boundary discipline (treat it as a black box)

The most important rule first: **influence `$hatch-pet` only through its documented input flags and consume its documented outputs. Never reach into its internal execution.** Everything below is a specific instance of that principle.

- **Don't inspect or mutate `$hatch-pet`'s scratch beyond the documented output files.** `imagegen-jobs.json`, `decoded/`, `frames/`, `prompts/`, layout-guide PNGs, and the QA artifacts that feed its internal Final-QA worker are all internal state. The only files in `<staging-dir>/.hatch-run/` that this skill reads are `final/spritesheet.webp` (or `.png`), `pet.json`, and `qa/review.json`. Anything else is off-limits.
- **Don't manipulate `imagegen-jobs.json` to selectively retry rows.** `$hatch-pet` has its own retry policy ("If `$imagegen` returns Bad Request for a row, retry once with `retry_prompt_file`; stop after second failure"). Layering a PetHover-side retry on top is exactly the kind of internal-decision-from-outside the boundary rule forbids. If `$hatch-pet`'s output is rejected, the only PetHover-side recovery is to re-run the entire sprite sub-task with `--force` — that is itself a fresh `$hatch-pet` invocation, not a partial re-execution of the previous one.
- **Don't re-evaluate the contact sheet or preview GIFs from the PetHover side.** `$hatch-pet`'s Final-QA worker already inspects those and emits its verdict into `qa/review.json`. Re-judging the visual artifacts from PetHover side means we and `$hatch-pet` could disagree about acceptance — fertile ground for brittle interop. Trust `review.json`'s `errors` count as the verdict; nothing more.
- **Don't choose `$hatch-pet`'s extract-frame method, prompt template, worker model, parallelism cap, or QA threshold.** Those are internal choices it makes from its inputs. The flags we pass are the only contract.
- **Don't omit `--pet-name`.** PetHover owns the package directory name (`$HOME/.pethover/pets/<pet-id>/`); we must pass the canonical kebab-case id to `$hatch-pet` so its manifest's `id` matches ours. Letting `$hatch-pet` auto-generate a name leads to a manifest/path mismatch and a downstream merge error.
- **Don't omit `--description`.** We already derive the one-sentence English description (≤ 140 chars) during sub-task 3a; pass it via `--description` so `$hatch-pet`'s manifest matches ours. Two independent description strings would be a manifest inconsistency.
- **Don't put style-related prose into `--pet-notes`.** `--pet-notes` is the "Stable pet description or avatar seed" field — *species, color, personality, distinguishing features*. Style guidance (e.g. "smooth gradient shading") goes in `--style-notes`. Crossing these channels makes `$hatch-pet`'s auto-inference noisier.
- **Don't put subject-related prose into `--style-notes`.** Subject (what the pet *is*) belongs in `--pet-notes`; style (how it's rendered) belongs in `--style-notes`. Notes only ever refine *within* the chosen preset's aesthetic.
- **Don't pass an uploaded image as part of a prompt string.** Use the `--reference <absolute-path>` flag. Reference images carry positional/structural cues that prose cannot reproduce.
- **Don't skip the brand pre-flight when the user input names a brand.** If the user mentions a brand/product/company by name, run the brand-discovery worker before `prepare_pet_run.py` and pass `--brand-name`, `--brand-brief`, `--brand-source`, `--brand-discovery-file`. Without these, `$hatch-pet` cannot ground brand details. Also switch `--style-preset` to `brand-inspired` for brand pets.
- **Don't omit `--output-dir` and let `$hatch-pet` auto-place its run-dir.** Pass an absolute path inside the current run's staging area: `<staging-dir>/.hatch-run/`. This keeps `$hatch-pet`'s scratch inside the per-run staging directory so step 4 sub-step 8's reconciliation deletes it before promotion, and so a failed run leaves the scratch in `$HOME/.pethover/tmp/` for debugging without ever touching the live `$HOME/.pethover/pets/<pet-id>/`.
- **Don't omit `--force` when regenerating sprite on an existing package.** Without it, `$hatch-pet` refuses to overwrite the run-dir and the sub-task fails. Re-running sprite is an explicit user opt-in in step 2, so `--force` is the correct semantics.
- **Don't reject `$hatch-pet`'s output for any reason beyond the three documented consumer checks**: (a) zero exit status, (b) `qa/review.json` with `errors == 0`, (c) the documented output files exist. Inventing extra rejection criteria — even well-meaning ones — is influencing `$hatch-pet`'s acceptance threshold from outside.
- **Don't trust `$hatch-pet`'s manifest when its `id` or `description` disagrees with what we passed.** Treat any mismatch as a generation error; `$hatch-pet` should echo our values, not invent new ones. (This is verifying the input contract, not re-judging the visual output.)
- **Don't leave `.hatch-run/` or `.hatch-codex/` in the final package.** Both are `$hatch-pet`'s scratch under the staging directory (`.hatch-run/` = run-dir, `.hatch-codex/` = redirected `CODEX_HOME`); step 4 sub-step 8 deletes both before the package-cleanliness check.
- **Don't let `$hatch-pet` write to `$HOME/.codex/pets/<pet-id>/`.** Its **Final Packaged Output** step targets `${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/` by default — without the `CODEX_HOME=<staging-dir>/.hatch-codex` env-var redirection, those files escape the staging directory and violate the staging invariant. The `CODEX_HOME` redirection is a documented `$hatch-pet` input, not internal influence; we are choosing its value.

## Manifest discipline

- Don't reference files outside the pet package (absolute paths, `../` segments, URLs).
- Don't put PetHover fields at the top level except for the single `pethover` object.
- Don't duplicate `spritesheetPath` as a PetHover-only spritesheet field.
- Don't write the final PetHover package under `$HOME/.codex/pets/`.
- Don't rewrite `pet.json` from a template or delete unowned top-level fields — other ecosystems may share this manifest.
- Don't let two sub-task fragments write the same key (see the ownership matrix in `merge-and-validate.md`). Overlapping writes are a generation error.

## Atomic staging

- **Don't write any artifact into `$HOME/.pethover/pets/<pet-id>/` between the start of step 3 and the end of step 5.** Every sub-task writes into `<staging-dir> = $HOME/.pethover/tmp/pet-<unix-epoch>-<pet-id>/`. The live package is read-only until the atomic promotion at the end of step 5. Writing to the live location mid-run defeats the entire "failure leaves the live package unchanged" guarantee.
- **Don't pass live-package paths into sub-task tools.** `$hatch-pet`'s `--output-dir`, audio-clip output paths, omni atlas paths, and the merge step's `pet.json` write must all be under `<staging-dir>`. A single path that escapes the staging directory breaks atomicity even if everything else is correct.
- **Don't skip the seed-copy for existing-package updates.** When `$HOME/.pethover/pets/<pet-id>/` exists at the start of step 3, copy its full contents into `<staging-dir>` before any sub-task runs. Otherwise the merge step's "preserve unowned keys" rule has no base to read from, and sub-tasks that did not run this time will appear to have been deleted after promotion.
- **Don't reuse a fixed staging directory name across runs.** Use the timestamp + pet-id naming so back-to-back regenerations on the same pet do not collide and so a still-running prior invocation's staging is not clobbered by a new one.
- **Don't promote before validation passes.** Validation is the gate. If validation fails, leave `<staging-dir>` in place for the operator to inspect; never attempt a partial promotion or per-file copy as a "best effort".
- **Don't perform the promotion via copy-and-delete.** The promotion is a `rename(2)` (or pair of renames for Case B in `references/merge-and-validate.md`). Copy-and-delete is not atomic; an interrupted copy leaves the live location in a partially-written state — the exact failure mode the staging mechanism exists to prevent.
- **Don't delete `<staging-dir>` on failure.** Leave it for debugging. Failed runs are diagnostic gold; deleting the staging dir destroys evidence of what went wrong.
- **Don't leave the backup directory behind after a successful Case B promotion.** Once the new package is in place at `<live-dir>` and verified there, delete `<backup-dir>` from `$HOME/.pethover/tmp/`. Leaving it leaks disk over time.

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
