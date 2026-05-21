---
name: copet-sticker
description: Use when generating CoPet decoration/effect animated SVG sticker packs from a user image or text description for $HOME/.copet/stickers.
---

# CoPet Sticker

## Overview

Create one self-contained CoPet decorative animated sticker pack under `$HOME/.copet/stickers/<sticker-id>/`. This skill never creates audio packs, sprite atlases, omni directional body atlases, pet packages, pet body art, or `pet.json`.

Sticker SVGs are overlays for an existing pet. They must be decoration/effect layers, not standalone pets, animals, humanoids, mascots, character bodies, heads, faces, or silhouettes.

## Package Layout

```text
$HOME/.copet/
└── stickers/
    └── <sticker-id>/
        ├── sticker.json
        └── animation.svg
```

Pack ids are kebab-case slugs derived from `displayName`. If a slug collides under `$HOME/.copet/stickers/`, append `-2`, `-3`, and continue until the destination is unique.

## Inputs

| Input kind | Format | Notes |
|---|---|---|
| `image` | PNG or JPEG, 8 MB or smaller | A palette, mood, texture, motion, and motif reference only. It must be decodable and not transparent-only. |
| `text` | UTF-8 string, 2,000 characters or fewer | A description of the desired decorative sticker. It must not be empty after trimming whitespace. |

Exactly one primary input kind is used. An image with a caption is allowed; the image is primary and the caption is supporting context.

Images are never embedded into the SVG and are never traced into vector paths. The sticker must not reproduce the image subject.

## Response Language

Determine the response language before showing user-facing text:

- Text input: use the predominant language of the user's text.
- Image plus caption: use the predominant language of the caption.
- Image-only input: use the current conversation language, or the user's latest message language if the conversation language is unclear.
- Mixed-language input: use the language that carries the request intent.

Render validation rejections, clarifying questions, failure reports, and success summaries in that language. Do not localize machine-readable values: directory names, filenames, JSON keys, enum values, `id`, `animationPath`, and fixed manifest structure stay exactly as specified. `displayName` remains a short English name because it is a schema field.

## Workflow

1. Validate the input before staging or generation.
2. Classify `kind`, `slot`, and `trigger` or `visibility` with `references/sticker-classification.md`.
3. If the input is ambiguous, ask exactly one clarifying question in the response language. The question must ask whether the sticker should be a one-shot burst for a specific moment or a persistent decoration that stays visible across states. Do not reuse English wording for non-English requests.
4. Derive `displayName` and `id`.
5. Create one empty staging directory in the caller's default writable temporary directory:

```sh
STAGING_DIR=$(mktemp -d "${TMPDIR:-/tmp}/copet-stickers-<sticker-id>.XXXXXX")
```

Do not stage under `$HOME/.copet/tmp/`; that can trigger config-directory authorization before validation. The live `$HOME/.copet/stickers/<sticker-id>/` directory is read-only until validation passes.

6. Emit `animation.svg` directly as SVG XML in one authoring pass. Read `references/svg-authoring.md` before authoring. Programmatic SVG assembly is forbidden.
7. Compose `sticker.json` in the staging root. `kind="burst"` requires `trigger` and forbids `visibility`; `kind="persistent"` requires `visibility` and forbids `trigger`.
8. Validate the full staging directory before promotion.
9. On success, promote staging to:

```text
$HOME/.copet/stickers/<sticker-id>/
```

On validation failure, leave staging in place, report the specific failed checklist item in the response language, and do not touch the live directory.

## Subject Boundary

Sticker generation must produce a decorative overlay or effect only. If the input names a creature or character, translate it into non-body decorative motifs such as paw-print sparkles, color accents, aura shapes, weather, symbols, speech bubbles, notes, hearts, particles, dust, smoke, glow, or confetti.

Image input is only a reference for palette, mood, motion, texture, and decorative motif cues. It is never a subject to reproduce, never embedded into sticker SVG, and never passed through a raster-to-SVG tracing path.

If the SVG output fails validation, retry with a corrected prompt. Abort after three non-conforming outputs, leave staging in place, and report the failing validation item in the response language.

## References

- `references/sticker-pack-generation.md` - detailed sticker pack workflow and manifest examples.
- `references/sticker-classification.md` - sticker kind, slot, and binding classification.
- `references/svg-authoring.md` - sticker SVG authoring rules.
- `references/sticker-examples/` - valid manifest/SVG examples.
- `references/anti-patterns.md` - hard failure rules.
- `scripts/validate-sticker-examples.mjs` - validates bundled examples.
