---
name: copet-gen
description: Use when generating a custom pet for the CoPet app from a concept, image, brand, mascot, or visual prompt, and the finished hatch-pet package must be installed into $HOME/.copet/pets with collision-safe pet ids.
---

# CoPet Gen

## Overview

Create one CoPet pet package under `$HOME/.copet/pets/<pet-id>/` by delegating pet generation to `$hatch-pet`, then copying the finished package into CoPet's app config directory.

This Skill does not generate sprites, assemble atlases, run visual QA, or repair pet rows directly. `$hatch-pet` owns the full pet generation workflow.

Using `$copet-gen` is explicit permission to use the subagents and lightweight workers required by `$hatch-pet`. Do not downgrade to main-session sequential generation solely because `$hatch-pet` delegates visual jobs.

**Codex only.** `copet-gen` delegates pet generation to `$hatch-pet`, which in turn delegates image generation to `$imagegen`. `$imagegen`'s default path is Codex's built-in `image_gen` tool, so this Skill must run inside Codex. Claude Code, Cursor, and other agents do not ship the required tool and are not supported.

## Required Dependency

`$copet-gen` requires `$hatch-pet` (source: <https://github.com/openai/skills/tree/main/skills/.curated/hatch-pet>). The workflow installs `$hatch-pet` automatically when it is missing from the active agent's skill directory — see Workflow step 1. Do not substitute direct `$imagegen` calls, local image scripts, hand-authored sprites, or partial pet package generation.

If the local agent framework requires explicit user permission before spawning subagents, treat a user request to use `$copet-gen` as that permission for `$hatch-pet` pet-generation workers, visual QA workers, and brand-discovery workers.

## Package Layout

```text
$HOME/.copet/
└── pets/
    └── <pet-id>/
        ├── pet.json
        └── spritesheet.webp
```

If `<pet-id>` already exists under `$HOME/.copet/pets/`, append `-2`, `-3`, and continue until the destination is unique. The copied package's `pet.json.id` must exactly match the installed directory name.

## Workflow

1. Ensure `$hatch-pet` is available in the active agent. If it is not registered, install it:

```bash
npx skills add openai/skills --skill hatch-pet
```

   After installation, reload the agent so `$hatch-pet` becomes invocable, then continue.

2. Use `$hatch-pet` to complete the user's pet request.
   - Wait for `$hatch-pet` to finish validation, visual QA, repair if needed, and packaging.
   - The expected source package is usually `${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/` (this path is `$hatch-pet`'s output directory and is independent of which agent invoked it).
   - If the source package path is unclear, read the hatch run's `qa/run-summary.json` and use its `package` field.

3. Install the completed package into CoPet:

```bash
python skills/copet-gen/scripts/install-copet-pet.py \
  --source-pet-dir "${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>"
```

By default the installer writes to `${COPET_CONFIG_DIR:-$HOME/.copet}/pets`. If the user supplies a different CoPet config directory, pass it explicitly:

```bash
python skills/copet-gen/scripts/install-copet-pet.py \
  --source-pet-dir /absolute/path/to/source-pet \
  --copet-config-dir /absolute/path/to/.copet
```

4. Verify the installed package:

```bash
INSTALLED_DIR=/absolute/path/from/installer-output
test -f "$INSTALLED_DIR/pet.json"
test -f "$INSTALLED_DIR/spritesheet.webp"
test "$(basename "$INSTALLED_DIR")" = "$(jq -r '.id' "$INSTALLED_DIR/pet.json")"
```

5. Report `installed_pet_id` and `installed_pet_dir`. If `collision=true`, mention the assigned suffix.

## Rules

- Auto-install `$hatch-pet` when missing instead of stopping — only halt if `npx skills add` itself fails.
- Always complete `$hatch-pet` before installing into CoPet.
- Allow `$hatch-pet` to spawn its normal subagents and lightweight workers.
- Copy from the `$hatch-pet` package; do not move or mutate the source package.
- Use `scripts/install-copet-pet.py` for installation instead of ad hoc copy commands.
- Keep the installed directory name and copied `pet.json.id` identical.
