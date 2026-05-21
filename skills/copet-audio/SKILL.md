---
name: copet-audio
description: Use when generating CoPet global 11-clip MP3 audio packs from a user image or text description for $HOME/.copet/audios.
---

# CoPet Audio

## Overview

Create one self-contained CoPet global audio pack under `$HOME/.copet/audios/<audio-pack-id>/`. This skill never creates sticker packs, sprite atlases, omni directional body atlases, pet packages, or `pet.json`.

Every shipped MP3 must come from a real audio-generation backend, text-to-speech backend, sound-effect generation backend, field recording library, curated sample library, or another authored audio source selected to match the inferred character. Procedural substitutes are failed runs even when structural validation passes.

## Package Layout

```text
$HOME/.copet/
└── audios/
    └── <audio-pack-id>/
        ├── audio.json
        ├── click.mp3
        ├── surprised.mp3
        ├── purr.mp3
        ├── sigh.mp3
        ├── wheee.mp3
        ├── hmm.mp3
        ├── tap.mp3
        ├── peek.mp3
        ├── wait.mp3
        ├── yay.mp3
        └── oof.mp3
```

Pack ids are kebab-case slugs derived from `displayName`. If a slug collides under `$HOME/.copet/audios/`, append `-2`, `-3`, and continue until the destination is unique.

## Inputs

| Input kind | Format | Notes |
|---|---|---|
| `image` | PNG or JPEG, 8 MB or smaller | A reference picture. It must be decodable and not transparent-only. |
| `text` | UTF-8 string, 2,000 characters or fewer | A description of the desired audio character. It must not be empty after trimming whitespace. |

Exactly one primary input kind is used. An image with a caption is allowed; the image is primary and the caption is supporting context.

Reject invalid input before staging or generation.

## Response Language

Determine the response language before showing user-facing text:

- Text input: use the predominant language of the user's text.
- Image plus caption: use the predominant language of the caption.
- Image-only input: use the current conversation language, or the user's latest message language if the conversation language is unclear.
- Mixed-language input: use the language that carries the request intent.

Render validation rejections, clarifying questions, failure reports, and success summaries in that language. Do not localize machine-readable values: directory names, filenames, JSON keys, enum values, `id`, and fixed manifest structure stay exactly as specified. `displayName` remains a short English name because it is a schema field.

## Workflow

1. Validate the input.
2. Infer animal class, object class, material, size, energy, personality, and voice character from the raw user input.
3. Derive `displayName` and `id`.
4. Create one empty staging directory in the caller's default writable temporary directory:

```sh
STAGING_DIR=$(mktemp -d "${TMPDIR:-/tmp}/copet-audios-<audio-pack-id>.XXXXXX")
```

Do not stage under `$HOME/.copet/tmp/`; that can trigger config-directory authorization before validation. The live `$HOME/.copet/audios/<audio-pack-id>/` directory is read-only until validation passes.

5. Generate exactly 11 authored MP3 clips:

| Manifest key | File |
|---|---|
| `interactionSounds.click` | `click.mp3` |
| `interactionSounds.doubleClick` | `surprised.mp3` |
| `interactionSounds.petted` | `purr.mp3` |
| `interactionSounds.pettedSlow` | `sigh.mp3` |
| `interactionSounds.dragLand` | `wheee.mp3` |
| `agentSounds.thinking` | `hmm.mp3` |
| `agentSounds.editing` | `tap.mp3` |
| `agentSounds.inspecting` | `peek.mp3` |
| `agentSounds.awaitingApproval` | `wait.mp3` |
| `agentSounds.celebrating` | `yay.mp3` |
| `agentSounds.failed` | `oof.mp3` |

6. Compose `audio.json` in the staging root using `references/audio-pack-schema.md`.
7. Validate the full staging directory before promotion.
8. On success, promote staging to:

```text
$HOME/.copet/audios/<audio-pack-id>/
```

On validation failure, leave staging in place, report the specific failed checklist item in the response language, and do not touch the live directory.

## Generation Discipline

Audio generation must not fall back to synthesized tones, oscillator output, MIDI rendering, silence, or pitch-shifted duplicates. The output must be authored audio from a real backend or curated source.

Image input is only a reference for palette, mood, motion, texture, material, subject class, and personality cues. It is never passed directly to an audio backend as a waveform source.

If the required backend is unavailable or the output cannot satisfy the discipline after three attempts, abort the run, leave staging in place, and report the specific missing backend or validation failure in the response language.

## References

- `references/audio-pack-generation.md` - detailed audio pack workflow.
- `references/audio-pack-schema.md` - `audio.json` schema and validation.
- `references/audio-asset-format.md` - MP3 format guidance.
- `references/gesture-sound-map.md` - advisory interaction sound roles.
- `references/anti-patterns.md` - hard failure rules.
