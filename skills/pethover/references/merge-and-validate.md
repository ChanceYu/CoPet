# Merge manifest fragments and validate the package

**Read this when:** you have at least one in-memory manifest fragment from step 3 (sprite / audio / omni) and need to write the final `pet.json` plus verify it.

This reference covers step 4 (merge + directory reconciliation) and step 5 (validate the merged manifest) in detail.

## Fragment ownership matrix

A fragment must touch only the keys it owns. Overlapping writes are a generation error.

| Sub-task | Owns |
|---|---|
| sprite | top-level `id`, `displayName`, `description`, `spritesheetPath`, `frameWidth`, `frameHeight`, `gridColumns`, `gridRows`; `pethover.schemaVersion`, `pethover.displayNameZh`, `pethover.descriptionZh`, `pethover.behaviors.stateRows` |
| audio | `pethover.audio` |
| omni | `pethover.omni`, `pethover.eyes`, `pethover.behaviors.omniStateRows` |

## Step 4 — merge algorithm

Apply in this exact order:

1. **Read base.** If `pet.json` already exists at the target path, parse it. Otherwise start with an empty object `{}`. Treat any unrecognized top-level keys as opaque and preserve them verbatim — other ecosystems may share this manifest.
2. **Apply sprite fragment (if produced).** Replace the top-level Codex-compatible fields (`id`, `displayName`, `description`, `spritesheetPath`, `frameWidth`, `frameHeight`, `gridColumns`, `gridRows`). Set `pethover.schemaVersion`, `pethover.displayNameZh`, `pethover.descriptionZh`, and `pethover.behaviors.stateRows` from the fragment. Do **not** touch any other key under `pethover`.
3. **Apply audio fragment (if produced).** Replace `pethover.audio` wholesale with the fragment's audio object. Drop any orphaned `pethover.audio.*` keys not present in the fragment.
4. **Apply omni fragment (if produced).** Set `pethover.omni`, `pethover.eyes`, and `pethover.behaviors.omniStateRows`. Do **not** disturb `pethover.behaviors.stateRows` (sprite's territory) — the merge writes to a sibling key only.
5. **Preserve unowned keys.** Any key under `pethover` that no fragment claims (e.g. user-edited extensions) must be carried over from the base unchanged.
6. **Write atomically.** Write the merged document to a temp file in the same directory, then rename to `pet.json` — never leave a half-written manifest on disk.
7. **Reconcile the package directory.** Described below.

## Step 4 sub-step 7 — package directory reconciliation

Sweep the package directory and remove every file or sub-directory that the final `pet.json` does not reference. This is mandatory; the package must not ship stale or staging artifacts.

### Build the keep-set first

Enumerate every path referenced by the final manifest:

- `pet.json` itself
- The file at top-level `spritesheetPath` (resolved relative to the package root)
- Every file referenced by `pethover.audio.interactionSounds.*` and `pethover.audio.agentSounds.*`
- The file at `pethover.omni.spritesheetPath`, if `pethover.omni` is present
- The file at `pethover.eyes.spritesheetPath`, if `pethover.eyes` is present

### Apply these deletion rules

- **Package root**: keep only `pet.json`, the file at `spritesheetPath`, and the `pethover/` directory. Delete every other regular file at the root, including stale spritesheets from previous runs in a different format (e.g. an orphaned `spritesheet.webp` when the manifest now says `"spritesheetPath": "spritesheet.png"`). Delete the `.hatch-run/` directory if it exists — that is `$hatch-pet`'s scratch run-dir used by the sprite sub-task and is not part of the shipped package. Leave other unknown sub-directories alone — they may belong to a different ecosystem sharing the package — but do delete any sub-directory **this skill created** in a previous run (such as a staging or preview directory at the root).
- **Inside `pethover/`**: this sub-directory is exclusively owned by this skill. Delete **every** file and sub-directory inside it that is not in the keep-set. This explicitly includes staging / QA / preview directories like `pethover/qa/`, `pethover/staging/`, `pethover/preview/`, `pethover/source/`; intermediate per-direction frames like `pethover/omni-src/n.png`; backup files like `pethover/omni-spritesheet.webp.bak`; and any audio clip the current run did not reference (e.g. if audio was previously generated with `pettedSlow` but this run does not produce it, `pethover/audio/sigh.mp3` must be deleted).
- **Empty directories**: after deletions, remove any now-empty sub-directory (`pethover/audio/` is dropped if no audio clip remains; `pethover/` is kept only if it still contains at least one file).
- **Temp files**: delete any leftover `*.tmp`, `*.swp`, `.DS_Store`, or rename-target temp files from the atomic write in step 6.

Reconciliation runs **only after** the atomic `pet.json` write in step 6 succeeds. A reconciliation failure is a generation error: surface it, but the manifest is already on disk and consistent — the orphaned files merely degrade cleanliness, not correctness.

## Reference: fully-merged package schema

For a pet with all three sub-tasks selected, the merged `pet.json` looks like:

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
      },
      "omniStateRows": {
        "idle": {
          "N":  { "row": 0, "frames": 6, "durationMs": 1100 },
          "NE": { "row": 1, "frames": 6, "durationMs": 1100 },
          "E":  { "row": 2, "frames": 6, "durationMs": 1100 },
          "SE": { "row": 3, "frames": 6, "durationMs": 1100 },
          "S":  { "row": 4, "frames": 6, "durationMs": 1100 },
          "SW": { "mirrorOf": "SE" },
          "W":  { "mirrorOf": "E" },
          "NW": { "mirrorOf": "NE" }
        },
        "running": {
          "E":  { "row": 5, "frames": 8, "durationMs": 820 },
          "SE": { "row": 6, "frames": 8, "durationMs": 820 },
          "W":  { "mirrorOf": "E" },
          "SW": { "mirrorOf": "SE" }
        }
      }
    },
    "omni": {
      "spritesheetPath": "pethover/omni-spritesheet.webp",
      "frameWidth": 192, "frameHeight": 208,
      "gridColumns": 8, "gridRows": 8,
      "defaultFacing": "S"
    },
    "eyes": {
      "spritesheetPath": "pethover/eyes.webp",
      "frameSize": 32,
      "pupilGridColumns": 3, "pupilGridRows": 3,
      "anchors": {
        "N":  [96, 70],  "NE": [108, 74], "E":  [114, 84], "SE": [108, 96],
        "S":  [96, 100], "SW": [84, 96],  "W":  [78, 84],  "NW": [84, 74]
      }
    }
  }
}
```

All paths are relative to the pet package root. Absolute paths or `../` segments are rejected.

Top-level `displayName` and `description` are required non-empty English strings. `pethover.displayNameZh` and `pethover.descriptionZh` must be Chinese translations of them. Further locales follow the same suffix pattern (such as `displayNameJa` or `descriptionKo`); do not introduce nested locale objects in this schema version.

`spritesheetPath` is the Codex-compatible top-level path. Do not duplicate that value as `pethover.spritesheet`.

All keys under `pethover.audio.interactionSounds` and `pethover.audio.agentSounds` are optional. A missing key means no package-provided sound for that event.

`pethover.behaviors.stateRows` is owned by the sprite sub-task; `pethover.behaviors.omniStateRows` is owned by the omni sub-task. They share the `behaviors` parent but never share a child key.

## Step 5 — validate the merged manifest

Run all checks on the **merged `pet.json` and the on-disk artifacts together** — not on individual fragments. Validation is the final gate before the skill returns success; a failure here is a generation failure, not a warning.

**Always run validation, even when only one sub-task ran.** Re-running just audio on an existing pet still validates the full merged document, because a stale or corrupted base manifest can invalidate the new fragment.

### Manifest shape (always)

- `pet.json` is well-formed JSON. The parser must accept it as a single object.
- Top-level fields are present and non-empty strings: `id` (kebab-case), `displayName` (≤ 24 chars), `description` (≤ 140 chars), `spritesheetPath`. Frame geometry numbers (`frameWidth`, `frameHeight`, `gridColumns`, `gridRows`) are positive integers.
- A `pethover` top-level key exists and is an object. `pethover.schemaVersion` equals `1`.
- `pethover.displayNameZh` and `pethover.descriptionZh` are non-empty strings, ≤ 24 and ≤ 140 chars respectively, and are translations of (not retellings of) `displayName` and `description`.
- All path-shaped values use forward slashes and never start with `/` or contain `../`.

### Sprite artifact (always — the file is the codex-compatible source of truth)

- The file referenced by top-level `spritesheetPath` (either `spritesheet.png` or `spritesheet.webp`) exists at the pet package root.
- Its pixel dimensions equal `gridColumns × frameWidth` by `gridRows × frameHeight`.
- If `pethover.behaviors.stateRows` is present, every `row` is `< gridRows`, every `frames` is `>= 1` and `<= gridColumns`, and every `durationMs` is a positive integer.

### Audio artifacts (only when `pethover.audio` is present)

- Every audio path under `pethover.audio.interactionSounds` and `pethover.audio.agentSounds` resolves to an existing file under `pethover/audio/`.
- Every audio file is `.mp3`, ≤ 16 MB, and within the loudness target (see [`audio-asset-format.md`](./audio-asset-format.md)).

### Omni artifacts (only when `pethover.omni` is present)

- `pethover.omni.spritesheetPath` starts with `pethover/`, and the file at that path exists.
- The omni file's pixel dimensions equal `omni.gridColumns × omni.frameWidth` by `omni.gridRows × omni.frameHeight`.
- **Frame geometry matches the sprite atlas**: `pethover.omni.frameWidth` equals the top-level `frameWidth`, and `pethover.omni.frameHeight` equals the top-level `frameHeight`. The omni atlas may use a different `gridColumns` / `gridRows` than the sprite atlas, but the per-cell dimensions are identical — this is the structural guarantee that the same character can be cropped from either atlas and rendered at the same on-screen size.
- `pethover.behaviors.omniStateRows` is present and non-empty. The `idle` state contains at least one **concrete frame entry** (a `{row, frames, durationMs}` object, not a mirror).
- Every concrete frame entry has `row < omni.gridRows` and `1 <= frames <= omni.gridColumns`.
- Every mirror entry (`{ "mirrorOf": <direction> }`) under state `S` points to a direction that exists in `omniStateRows[S]` **and** is itself a concrete frame entry. Mirror chains are rejected.
- `omni.defaultFacing` is one of the 8 valid `Direction8` values.

### Eyes artifacts (only when `pethover.eyes` is present)

- `pethover.eyes.spritesheetPath` starts with `pethover/`, and the file exists.
- The eyes file's pixel dimensions equal `pupilGridColumns × frameSize` by `pupilGridRows × frameSize`.
- `pethover.eyes.anchors` has exactly 8 entries, one per direction (`N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`). Each value is a 2-element integer array.

### Package cleanliness (the directory contains exactly what the manifest references — no more, no less)

- At the package root, the only regular files are `pet.json` and the file named by top-level `spritesheetPath`. Any other regular file (a stale `spritesheet.webp` from a previous run when the manifest now says `.png`, a leftover `pet.json.bak`, etc.) is a cleanliness failure.
- At the package root, no sub-directories exist beyond `pethover/` and (when relevant) directories owned by other ecosystems that pre-date this run. The skill **must not** create any staging / preview / QA directory at the root. Specifically, `.hatch-run/` (used by sprite sub-task during this run) must have been deleted by step 4 sub-step 7.
- Inside `pethover/`, the only files are those referenced by `pethover.audio.*`, `pethover.omni.spritesheetPath`, and `pethover.eyes.spritesheetPath`. The only sub-directory is `pethover/audio/`, and it exists only when at least one audio clip is referenced.
- No directories named `qa`, `staging`, `preview`, `source`, `omni-src`, or any other intermediate-artifact name exist anywhere under the package. No files end in `.tmp`, `.bak`, `.swp`, or contain `.DS_Store`.
- Every file the keep-set (defined in step 4 sub-step 7) references actually exists on disk, and every file present on disk under `pethover/` is in the keep-set. This is a bijection; either side missing is a cleanliness failure.

If any check fails, treat the run as failed and surface the specific failing bullet. Never return success with a partially-valid manifest or an unclean package.
