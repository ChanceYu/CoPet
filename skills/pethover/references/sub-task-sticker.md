# Sticker Pack Sub-Task

**Read this when:** the user selected `stickers` from the PetHover skill menu and you are about to generate a global sticker pack.

This sub-task produces a self-contained sticker pack under `$HOME/.pethover/stickers/<sticker-id>/`. It never writes into a pet package, never reads a pet package, and never modifies `pet.json`.

## Input contract

The input is the same validated input accepted by `SKILL.md`:

- PNG or JPEG image, 8 MB or smaller, decodable, not transparent-only.
- Text, 2,000 characters or fewer, non-empty after trimming whitespace.
- Image plus caption is allowed; the image is a palette and character reference only.

Images are never embedded into the SVG and are never traced into vector paths.

## Classification

Classify `kind`, `slot`, and bindings with `sticker-classification.md`.

If the input is ambiguous, ask exactly one clarifying question:

```text
Should this sticker be a one-shot burst for a specific moment, or a persistent decoration that stays visible across states?
```

Do not guess.

## Derive pack identity

Derive:

- `displayName`: short English name for the sticker.
- `displayNameZh`: natural Chinese display name.
- `id`: kebab-case slug from `displayName`.

If `$HOME/.pethover/stickers/<id>/` already exists, append `-2`, `-3`, and continue until the final destination is unique.

## Staging

Write all in-flight files to:

```text
$HOME/.pethover/tmp/stickers-<unix-epoch>-<sticker-id>/
```

Create `$HOME/.pethover/tmp/` if needed. The live `$HOME/.pethover/stickers/<sticker-id>/` directory is read-only until validation passes.

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
- File size 64 KB or smaller.

Programmatic SVG assembly is forbidden. Do not write a script that builds paths, timelines, symbols, or shape trees. Raster-to-SVG tracing is forbidden.

If the LLM output fails validation, retry with a corrected prompt. Abort after three non-conforming outputs, leave staging in place, and report the failing validation item.

## Compose `sticker.json`

For a burst sticker:

```json
{
  "id": "celebrate-confetti",
  "displayName": "Confetti Burst",
  "displayNameZh": "彩纸爆炸",
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
  "displayNameZh": "柔雪",
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
- Staging directory cleanliness: exactly `sticker.json` and `animation.svg`.

On success, atomically rename:

```text
$HOME/.pethover/tmp/stickers-<unix-epoch>-<sticker-id>/
```

to:

```text
$HOME/.pethover/stickers/<sticker-id>/
```

On failure, leave staging in place, report the specific failed checklist item, and do not touch the live directory.
