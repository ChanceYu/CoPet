# Sprite atlas sub-task (3a)

**Read this when:** the user selected **Sprite atlas** in step 2 — you are about to invoke `$hatch-pet` and derive display strings.

## What this sub-task owns

Top-level Codex-compatible fields: `id`, `displayName`, `description`, `spritesheetPath`, `frameWidth`, `frameHeight`, `gridColumns`, `gridRows`. Plus the PetHover-namespace fields it controls directly: `pethover.schemaVersion`, `pethover.behaviors.stateRows`.

**This sub-task does NOT translate anything.** Chinese display strings (`pethover.displayNameZh`, `pethover.descriptionZh`) are derived during the merge step (step 4), not here. The sprite sub-task's job is end-to-end English: derive English `displayName` and `description`, pass them to `$hatch-pet`, and write them to the sprite fragment unchanged. Translation happens later, against the merged manifest.

Nothing else under `pethover` is touched by this sub-task.

## `$hatch-pet` invocation

`$hatch-pet` is invoked via `prepare_pet_run.py` with explicit flags — never with `auto` defaults. See SKILL.md "Upstream skill" for resolution order.

### Required flags (PetHover always passes these)

| Flag / env | Value | Why explicit |
|---|---|---|
| `--style-preset` | `3d-toy` (default) or the user's mapped override (see SKILL.md "Default visual style") | Load-bearing — without this `$hatch-pet`'s `auto` mode infers `pixel` from the sprite-atlas context, regardless of prose. |
| `--pet-name` | The Codex `id` we want for the package (kebab-case) | We control the package directory name (`$HOME/.pethover/pets/<pet-id>/`), so we own this naming. Don't let `$hatch-pet` auto-name. |
| `--description` | The one-sentence English `description` (≤ 140 chars) we derived | We already produce the display strings; pass them in so `$hatch-pet`'s manifest matches ours. |
| `--output-dir` | An absolute path inside the current run's staging directory: `<staging-dir>/.hatch-run/` | Keeps `$hatch-pet`'s run-dir artifacts (intermediate frames, prompts, QA, etc.) inside the per-run staging area so they are reconciled away alongside everything else before promotion. **Never** pass a path under the live `$HOME/.pethover/pets/<pet-id>/`. |
| `CODEX_HOME` (env var) | `<staging-dir>/.hatch-codex` | `$hatch-pet`'s **Final Packaged Output** step writes `pet.json` + `spritesheet.webp` to `${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/`. Without this redirection, those files land at `$HOME/.codex/pets/<pet-id>/` — outside our staging directory, which would violate the staging invariant. Setting `CODEX_HOME` is a documented `$hatch-pet` input (env var), not internal influence; we are picking the value of an existing knob. |

### Conditional flags (pass when the corresponding input is present)

| Flag | When to pass |
|---|---|
| `--reference <absolute-path>` | The user provided an image. Pass the absolute path to that image (PNG or JPEG). Repeatable; passes multiple references if the user gave several. |
| `--pet-notes "<freeform>"` | The user input is text-only (or has a text caption alongside an image). Put the user's subject description here — *species, color, personality, distinguishing features*. This is `$hatch-pet`'s "Stable pet description or avatar seed" field; do **not** stuff style-related prose into this. |
| `--style-notes "<freeform>"` | Always when style refinement matters. Put style detail that fits *inside* the chosen preset's aesthetic (e.g. for `3d-toy`: *"rounded plush figurine; smooth gradient shading; soft edges; friendly silhouette; transparent background"*). Notes refine within the preset; they cannot switch presets. |
| `--force` | The package directory already exists and the user is regenerating sprite. Without `--force`, `$hatch-pet` will refuse to overwrite the run folder. |
| `--brand-name`, `--brand-brief`, `--brand-source`, `--brand-discovery-file` | The user input names a real brand/product/company. See "Brand pre-flight" below. |

### Default invocation (most common case: text-only input, no brand, default style)

