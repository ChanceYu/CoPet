# Sticker Pack Generation

**Read this when:** generating a global CoPet sticker pack.

This workflow produces a self-contained decoration/effect sticker pack under `$HOME/.copet/stickers/<sticker-id>/`. It never writes into a pet package, never reads a pet package, and never modifies `pet.json`.

## Input contract

The input is the same validated input accepted by `SKILL.md`:

- PNG or JPEG image, 8 MB or smaller, decodable, not transparent-only.
- Text, 2,000 characters or fewer, non-empty after trimming whitespace.
- Image plus caption is allowed; the image is a palette, mood, texture, motion, and motif reference only.

Images are never embedded into the SVG and are never traced into vector paths. The sticker must not reproduce the image subject.

## Subject boundary

Sticker SVGs are decorative overlays for an existing pet. They do not create or replace the pet itself.

Hard rules:

- Do not draw a standalone pet, animal, humanoid, mascot, character body, head, face, or silhouette.
- Do not use the input subject as the sticker subject.
- Do not make the sticker's largest visual mass a creature, character, face, or body.
- For animal or character-themed requests, convert the theme into non-body decoration: paw-print sparkles, tiny symbols, speed lines, aura shapes, weather, speech bubbles, hearts, notes, dust, smoke, glow, confetti, or texture accents.

## Classification

Classify `kind`, `slot`, and bindings with `sticker-classification.md`.

If the input is ambiguous, ask exactly one clarifying question in the response language. The question must ask whether the sticker should be a one-shot burst for a specific moment or a persistent decoration that stays visible across states. Do not reuse English wording for non-English requests.

Do not guess.

## Derive pack identity

Derive:

- `displayName`: short English name for the sticker.
- `id`: kebab-case slug from `displayName`.

If `$HOME/.copet/stickers/<id>/` already exists, append `-2`, `-3`, and continue until the final destination is unique.

## Staging

Write all in-flight files to a staging directory in the caller's default writable temporary directory:

```sh
STAGING_DIR=$(mktemp -d "${TMPDIR:-/tmp}/copet-stickers-<sticker-id>.XXXXXX")
```

Do not stage under `$HOME/.copet/tmp/`; that can trigger config-directory authorization before validation. The live `$HOME/.copet/stickers/<sticker-id>/` directory is read-only until validation passes.

## Generate `animation.svg`

The LLM emits `animation.svg` directly as SVG XML in one authoring pass.

Read `svg-authoring.md` before authoring. The required summary is:

- Root `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H">`.
- No root `width` or `height`.
- Use SMIL animation elements or CSS `@keyframes`.
- Include `@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }`.
- No `<script>`, `<foreignObject>`, `<iframe>`, or `<image>`.
- No external `href` or `xlink:href`.
- No external fonts.
- Decoration-only: no standalone pet, animal, humanoid, mascot, head, face, body, or silhouette.
- File size 64 KB or smaller.

Programmatic SVG assembly is forbidden. Do not write a script that builds paths, timelines, symbols, or shape trees. Raster-to-SVG tracing is forbidden.

If the LLM output fails validation, retry with a corrected prompt. Abort after three non-conforming outputs, leave staging in place, and report the failing validation item in the response language.

## Compose `sticker.json`

For a burst sticker:

```json
{
  "id": "celebrate-confetti",
  "displayName": "Confetti Burst",
  "schemaVersion": 1,
  "kind": "burst",
  "slot": "over",
  "animationPath": "animation.svg",
  "viewBox": { "width": 192, "height": 208 },
  "playback": { "loop": false, "speed": 1 },
  "trigger": {
    "agentStates": ["celebrating"]
  }
}
```

For a persistent sticker:

```json
{
  "id": "snow-persistent",
  "displayName": "Soft Snow",
  "schemaVersion": 1,
  "kind": "persistent",
  "slot": "behind",
  "animationPath": "animation.svg",
  "viewBox": { "width": 192, "height": 208 },
  "playback": { "loop": true, "speed": 1 },
  "visibility": {
    "states": [
      "idle",
      "running-right",
      "running-left",
      "waving",
      "jumping",
      "failed",
      "waiting",
      "running",
      "review"
    ]
  }
}
```

`kind="burst"` requires `trigger` and forbids `visibility`. `kind="persistent"` requires `visibility` and forbids `trigger`.

## Validate and promote

Before promotion, validate:

- `sticker.json` manifest shape.
- `kind` mutual-exclusion rules.
- Legal state bindings.
- `animation.svg` XML and authoring rules.
- Decoration-only subject boundary.
- Staging directory cleanliness: exactly `sticker.json` and `animation.svg`.

On success, promote:

```text
$STAGING_DIR/
```

to:

```text
$HOME/.copet/stickers/<sticker-id>/
```

On failure, leave staging in place, report the specific failed checklist item in the response language, and do not touch the live directory.
