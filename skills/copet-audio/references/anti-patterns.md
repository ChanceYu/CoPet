# Audio Anti-Patterns

**Read this before committing to generation, before promotion, or when a run is failing.**

Each "Don't" is a hard rule. Violating it is a failed run.

## Scope

- Don't run generation before validating the input.
- Don't show validation errors, clarifying questions, failure reports, or success summaries in a language that conflicts with the user's input language.
- Don't ask for a target pet. Audio packs are global.
- Don't generate sticker packs, sprite atlases, omni directional body atlases, pet packages, pet body art, or `pet.json`.
- Don't read or write `$HOME/.copet/pets/`.
- Don't write into the live `$HOME/.copet/audios/` directory before validation passes.
- Don't create staging under `$HOME/.copet/tmp/`; use the caller's default writable temporary directory instead.
- Don't leave a partial live directory behind if promotion fails.
- Don't delete staging on failure. Leave it available for debugging.

## Audio Packs

- Don't omit any of the 11 required MP3 clips.
- Don't add extra top-level keys to `audio.json`.
- Don't reference paths outside the audio pack root.
- Don't use nested paths for MP3 files. The v1 pack layout keeps all 11 clips beside `audio.json`.
- Don't synthesize audio from oscillators, generated tones, MIDI, `ffmpeg sine=`, `aevalsrc=`, `tremolo=`, or code-generated waveforms.
- Don't reuse one clip across several keys with pitch, speed, or duration tweaks.
- Don't ship silence or near-silence as a valid clip.
- Don't exceed 16 MB per MP3 file.

## Cleanliness

- Don't leave `.tmp`, `.bak`, `.swp`, `.DS_Store`, source prompts, preview files, scratch directories, `.hatch-run`, or `.hatch-codex` in staging.
- Don't leave files not referenced by the manifest in staging.
- Don't promote a staging directory unless it contains exactly `audio.json` and the 11 declared MP3 files.
