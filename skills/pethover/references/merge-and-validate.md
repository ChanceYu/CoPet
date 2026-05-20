# Merge manifest fragments, validate, and atomically promote the package

**Read this when:** you have at least one in-memory manifest fragment from step 3 (sprite / audio / omni) and need to write the final `pet.json`, verify it, and promote it into the live package location.

This reference covers step 4 (merge + staging-directory reconciliation) and step 5 (validate the merged manifest + atomic promotion) in detail.

## Staging-directory invariant (load-bearing)

Throughout steps 4 and 5, all reads and writes target the **staging directory** at `<staging-dir> = $HOME/.pethover/tmp/pet-<unix-epoch>-<pet-id>/`, created at the start of step 3. The live package at `$HOME/.pethover/pets/<pet-id>/` is **never touched** between the start of step 3 and the atomic promotion at the end of step 5. Reading "the base manifest" means reading `<staging-dir>/pet.json` (which was seeded with the live package's contents at step 3 start for existing-package updates, or starts empty for new packages). Writing the merged manifest means writing `<staging-dir>/pet.json`. Reconciliation enumerates `<staging-dir>`, not the live location. Validation reads `<staging-dir>`.

This invariant guarantees that **any failure between the start of step 3 and the end of step 5 leaves the live package exactly as it was** — partial sprite generation, a failed audio batch, a missing omni frame, an invalid manifest, or a crash mid-pipeline can never corrupt an existing pet, and a brand-new pet never appears half-baked in the live directory.

## Fragment ownership matrix

A fragment must touch only the keys it owns. Overlapping writes are a generation error.

| Sub-task | Owns |
|---|---|
| sprite | top-level `id`, `displayName`, `description`, `spritesheetPath`, `frameWidth`, `frameHeight`, `gridColumns`, `gridRows`; `pethover.schemaVersion`, `pethover.behaviors.stateRows` |
| audio | `pethover.audio` |
| omni | `pethover.omni`, `pethover.eyes`, `pethover.behaviors.omniStateRows` |

**Merge-step-owned keys (not produced by any sub-task):**

- `pethover.displayNameZh` and `pethover.descriptionZh` are derived by the merge step itself (sub-step 6 below) from the merged English `displayName` / `description`. No sub-task fragment may carry these.

## Step 4 — merge algorithm

Apply in this exact order. All paths are relative to `<staging-dir>` unless stated otherwise.

1. **Read base.** If `<staging-dir>/pet.json` exists (the live package was seeded into staging at step 3 start), parse it. Otherwise start with an empty object `{}`. Treat any unrecognized top-level keys as opaque and preserve them verbatim — other ecosystems may share this manifest.
2. **Apply sprite fragment (if produced).** Replace the top-level Codex-compatible fields (`id`, `displayName`, `description`, `spritesheetPath`, `frameWidth`, `frameHeight`, `gridColumns`, `gridRows`). Set `pethover.schemaVersion` and `pethover.behaviors.stateRows` from the fragment. Do **not** touch any other key under `pethover`, including the Chinese display siblings — those are derived in sub-step 6 below.
3. **Apply audio fragment (if produced).** Replace `pethover.audio` wholesale with the fragment's audio object. Drop any orphaned `pethover.audio.*` keys not present in the fragment.
4. **Apply omni fragment (if produced).** Set `pethover.omni`, `pethover.eyes`, and `pethover.behaviors.omniStateRows`. Do **not** disturb `pethover.behaviors.stateRows` (sprite's territory) — the merge writes to a sibling key only.
5. **Preserve unowned keys.** Any key under `pethover` that no fragment claims (e.g. user-edited extensions) must be carried over from the base unchanged.
6. **Derive Chinese display strings.** This is the only translation pass in the whole pipeline. After all fragments have been applied, the in-memory document carries the final English `displayName` and `description`. Compute the Chinese siblings:

   - **For `pethover.displayNameZh`**: if the base manifest already had a `displayNameZh` *and* the merged English `displayName` is byte-identical to the base's English `displayName`, **preserve** the base's `displayNameZh` unchanged. Otherwise, translate the merged English `displayName` into Chinese (≤ 24 chars, preserving tone — playful / warm / regal / etc., a translation not a retelling) and set `pethover.displayNameZh`.
   - **For `pethover.descriptionZh`**: same logic against `description` (≤ 140 chars).

   This preserve-vs-retranslate rule means: an existing pet whose user re-runs only audio or omni keeps its previously-translated Chinese siblings untouched. A user who re-runs sprite with a tweaked English name triggers a fresh translation. A brand-new pet always gets a fresh translation. Translation failures (translator API error, empty output, length-budget overflow that cannot be tightened) abort the merge — leave the staging dir for debugging and surface the error.

7. **Write atomically inside the staging directory.** Write the merged document to `<staging-dir>/pet.json.tmp`, then rename to `<staging-dir>/pet.json`. The temp filename stays inside the staging dir so a crash can't leave the live package directory in a half-written state — staging is the unit of atomicity for the whole run, not just the single file.
8. **Reconcile the staging directory.** Described below. Note this operates on `<staging-dir>`, not the live location.

## Step 4 sub-step 8 — staging-directory reconciliation

Sweep `<staging-dir>` and remove every file or sub-directory that the final `pet.json` does not reference. This is mandatory; the package must not ship stale or scratch artifacts. Note this operates on the **staging directory** — the live `$HOME/.pethover/pets/<pet-id>/` is still untouched.

### Build the keep-set first

Enumerate every path referenced by the final manifest, relative to `<staging-dir>`:

- `pet.json` itself
- The file at top-level `spritesheetPath` (resolved relative to `<staging-dir>`)
- Every file referenced by `pethover.audio.interactionSounds.*` and `pethover.audio.agentSounds.*`
- The file at `pethover.omni.spritesheetPath`, if `pethover.omni` is present
- The file at `pethover.eyes.spritesheetPath`, if `pethover.eyes` is present

### Apply these deletion rules (all paths inside `<staging-dir>`)

- **Staging root**: keep only `pet.json`, the file at `spritesheetPath`, and the `pethover/` directory. Delete every other regular file at the root, including stale spritesheets from the seeded base in a different format (e.g. an orphaned `spritesheet.webp` when the new manifest says `"spritesheetPath": "spritesheet.png"`). Delete `<staging-dir>/.hatch-run/` and `<staging-dir>/.hatch-codex/` if they exist — those are `$hatch-pet`'s scratch (run-dir + redirected `CODEX_HOME`) used by the sprite sub-task and are not part of the shipped package. Leave other unknown sub-directories alone — they may belong to a different ecosystem sharing the package via the live package that was seeded into staging — but do delete any sub-directory **this skill created** during the current run (such as a preview directory at the root).
- **Inside `pethover/`**: this sub-directory is exclusively owned by this skill. Delete **every** file and sub-directory inside it that is not in the keep-set. This explicitly includes scratch / QA / preview directories like `pethover/qa/`, `pethover/staging/`, `pethover/preview/`, `pethover/source/`; intermediate per-direction frames like `pethover/omni-src/n.png`; backup files like `pethover/omni-spritesheet.webp.bak`; and any audio clip the seeded base contained that the current manifest no longer references (e.g. if the seeded base had `pettedSlow` audio but this run drops it, `pethover/audio/sigh.mp3` must be deleted).
- **Empty directories**: after deletions, remove any now-empty sub-directory (`pethover/audio/` is dropped if no audio clip remains; `pethover/` is kept only if it still contains at least one file).
- **Temp files**: delete any leftover `*.tmp`, `*.swp`, `.DS_Store`, or rename-target temp files (including the `pet.json.tmp` from the atomic write in sub-step 7 if rename did not consume it).

Reconciliation runs **only after** the atomic `pet.json` write in sub-step 7 succeeds. A reconciliation failure is a generation error: surface it. The live package is still safe — only the staging directory is affected, and the run will not promote.

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

## Step 5 — validate, then atomically promote

Run all checks on **`<staging-dir>/pet.json` and the on-disk artifacts under `<staging-dir>` together** — not on individual fragments, and not on the live package. Validation is the final gate before the staging-to-live swap; a failure here is a generation failure, not a warning. The live `$HOME/.pethover/pets/<pet-id>/` is read-only until the swap at the end of this step.

**Always run validation, even when only one sub-task ran.** Re-running just audio on an existing pet still validates the full merged document (in staging), because a stale or corrupted seeded base can invalidate the new fragment.

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

### Package cleanliness (the staging directory contains exactly what the manifest references — no more, no less)

- At `<staging-dir>` root, the only regular files are `pet.json` and the file named by top-level `spritesheetPath`. Any other regular file (a stale `spritesheet.webp` from the seeded base when the manifest now says `.png`, a leftover `pet.json.bak`, etc.) is a cleanliness failure.
- At `<staging-dir>` root, no sub-directories exist beyond `pethover/` and (when relevant) directories owned by other ecosystems that came in via the seed copy. The skill **must not** create any scratch / preview / QA directory at the root. Specifically, `.hatch-run/` and `.hatch-codex/` (both used by sprite sub-task during this run) must have been deleted by step 4 sub-step 8.
- Inside `<staging-dir>/pethover/`, the only files are those referenced by `pethover.audio.*`, `pethover.omni.spritesheetPath`, and `pethover.eyes.spritesheetPath`. The only sub-directory is `pethover/audio/`, and it exists only when at least one audio clip is referenced.
- No directories named `qa`, `staging`, `preview`, `source`, `omni-src`, or any other intermediate-artifact name exist anywhere under `<staging-dir>`. No files end in `.tmp`, `.bak`, `.swp`, or contain `.DS_Store`.
- Every file the keep-set (defined in step 4 sub-step 8) references actually exists in `<staging-dir>`, and every file present in `<staging-dir>/pethover/` is in the keep-set. This is a bijection; either side missing is a cleanliness failure.

If any check fails, treat the run as failed and surface the specific failing bullet. **Do not promote on validation failure.** Leave `<staging-dir>` intact for debugging; the live `$HOME/.pethover/pets/<pet-id>/` remains untouched.

## Atomic promotion (only after validation passes)

Once validation has passed against `<staging-dir>`, swap it into the live location. The protocol below is correct on POSIX filesystems and handles both creation and replacement.

Let `<live-dir> = $HOME/.pethover/pets/<pet-id>/` and `<backup-dir> = $HOME/.pethover/tmp/pet-<unix-epoch>-<pet-id>.replaced/` (using the same timestamp/pet-id as the staging directory).

**Case A — new package (live dir does not exist):**

1. Ensure the parent `$HOME/.pethover/pets/` exists (create if missing).
2. `rename(<staging-dir>, <live-dir>)`. This is a single atomic rename on POSIX: the package either becomes visible at its final location, or the rename fails and the staging dir stays put.
3. On rename failure, surface the error. The staging directory is still at its original path; the live location was never created.

**Case B — existing package (live dir already exists from before this run):**

1. `rename(<live-dir>, <backup-dir>)` — moves the previous live package aside atomically. If this rename fails, abort: the live package is still in place, the staging dir is still in staging, no damage.
2. `rename(<staging-dir>, <live-dir>)` — moves the new package into place atomically. **If this second rename fails**, attempt to roll back by running `rename(<backup-dir>, <live-dir>)` to restore the previous package. Surface a loud error pointing at both `<backup-dir>` and `<staging-dir>` regardless — the operator may need to recover manually.
3. On success, delete `<backup-dir>` recursively. This delete is not part of atomicity; failure here only leaks the backup directory under `$HOME/.pethover/tmp/`, which the user can clean up later.

After a successful promotion:

- `<staging-dir>` no longer exists at its original path — it has become `<live-dir>`.
- `<backup-dir>` (if it was created) no longer exists.
- The live package directory contains exactly the keep-set, and is the only on-disk surface presenting this `<pet-id>`.

On promotion failure (rare; usually means the filesystem rejected a rename due to cross-device staging or stale handles), surface the error with both `<staging-dir>` and `<backup-dir>` paths so the operator can finish the promotion or restore the prior package manually. **Do not attempt to "fix" the situation by copying file-by-file** — that breaks the atomicity guarantee and is exactly what the staging-directory mechanism exists to prevent.

> **Cross-device note.** For the renames in Case A and Case B to be atomic, `<staging-dir>` and `<live-dir>` must live on the **same filesystem**. The staging path `$HOME/.pethover/tmp/...` and the live path `$HOME/.pethover/pets/...` share `$HOME/.pethover/` as a common ancestor, which on virtually all standard setups means they share a filesystem. If the operator has manually mounted a different filesystem at one of those subpaths, rename will fall back to copy-and-delete, defeating atomicity — document this as a known operator-controlled limitation, not something the skill papers over.
