---
name: pethover
description: Use when generating or updating a PetHover-compatible Codex pet package from a user image or text description, especially when the package needs PetHover display translations, audio, or behavior metadata.
---

# PetHover

## Overview

This skill is the **single orchestration entry point** for creating a PetHover pet. Given either an uploaded reference image or a textual description, it:

1. Calls the upstream `$hatch-pet` skill to generate the Codex-compatible **sprite atlas** and canonical 9-row behavior vocabulary.
2. Uses the `$hatch-pet` package manifest as the source of truth for Codex top-level fields: `id`, `displayName`, `description`, and `spritesheetPath`.
3. Adds PetHover-only metadata under the top-level `pethover` key: Chinese display strings, optional audio bindings, and optional behavior metadata.
4. Writes the final package only to `$HOME/.pethover/pets/<pet-id>/`, including `pet.json`, the spritesheet, and any `pethover/` resources.

It is the only PetHover skill. All PetHover-side configuration lives under the `pethover` top-level key of `pet.json`.

## Upstream skill

This skill depends on the sibling **`$hatch-pet`** skill. Every `$hatch-pet` reference in this doc points to that one upstream skill, resolved in the following order:

1. **Sibling install** — a `hatch-pet/` folder installed alongside this skill (same skills root).
2. **Codex install** — `$HOME/.codex/skills/hatch-pet/`.
3. **Upstream source** — fetch / install from <https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md>.

Stop at the first hit. If none of the three resolves, the pipeline cannot run.

## Pet package layout

```
$HOME/.pethover/pets/<pet-id>/
├── pet.json
├── spritesheet.webp            ← or spritesheet.png; Codex 8×9 atlas, 192×208 per cell
└── pethover/
    └── audio/                  ← optional generated MP3 clips
        ├── click.mp3
        ├── surprised.mp3
        ├── purr.mp3
        └── ...
```

`<pet-id>` is a kebab-case identifier, unique within `$HOME/.pethover/pets/`. Built-in pets ship in the app bundle using the same layout. This skill writes its final package only to `$HOME/.pethover/pets/<pet-id>/`; do not write or mirror the finished PetHover package into `$HOME/.codex/pets/`.

## Inputs

| Input kind | Format | Notes |
|---|---|---|
| `image` | PNG or JPEG, ≤ 8 MB | A reference picture (photo, sketch, etc.). Used as primary inspiration. |
| `text`  | UTF-8 string, ≤ 2 000 chars | A description of the desired pet (appearance, personality, mood). |

Exactly one input kind per generation. An image with an optional caption is allowed; the caption is treated as additional text context but the image is the primary signal.

## Pipeline

### 1. Validate input

- **Image**: decodable, within size cap, not transparent-only.
- **Text**: non-empty, within character cap, not pure whitespace.

Reject otherwise with a clear error; do not call `$hatch-pet` on invalid input.

### 2. Invoke `$hatch-pet`

Pass the validated input to the upstream `$hatch-pet` skill. Expect a Codex-compatible pet package containing:

- An **8 × 9 sprite atlas** at 192 px × 208 px per cell (9 behavior rows × 8 frames per row), encoded as either **PNG or WebP** — whichever `$hatch-pet` produced for this pet.
- A `pet.json` manifest with top-level `id`, `displayName`, `description`, and `spritesheetPath`.
- The canonical 9-row Codex behavior vocabulary.

Use the `$hatch-pet` output package as the base package. Copy its spritesheet into the PetHover package root as `spritesheet.png` or `spritesheet.webp`, matching `$hatch-pet`'s output format. The file name's extension determines the format. Keep the generated manifest fields as the Codex source of truth; the next steps add PetHover metadata.

### 3. Generate display strings

Use the `$hatch-pet` manifest and the original user input to confirm two short pieces of copy in **English** for the Codex top-level fields:

- **`displayName`** — a friendly, human-readable name for the pet (≤ 24 chars). Distinct from the machine `id` / `name`.
- **`description`** — a one-sentence summary of the pet's appearance and personality (≤ 140 chars).

