---
name: pethover
displayName: PetHover
description: Use when generating a new PetHover pet from a user-uploaded image or a text description. Orchestrates the full pipeline — first invoke the upstream `$hatch-pet` skill to produce the sprite atlas and behavior vocabulary, then generate English `displayName` / `description` strings with parallel Chinese siblings `displayNameZh` / `descriptionZh`, then generate matching MP3 audio clips informed by the pet's identity, then write the result into a `pet.json` manifest at `$HOME/.pethover/pets/<pet-id>/`.
---

# PetHover

## Overview

This skill is the **single orchestration entry point** for creating a PetHover pet. Given either an uploaded reference image or a textual description, it:

1. Calls the upstream `$hatch-pet` skill to generate the **sprite atlas** and **behavior vocabulary**.
2. Generates English **`displayName`** and **`description`** plus their parallel Chinese siblings **`displayNameZh`** and **`descriptionZh`** from the pet identity.
3. Generates a matching set of **MP3 audio clips** for the pet — interaction sounds (user gestures) and agent-state sounds (CLI events).
4. Writes the entire output to `$HOME/.pethover/pets/<pet-id>/`, including the `pet.json` manifest and the `pethover/` resource folder.

It is the only PetHover skill — all PetHover-side configuration that the pet package needs lives under the `pethover` top-level key of `pet.json`.

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
├── spritesheet.png             ← $hatch-pet output, PNG or WebP (8×9 atlas, 192×208 per cell)
└── pethover/
    └── audio/                  ← generated MP3 clips
        ├── click.mp3
        ├── surprised.mp3
        ├── purr.mp3
        └── ...
```

`<pet-id>` is a kebab-case identifier, unique within `$HOME/.pethover/pets/`. Built-in pets ship in the app bundle using the same layout.

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

Pass the validated input to the upstream `$hatch-pet` skill. Expect back:

- An **8 × 9 sprite atlas** at 192 px × 208 px per cell (9 behavior rows × 8 frames per row), encoded as either **PNG or WebP** — whichever `$hatch-pet` produced for this pet.
- A **pet identity record**: name, color palette, species/silhouette descriptors, and character traits.
- The **behavior vocabulary** (one row per behavior, in `$hatch-pet`'s canonical order).

Write the spritesheet to `spritesheet.png` or `spritesheet.webp`, matching `$hatch-pet`'s output format; the file name's extension determines the format. Record the chosen path in the manifest (see step 5). Hold the pet identity record in memory; the next step uses it as creative direction.

### 3. Generate display strings

Using the pet identity record from step 2, produce two short pieces of copy in **English**:

- **`displayName`** — a friendly, human-readable name for the pet (≤ 24 chars). Distinct from the machine `id` / `name`.
- **`description`** — a one-sentence summary of the pet's appearance and personality (≤ 140 chars).

Then **translate each into Chinese**, stored as parallel sibling fields **`displayNameZh`** and **`descriptionZh`**. Translations must preserve tone (playful, warm, regal, etc.) and stay within the same length budget — they are translations of the English, not retellings. All four fields are required; missing any one is a generation failure.

The English originals and the Chinese siblings live side by side in `pethover` — see the schema in step 5.

### 4. Generate audio

Using the pet identity record from step 2, synthesize **11 short MP3 clips**.

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

Save each clip under `pethover/audio/`. Filenames are free-form; the manifest references them by relative path.

### 5. Write `pet.json`

Write the manifest at `$HOME/.pethover/pets/<pet-id>/pet.json`. Only mutate the `pethover` top-level key (see **Write principle** below).

Schema for the `pethover` section:

```json
{
  "pethover": {
    "source": {
      "kind": "image",
      "summary": "short human-readable description of the input"
    },
    "displayName": "Sparky",
    "displayNameZh": "小火花",
    "description": "An energetic orange fox who loves to bounce.",
    "descriptionZh": "一只精力旺盛、爱蹦跳的橙色小狐狸。",
    "spritesheet": "spritesheet.png",
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
    }
  }
}
```

All paths are relative to the pet package root (the directory containing `pet.json`). Absolute paths or `../` segments are rejected.

`source.kind` is `"image"` or `"text"`. `displayName`, `description`, `displayNameZh`, and `descriptionZh` are all required non-empty strings within the length budgets defined in step 3 — the English originals and the Chinese translations are stored as parallel sibling fields (no nested locale objects). Further locales would follow the same pattern with suffixes like `Ja`, `Ko`, but this skill always writes the English originals and the `Zh` siblings. `spritesheet` is the relative path to the file written in step 2 — either `"spritesheet.png"` or `"spritesheet.webp"` depending on `$hatch-pet`'s output format. All keys under `audio.interactionSounds` and `audio.agentSounds` are optional — a missing key means no sound for that event.

### 6. Validate the result

- The spritesheet file referenced by `pethover.spritesheet` (either `spritesheet.png` or `spritesheet.webp`) exists at the pet package root and matches `$hatch-pet`'s dimensions.
- `pethover.displayName` and `pethover.displayNameZh` are non-empty strings, each ≤ 24 chars.
- `pethover.description` and `pethover.descriptionZh` are non-empty strings, each ≤ 140 chars.
- Every audio path resolves to a file inside `pethover/audio/`.
- Every audio file is `.mp3`, ≤ 16 MB, and within the loudness target.

## Write principle

When updating `pet.json`, only overwrite the value of the `pethover` key. Do not touch or rewrite any other top-level field — those belong to the pet package itself (`id`, `name`, `version`) or to other ecosystems that may share this manifest, and clobbering them would destroy unrelated configuration.

Implementations must:

- Read the existing `pet.json` (treat a missing file as `{}`).
- Replace or set only the `pethover` field.
- Preserve every other top-level key verbatim, including its value and (where practical) its formatting.

Never rewrite the whole file from a hard-coded template, and never delete sibling keys whose schema this skill does not own.

## Channels

| Channel | Triggered by |
|---|---|
| `interactionSounds` | User gestures (click, petted, etc.) |
| `agentSounds` | Agent CLI events (`pet-state-changed`) |

There is **no app-level on/off toggle** for the generated audio. If the pet package configures a sound for an event and that event fires, the sound plays. The only thing that suppresses a sound is the cooldown coupling below.

### Cooldown coupling (interaction sounds only)

Interaction sounds piggy-back on the runtime's per-gesture cooldown: a gesture suppressed by cooldown does not fire at all, so no sound is emitted for it. Audio playback does not run its own cooldown logic — when the runtime invokes this skill with a gesture key, the sound plays.

Agent sounds have no cooldown coupling — they fire as agent events arrive (subject to PetHover's own debouncing of high-frequency state changes).

## Anti-patterns

- Don't generate audio before `$hatch-pet` returns the pet identity — the audio must reflect the pet's traits.
- Don't reference files outside the pet package (absolute paths, `../` segments, URLs).
- Don't add app-level gating on top of audio playback. If the skill emits a sound, it plays — no "Enable click sounds"-style toggle.
- Don't author long clips. ≤ 1 second is plenty for gesture feedback; longer is fine for ambient agent sounds but rare.
- Don't include silence padding — trim at generation time.
- Don't rewrite `pet.json` from a template or mutate keys other than `pethover` — other top-level fields are owned by the pet package or by other ecosystems and must be preserved verbatim.

## References

- [`audio-asset-format.md`](./references/audio-asset-format.md) — MP3 format rules, size caps, loudness target, silence trimming, validation notes.
- [`gesture-sound-map.md`](./references/gesture-sound-map.md) — suggested gesture-to-sound-role mapping (advisory).
