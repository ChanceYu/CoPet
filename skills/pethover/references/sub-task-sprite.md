# Sprite atlas sub-task (3a)

**Read this when:** the user selected **Sprite atlas** in step 2 — you are about to invoke `$hatch-pet` and derive display strings.

## What this sub-task owns

Top-level Codex-compatible fields: `id`, `displayName`, `description`, `spritesheetPath`, `frameWidth`, `frameHeight`, `gridColumns`, `gridRows`. Plus the PetHover-namespace siblings: `pethover.schemaVersion`, `pethover.displayNameZh`, `pethover.descriptionZh`, `pethover.behaviors.stateRows`.

Nothing else under `pethover` is touched by this sub-task.

## `$hatch-pet` invocation

`$hatch-pet` is invoked via `prepare_pet_run.py` with explicit flags — never with `auto` defaults. See SKILL.md "Upstream skill" for resolution order.

### Required flags (PetHover always passes these)

| Flag | Value | Why explicit |
|---|---|---|
| `--style-preset` | `3d-toy` (default) or the user's mapped override (see SKILL.md "Default visual style") | Load-bearing — without this `$hatch-pet`'s `auto` mode infers `pixel` from the sprite-atlas context, regardless of prose. |
| `--pet-name` | The Codex `id` we want for the package (kebab-case) | We control the package directory name (`$HOME/.pethover/pets/<pet-id>/`), so we own this naming. Don't let `$hatch-pet` auto-name. |
| `--description` | The one-sentence English `description` (≤ 140 chars) we derived | We already produce the display strings; pass them in so `$hatch-pet`'s manifest matches ours. |
| `--output-dir` | An absolute path inside our own scratch space (`$HOME/.pethover/pets/<pet-id>/.hatch-run/` is a reasonable choice) | Keeps `$hatch-pet`'s run-dir artifacts off `$HOME/.codex/` so cleanup is local. |

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
$hatch-pet \
    --style-preset 3d-toy \
    --pet-name <pet-id> \
    --description "<derived English description>" \
    --output-dir "$HOME/.pethover/pets/<pet-id>/.hatch-run" \
    --pet-notes "<user's subject description: species, color, personality, etc.>" \
    --style-notes "rounded plush figurine; smooth gradient shading; soft edges; friendly silhouette; transparent background"
```

### Invocation with a reference image

```
$hatch-pet \
    --style-preset 3d-toy \
    --pet-name <pet-id> \
    --description "<derived English description>" \
    --output-dir "$HOME/.pethover/pets/<pet-id>/.hatch-run" \
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

### Visual QA verdict (post-invocation, before declaring sprite sub-task done)

`$hatch-pet` produces QA artifacts under the run-dir: `qa/contact-sheet.png`, `qa/review.json`, and per-row preview GIFs under `qa/previews/`. Inspect both before considering this sub-task complete:

- **`qa/review.json` must report zero errors.** Warnings require visual judgment; errors are blocking.
- **`qa/contact-sheet.png` must not show any of**: cropped references, repeated tiles, white backgrounds, identity drift between rows, style drift between rows, size popping. These fail the run *even when `review.json` is clean* — they are visual-only failures.
- If QA fails, decide whether to **retry the failing rows only** (`$hatch-pet` exposes per-row retry via the job manifest — see its docs) or **abort the sprite sub-task**.

If QA passes, the run-dir contains:

- `final/spritesheet.webp` (the codex atlas) and `final/spritesheet.png` (intermediate).
- `pet.json` with codex top-level fields.

### Stage the spritesheet into the PetHover package

Copy `final/spritesheet.webp` (or `.png`, matching the format chosen) from the run-dir to the PetHover package root: `$HOME/.pethover/pets/<pet-id>/spritesheet.webp`. The merge step (4) and final reconciliation will not touch the run-dir under `.hatch-run/` — that directory is `$hatch-pet`'s territory and should be left in place for debugging until the next run, OR cleaned by an explicit cleanup step at the end of the whole pipeline (see "Cleanup of run-dir" below).

Read `pet.json` from the run-dir's final output to extract the codex-compatible fields (`id`, `displayName`, `description`, `spritesheetPath`, `frameWidth`, `frameHeight`, `gridColumns`, `gridRows`). These fields feed the sprite manifest fragment. Verify that:

- The `id` matches the `--pet-name` we requested.
- The `description` matches the `--description` we requested.
- The `spritesheetPath` is `"spritesheet.webp"` or `"spritesheet.png"`, **not** an absolute path.

If `$hatch-pet`'s manifest disagrees with the values we passed, treat that as a generation error.

### Cleanup of run-dir

`$hatch-pet`'s `.hatch-run/` directory under the package root is **not** part of the PetHover package and **must** be deleted before the package-cleanliness check in step 5. Delete it at the end of the merge step (4) sub-step 7, alongside the other directory-reconciliation deletions. The package directory must not ship `.hatch-run/`.

The step 4 reconciliation rule "delete any sub-directory this skill created in a previous run at the package root" already covers this — `.hatch-run/` is exactly such a directory.

## Display strings (English + Chinese)

Derive two pieces of copy in **English** for the Codex top-level fields:

- **`displayName`** — a friendly, human-readable name for the pet (≤ 24 chars). Distinct from the machine `id` / `name`.
- **`description`** — a one-sentence summary of the pet's appearance and personality (≤ 140 chars).

Translate both to Chinese:

- **`pethover.displayNameZh`** — Chinese translation of `displayName`, same length budget.
- **`pethover.descriptionZh`** — Chinese translation of `description`, same length budget.

Translations must preserve tone (playful, warm, regal, etc.) and stay within the same length budget — they are translations of the English, not retellings. All four strings are **required outputs** of this sub-task; missing any one is a generation failure.

## Sprite manifest fragment

Emit both the codex-compatible top-level fields and the Chinese display siblings under `pethover`:

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
    "displayNameZh": "...",
    "descriptionZh": "...",
    "behaviors": {
      "stateRows": { /* canonical 9-row Codex vocabulary */ }
    }
  }
}
```

Hold this fragment in memory. The merge step (4) will apply it to `pet.json`. Do **not** write `pet.json` from inside this sub-task.