Then translate the top-level fields into Chinese: **`pethover.displayNameZh`** is the Chinese translation of `displayName`, and **`pethover.descriptionZh`** is the Chinese translation of `description`. Translations must preserve tone (playful, warm, regal, etc.) and stay within the same length budget — they are translations of the English, not retellings. All four fields are required for PetHover-generated packages; missing any one is a generation failure.

The English originals stay in the Codex-compatible top-level fields. The Chinese siblings live under `pethover` — see the schema in step 5.

### 4. Generate audio

Using the generated pet identity, synthesize short MP3 clips for the events this package supports. A full PetHover package may include the default 11 clips below; omit keys that are not generated.

**Interaction sounds (5):**

| Key | When it plays |
|---|---|
| `click` | Single user click |
| `doubleClick` | Two clicks within the double-click window |
| `petted` | Rapid repeated clicks |
| `pettedSlow` | Sustained long-press |
| `dragLand` | Pet dropped after a drag |

**Agent-state sounds (6):**

| Key | When it plays |
|---|---|
| `celebrating` | Agent finished a task |
| `failed` | Agent task failed |
| `thinking` | Agent reasoning / planning |
| `editing` | Agent writing code |
| `inspecting` | Agent reading code |
| `awaitingApproval` | Agent waiting on user |

See [`gesture-sound-map.md`](./references/gesture-sound-map.md) for suggested sound *roles* (advisory) and [`audio-asset-format.md`](./references/audio-asset-format.md) for binding asset rules (MP3 only, size cap, loudness target, silence trimming).

Save each generated clip under `pethover/audio/`. Filenames are free-form; the manifest references them by relative path. Do not add a manifest key for a missing or failed clip.

### 5. Write `pet.json`

Write the manifest at `$HOME/.pethover/pets/<pet-id>/pet.json`. Start from the `$hatch-pet` manifest when available, then add or replace only the top-level `pethover` object. The top-level fields must remain Codex-compatible; PetHover extensions must stay inside `pethover`. This is the only final output location for the PetHover package.

Recommended package schema:

```json
{
  "id": "sparky",
  "displayName": "Sparky",
  "description": "An energetic orange fox who loves to bounce.",
  "spritesheetPath": "spritesheet.webp",
  "frameWidth": 192,
  "frameHeight": 208,
  "gridColumns": 8,
  "gridRows": 9,
  "pethover": {
    "schemaVersion": 1,
    "displayNameZh": "小火花",
    "descriptionZh": "一只精力旺盛、爱蹦跳的橙色小狐狸。",
    "audio": {
      "interactionSounds": {
        "click":       "pethover/audio/click.mp3",
        "doubleClick": "pethover/audio/surprised.mp3",
        "petted":      "pethover/audio/purr.mp3",
        "pettedSlow":  "pethover/audio/sigh.mp3",
        "dragLand":    "pethover/audio/wheee.mp3"
      },
      "agentSounds": {
        "celebrating":      "pethover/audio/yay.mp3",
        "failed":           "pethover/audio/oof.mp3",
        "thinking":         "pethover/audio/hmm.mp3",
        "editing":          "pethover/audio/tap.mp3",
        "inspecting":       "pethover/audio/peek.mp3",
        "awaitingApproval": "pethover/audio/wait.mp3"
      }
    },
    "behaviors": {
      "stateRows": {
        "idle":          { "row": 0, "frames": 6, "durationMs": 1100 },
        "running-right": { "row": 1, "frames": 8, "durationMs": 1060 },
        "running-left":  { "row": 2, "frames": 8, "durationMs": 1060 },
        "waving":        { "row": 3, "frames": 4, "durationMs": 700 },
        "jumping":       { "row": 4, "frames": 5, "durationMs": 840 },
        "failed":        { "row": 5, "frames": 8, "durationMs": 1220 },
        "waiting":       { "row": 6, "frames": 6, "durationMs": 1010 },
        "running":       { "row": 7, "frames": 6, "durationMs": 820 },
        "review":        { "row": 8, "frames": 6, "durationMs": 1030 }
      }
    }
  }
}
```

All paths are relative to the pet package root (the directory containing `pet.json`). Absolute paths or `../` segments are rejected.