```
CODEX_HOME="<staging-dir>/.hatch-codex" \
$hatch-pet \
    --style-preset 3d-toy \
    --pet-name <pet-id> \
    --description "<derived English description>" \
    --output-dir "<staging-dir>/.hatch-run" \
    --pet-notes "<user's subject description: species, color, personality, etc.>" \
    --style-notes "rounded plush figurine; smooth gradient shading; soft edges; friendly silhouette; transparent background"
```

`<staging-dir>` is the per-run path set up at the start of step 3: `$HOME/.pethover/tmp/pet-<unix-epoch>-<pet-id>/`. After the invocation finishes, the staging directory contains two `$hatch-pet`-owned sub-directories: `.hatch-run/` (run-dir with intermediate artifacts + QA) and `.hatch-codex/pets/<pet-id>/` (`$hatch-pet`'s Final Packaged Output). Both are reconciled away by step 4 sub-step 8 before promotion.

### Invocation with a reference image

```
CODEX_HOME="<staging-dir>/.hatch-codex" \
$hatch-pet \
    --style-preset 3d-toy \
    --pet-name <pet-id> \
    --description "<derived English description>" \
    --output-dir "<staging-dir>/.hatch-run" \
    --reference "<absolute-path-to-uploaded-image>" \
    --pet-notes "<extracted subject details from the image + any caption>" \
    --style-notes "rounded plush figurine; smooth gradient shading; soft edges; friendly silhouette; transparent background"
```

**Image with off-default style**: pass the image via `--reference` (it serves as a *subject* reference, not a style reference) and keep `--style-preset 3d-toy`. The pet's identity (species, color palette, accessories) is derived from the image; its rendering aesthetic comes from the preset.

### Brand pre-flight (when input names a brand)

If the user input mentions a brand, product, or company by name (e.g. *"a pet inspired by the Slack logo"*, *"a Mailchimp mascot"*), `$hatch-pet` requires a brand-discovery step **before** `prepare_pet_run.py`:

1. Run the brand-discovery worker to produce a brief markdown file with the brand's visual identity (colors, mascot conventions, voice).
2. Pass to `$hatch-pet`: `--brand-name "<canonical name>"`, `--brand-brief "<one-sentence summary ≤ 45 words>"`, `--brand-source "<URL>"` (repeatable), `--brand-discovery-file "<absolute-path-to-the-brief.md>"`.
3. Set `--style-preset brand-inspired` (overrides the default `3d-toy`). Brand briefs come with their own visual identity that we honor by switching presets.

### Accept or reject `$hatch-pet`'s output

Treat `$hatch-pet` as a black box. It has its own internal Final-QA worker that inspects `qa/contact-sheet.png` + preview GIFs and emits a verdict into `qa/review.json`. Do **not** re-inspect those artifacts pixel-by-pixel from the PetHover side; that is `$hatch-pet`'s job, and second-guessing it leads to divergent acceptance criteria and brittle interop.

What this sub-task does after `$hatch-pet` exits is the bare minimum a consumer needs:

1. **Confirm `$hatch-pet` reported success.** If it exited non-zero, abort this sub-task and surface the exit status; do not attempt recovery from the PetHover side.
2. **Confirm the QA verdict is clean.** Parse `<staging-dir>/.hatch-run/qa/review.json` and require `errors == 0`. This is a programmatic check on `$hatch-pet`'s own emitted verdict — not a re-evaluation of the contact sheet. If `errors > 0`, abort.
3. **Confirm the documented output files exist.** Both `<staging-dir>/.hatch-codex/pets/<pet-id>/pet.json` and `<staging-dir>/.hatch-codex/pets/<pet-id>/spritesheet.webp` (or `.png`) must exist — these are the locations the `${CODEX_HOME}` env var redirected `$hatch-pet`'s Final Packaged Output to. Their absence with a zero exit code means `$hatch-pet` violated its own contract; surface that and abort.

If all three checks pass, accept the output. Do **not** invoke any `$hatch-pet`-internal retry path, do **not** edit `imagegen-jobs.json` to selectively re-run rows, do **not** manipulate `$hatch-pet`'s prompts or workers. The only recovery path on rejection is for the user to re-run the sprite sub-task end-to-end (the step-2 task checklist already gates that decision).

### Stage the spritesheet into the staging directory

Copy the spritesheet (`spritesheet.webp` or `.png`, matching the format `$hatch-pet` chose) from `<staging-dir>/.hatch-codex/pets/<pet-id>/` to the staging root: `<staging-dir>/spritesheet.webp` (or `.png`). **Do not** write anything to `$HOME/.pethover/pets/<pet-id>/` at this point — that location is read-only until the atomic promotion at the end of step 5.

Read `<staging-dir>/.hatch-codex/pets/<pet-id>/pet.json` to extract the codex-compatible fields (`id`, `displayName`, `description`, `spritesheetPath`, `frameWidth`, `frameHeight`, `gridColumns`, `gridRows`). These feed the sprite manifest fragment. Verify that:

- The `id` matches the `--pet-name` we requested.
- The `description` matches the `--description` we requested.
- The `spritesheetPath` is `"spritesheet.webp"` or `"spritesheet.png"`, **not** an absolute path.

If `$hatch-pet`'s manifest disagrees with the values we passed, treat that as a generation error. (Reading and verifying the manifest is consumer-side output verification, not influencing `$hatch-pet`'s execution — `$hatch-pet` is already done by this point.)

