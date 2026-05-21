# Audio Pack Schema

**Read this when:** composing or validating `audio.json` for a global CoPet audio pack.

Audio packs live under `$HOME/.copet/audios/<audio-pack-id>/`. They are self-contained and never merge into a pet package.

## Layout

```text
$HOME/.copet/audios/<audio-pack-id>/
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

`<audio-pack-id>` is a kebab-case slug derived from `displayName`. If the slug already exists under `$HOME/.copet/audios/`, append `-2`, `-3`, and continue until the destination is unique.

## Manifest

```json
{
  "id": "playful-fox",
  "displayName": "Playful Fox",
  "schemaVersion": 1,
  "interactionSounds": {
    "click": "click.mp3",
    "doubleClick": "surprised.mp3",
    "petted": "purr.mp3",
    "pettedSlow": "sigh.mp3",
    "dragLand": "wheee.mp3"
  },
  "agentSounds": {
    "thinking": "hmm.mp3",
    "editing": "tap.mp3",
    "inspecting": "peek.mp3",
    "awaitingApproval": "wait.mp3",
    "celebrating": "yay.mp3",
    "failed": "oof.mp3"
  }
}
```

## Required keys

Top-level keys are exactly:

- `id`
- `displayName`
- `schemaVersion`
- `interactionSounds`
- `agentSounds`

`schemaVersion` is always `1`.

`interactionSounds` has exactly these keys:

- `click`
- `doubleClick`
- `petted`
- `pettedSlow`
- `dragLand`

`agentSounds` has exactly these keys:

- `thinking`
- `editing`
- `inspecting`
- `awaitingApproval`
- `celebrating`
- `failed`

Each value is a path relative to the audio pack root. All paths must end in `.mp3`, must resolve inside the pack root, and must not contain `..`, absolute path prefixes, URLs, query strings, fragments, or cross-directory segments.

## Validation checklist

- `audio.json` parses as JSON.
- `id`, `displayName`, `schemaVersion`, `interactionSounds`, and `agentSounds` are present.
- No unexpected top-level key is present.
- `schemaVersion === 1`.
- `id` is kebab-case.
- `interactionSounds` contains all five required keys and no extra keys.
- `agentSounds` contains all six required keys and no extra keys.
- Every declared MP3 file exists inside the staging root.
- Every declared path is relative, has no directory separators, contains no `..`, and ends in `.mp3`.
- Every MP3 file is at most 16 MB.
- The staging directory contains exactly `audio.json` and the 11 declared MP3 files.
- No `.tmp`, `.bak`, `.swp`, `.DS_Store`, `.hatch-run`, `.hatch-codex`, or stray source file is present.