Top-level `displayName` and `description` are required non-empty English strings within the length budgets defined in step 3. `pethover.displayNameZh` must be the Chinese translation of `displayName`; `pethover.descriptionZh` must be the Chinese translation of `description`. Further locales should follow the same suffix pattern, such as `displayNameJa` or `descriptionKo`; do not introduce nested locale objects in this schema version.

`spritesheetPath` is the Codex-compatible top-level path to the file written in step 2 — either `"spritesheet.png"` or `"spritesheet.webp"` depending on `$hatch-pet`'s output format. Do not duplicate that value as `pethover.spritesheet`.

All keys under `pethover.audio.interactionSounds` and `pethover.audio.agentSounds` are optional. A missing key means no package-provided sound for that event.

`pethover.behaviors` is optional metadata for future PetHover behavior support. In schema version 1, `stateRows` mirrors the canonical 9-row Codex vocabulary and may be omitted when the package uses the default rows. If provided, it must not contradict the actual atlas geometry.

### 6. Validate the result

- The spritesheet file referenced by top-level `spritesheetPath` (either `spritesheet.png` or `spritesheet.webp`) exists at the pet package root and matches `$hatch-pet`'s dimensions.
- Top-level `displayName` and `pethover.displayNameZh` are non-empty strings, each ≤ 24 chars.
- Top-level `description` and `pethover.descriptionZh` are non-empty strings, each ≤ 140 chars.
- Every audio path under `pethover.audio` resolves to a file inside `pethover/audio/`.
- Every audio file is `.mp3`, ≤ 16 MB, and within the loudness target.
- If `pethover.behaviors.stateRows` is present, every row value is within the atlas bounds and every frame count is positive.

## Write principle

When creating a new package, write the Codex-compatible top-level fields and the `pethover` section together. When updating an existing package, only overwrite the value of the `pethover` key unless you are filling missing Codex-required fields for a package this skill is creating.

Implementations must:

- Read the existing `pet.json` (treat a missing file as `{}`).
- Ensure `id`, `displayName`, `description`, and `spritesheetPath` exist for packages this skill creates, preferably copied from the `$hatch-pet` manifest.
- Replace or set the `pethover` field.
- Preserve every unrelated top-level key verbatim, including its value and (where practical) its formatting.
- Write the final package only under `$HOME/.pethover/pets/<pet-id>/`.

Never rewrite the whole file from a hard-coded template, and never delete sibling keys whose schema this skill does not own.

## Channels

| Channel | Triggered by |
|---|---|
| `interactionSounds` | User gestures (click, petted, etc.) |
| `agentSounds` | Agent CLI events (`pet-state-changed`) |

Generated audio is package-provided capability. The PetHover app may still apply user preferences such as mute or click-sound settings before playback. If playback is enabled and the package configures a sound for an event, the runtime may play that sound when the event fires.

### Cooldown coupling (interaction sounds only)

Interaction sounds piggy-back on the runtime's per-gesture cooldown: a gesture suppressed by cooldown does not fire at all, so no sound is emitted for it. Audio playback should not add a second package-level cooldown.

Agent sounds have no cooldown coupling — they fire as agent events arrive (subject to PetHover's own debouncing of high-frequency state changes).

## Anti-patterns

- Don't generate audio before `$hatch-pet` has produced the pet manifest and sprite identity — the audio must reflect the pet's traits.
- Don't reference files outside the pet package (absolute paths, `../` segments, URLs).
- Don't put PetHover fields at the top level except for the single `pethover` object.
- Don't duplicate `spritesheetPath` as a PetHover-only spritesheet field.
- Don't write the final PetHover package under `$HOME/.codex/pets/`.
- Don't author long clips. ≤ 1 second is plenty for gesture feedback; longer is fine for ambient agent sounds but rare.
- Don't include silence padding — trim at generation time.
- Don't rewrite `pet.json` from a template or delete unowned top-level fields — other ecosystems may share this manifest.

## References

- [`audio-asset-format.md`](./references/audio-asset-format.md) — MP3 format rules, size caps, loudness target, silence trimming, validation notes.
- [`gesture-sound-map.md`](./references/gesture-sound-map.md) — suggested gesture-to-sound-role mapping (advisory).
