# Sticker Anti-Patterns

**Read this before committing to generation, before promotion, or when a run is failing.**

Each "Don't" is a hard rule. Violating it is a failed run.

## Scope

- Don't run generation before validating the input.
- Don't show validation errors, clarifying questions, failure reports, or success summaries in a language that conflicts with the user's input language.
- Don't generate audio packs, sprite atlases, omni directional body atlases, pet packages, pet body art, or `pet.json`.
- Don't read or write `$HOME/.copet/pets/`.
- Don't write into the live `$HOME/.copet/stickers/` directory before validation passes.
- Don't create staging under `$HOME/.copet/tmp/`; use the caller's default writable temporary directory instead.
- Don't leave a partial live directory behind if promotion fails.
- Don't delete staging on failure. Leave it available for debugging.

## Sticker Packs

- Don't guess when the input could be either burst or persistent. Ask one clarifying question.
- Don't draw a standalone pet, animal, humanoid, mascot, character body, head, face, or silhouette in `animation.svg`.
- Don't use the uploaded image or text subject as the sticker subject; use only palette, mood, texture, motion, and decorative motif cues.
- Don't make a creature, character, face, or body the largest visual mass in the sticker.
- Don't omit `trigger` from a burst sticker.
- Don't include `visibility` on a burst sticker.
- Don't omit `visibility` from a persistent sticker.
- Don't include `trigger` on a persistent sticker.
- Don't use state names outside the current `PetStateId`, `AgentState`, or `EmotionState` unions.
- Don't embed uploaded images into SVG.
- Don't use `<image>`, `<script>`, `<foreignObject>`, or `<iframe>`.
- Don't use external `href`, `xlink:href`, external fonts, URLs, or `data:image/` references.
- Don't set root `width` or `height`; use `viewBox`.
- Don't omit the `prefers-reduced-motion: reduce` fallback.
- Don't ship a non-animated SVG. Use SMIL or CSS keyframes.
- Don't exceed 64 KB for `animation.svg`.
- Don't assemble sticker SVGs with Python, Node, templates, generated path strings, canvas, raster tracing, GIF conversion, or frame extraction.

## Cleanliness

- Don't leave `.tmp`, `.bak`, `.swp`, `.DS_Store`, source prompts, preview files, scratch directories, `.hatch-run`, or `.hatch-codex` in staging.
- Don't leave files not referenced by the manifest in staging.
- Don't promote a staging directory unless it contains exactly `sticker.json` and `animation.svg`.