### Cleanup of `$hatch-pet`'s staging sub-directories

`$hatch-pet`'s scratch lives in two sub-directories of `<staging-dir>`:

- `<staging-dir>/.hatch-run/` — run-dir (intermediate jobs, prompts, decoded rows, QA artifacts)
- `<staging-dir>/.hatch-codex/` — redirected `CODEX_HOME` containing `pets/<pet-id>/pet.json` + spritesheet

**Neither** may survive into the promoted package. Step 4's reconciliation sweep (sub-step 8) deletes both from the staging directory before validation runs in step 5; the promoted live package never contains them.

The sprite sub-task itself **MAY** leave them in place after copying out the spritesheet — their contents (QA artifacts, intermediate frames, the canonical pet.json) can be useful for diagnosing failures in sibling sub-tasks running in parallel. Reconciliation is the one delete-point.

## Display strings (English only — no translation)

Derive two pieces of copy in **English** for the Codex top-level fields:

- **`displayName`** — a friendly, human-readable name for the pet (≤ 24 chars). Distinct from the machine `id` / `name`.
- **`description`** — a one-sentence summary of the pet's appearance and personality (≤ 140 chars).

Both strings are **required outputs** of this sub-task; missing either is a generation failure.

**Do not produce Chinese siblings here.** `pethover.displayNameZh` and `pethover.descriptionZh` are derived during the merge step (step 4 sub-step "Derive Chinese display strings"), after all fragments have been combined into the staging manifest. This keeps the sprite sub-task focused on `$hatch-pet` I/O and avoids two separate translation passes if (for example) the user re-runs sprite with a slightly different name on an existing package.

## Sprite manifest fragment

Emit the codex-compatible top-level fields and the English-only sub-tree under `pethover`. **Do not** include `displayNameZh` or `descriptionZh` — the merge step writes those after applying all fragments.

```json
{
  "id": "...",
  "displayName": "...",
  "description": "...",
  "spritesheetPath": "spritesheet.webp",
  "frameWidth": 192,
  "frameHeight": 208,
  "gridColumns": 8,
  "gridRows": 9,
  "pethover": {
    "schemaVersion": 1,
    "behaviors": {
      "stateRows": { /* canonical 9-row Codex vocabulary */ }
    }
  }
}
```

Hold this fragment in memory. The merge step (4) will apply it to `pet.json` and then derive the Chinese display siblings from the merged `displayName` / `description`. Do **not** write `pet.json` from inside this sub-task.
