# Audio Pack Generation

**Read this when:** generating a global CoPet audio pack.

This workflow produces a self-contained audio pack under `$HOME/.copet/audios/<audio-pack-id>/`. It never writes into a pet package, never reads a pet package, and never modifies `pet.json`.

## Input contract

The input is the same validated input accepted by `SKILL.md`:

- PNG or JPEG image, 8 MB or smaller, decodable, not transparent-only.
- Text, 2,000 characters or fewer, non-empty after trimming whitespace.
- Image plus caption is allowed; the image is the primary signal and the caption is supporting context.

The workflow infers the audio character directly from that input.

## Abort if the real backend is unavailable

Every MP3 must come from a real audio-generation backend: text-to-speech, sound-effect generation, field recording library, curated sample library, or another authored audio source selected to match the inferred character.

Abort if no real backend is available. Do not ship synthesized tones, code-generated waveforms, MIDI renders, oscillator output, silence, or pitch-shifted duplicates as substitutes.

Forbidden substitutes include:

- `ffmpeg sine=`, `aevalsrc=`, `tremolo=`, or other oscillator chains.
- FM synthesis, MIDI rendering, generated beeps, and generated envelopes over tones.
- The same clip reused across multiple keys with pitch, speed, or duration tweaks.
- Silence or near-silence accepted only because the MP3 container is valid.

## Derive pack identity

Derive:

- `displayName`: short English name for the pack.
- `id`: kebab-case slug from `displayName`.

If `$HOME/.copet/audios/<id>/` already exists, append `-2`, `-3`, and continue until the final destination is unique.

## Staging

Write all in-flight files to a staging directory in the caller's default writable temporary directory:

```sh
STAGING_DIR=$(mktemp -d "${TMPDIR:-/tmp}/copet-audios-<audio-pack-id>.XXXXXX")
```

Do not stage under `$HOME/.copet/tmp/`; that can trigger config-directory authorization before validation. The live `$HOME/.copet/audios/<audio-pack-id>/` directory is read-only until validation passes.

## Audio target inference

From an image, classify the depicted subject: animal class, size, material, energy, and obvious personality. A small energetic fox should sound quick and bright; a large sleepy bear should sound soft and low; a robot should use authored mechanical chirps rather than animal vocalizations.

From text, parse:

- Explicit species or object: `corgi`, `robot cat`, `phoenix`, `blob`.
- Personality: `grumpy`, `playful`, `regal`, `sleepy`.
- Size or age: `tiny`, `giant`, `old`, `baby`.

If the description gives only personality, use a small-mammal vocal palette unless another class is clearly indicated.

## Clip set

Generate exactly 11 MP3 clips:

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

Target each clip at 1-2 seconds after trimming leading and trailing silence. Interaction clips should stay reactive; agent clips can be a little softer and more ambient, but still compact.

Read `audio-asset-format.md` for MP3 format, loudness, trimming, and size recommendations. Read `gesture-sound-map.md` for advisory interaction sound roles.

## Manifest

Compose `audio.json` in the staging root:

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

Use the actual derived `id` and `displayName`; keep the fixed filenames and key structure.

## Validate and promote

Before promotion, validate the staging directory with `audio-pack-schema.md`.

On success, promote:

```text
$STAGING_DIR/
```

to:

```text
$HOME/.copet/audios/<audio-pack-id>/
```

On failure, leave staging in place, report the specific failed checklist item in the response language, and do not touch the live directory.
