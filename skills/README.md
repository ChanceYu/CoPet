# PetHover Skills

PetHover-specific skill packages. Each skill documents one slice of the PetHover **pet package format**: a Codex-compatible pet directory with a `pet.json` manifest, a sprite atlas, and optional PetHover-owned resources.

Today there is **one PetHover skill**, [`pethover`](./pethover/SKILL.md). It is the single orchestration entry point for generating a pet from an image or text input: it calls the upstream `$hatch-pet` skill for Codex sprites, then adds PetHover display translations, audio, and behavior metadata.

## Pet package layout

```
$HOME/.pethover/pets/<pet-id>/
├── pet.json
├── spritesheet.webp            # or spritesheet.png; Codex 8×9 atlas, 192×208 per cell
└── pethover/
    └── audio/                  # optional generated MP3 clips
        ├── click.mp3
        └── ...
```

`<pet-id>` is a kebab-case identifier unique within `$HOME/.pethover/pets/`. Built-in pets ship inside the app bundle using the same layout. The PetHover skill writes its final package only to `$HOME/.pethover/pets/<pet-id>/`; it does not write a second package under `$HOME/.codex/pets/`.

A minimal Codex-compatible `pet.json`:

```json
{
  "id": "example-pet",
  "displayName": "Example Pet",
  "description": "A compact Codex-compatible PetHover pet.",
  "spritesheetPath": "spritesheet.webp"
}
```

The `pethover` section is optional. A pet without PetHover-specific generated assets simply omits it.

A PetHover-extended `pet.json` keeps the Codex fields at the top level and puts all PetHover-only data under `pethover`:

```json
{
  "id": "example-pet",
  "displayName": "Example Pet",
  "description": "A compact Codex-compatible PetHover pet.",
  "spritesheetPath": "spritesheet.webp",
  "frameWidth": 192,
  "frameHeight": 208,
  "gridColumns": 8,
  "gridRows": 9,
  "pethover": {
    "schemaVersion": 1,
    "displayNameZh": "示例宠物",
    "descriptionZh": "一个兼容 Codex 的 PetHover 小宠物。",
    "audio": {
      "interactionSounds": {
        "click": "pethover/audio/click.mp3"
      },
      "agentSounds": {
        "thinking": "pethover/audio/hmm.mp3"
      }
    },
    "behaviors": {
      "stateRows": {
        "idle": { "row": 0, "frames": 6, "durationMs": 1100 }
      }
    }
  }
}
```

PetHover-side configuration lives under a single `pethover` top-level section in `pet.json`, written by the `pethover` skill.

`pethover.displayNameZh` is the Chinese translation of top-level `displayName`; `pethover.descriptionZh` is the Chinese translation of top-level `description`.

When a skill creates a package, it must write the Codex-required top-level fields. When it updates an existing package, it must preserve every unowned top-level field verbatim and only replace the `pethover` section unless it is filling missing Codex-required fields for a package it is creating.

## The skill

| Folder | `name` | `displayName` | Owns |
|---|---|---|---|
| [`pethover/`](./pethover/SKILL.md) | `pethover` | PetHover | The full pet-generation pipeline, the `pethover` section of `pet.json`, and the `pethover/` resource folder in the pet package. |

## Single-responsibility policy

The skill folder is **self-contained**. No file inside the skill folder may link to files outside its own folder. A pet author or runtime implementer only needs to read the skill for the domain they're working on; installing the skill in isolation must give them complete documentation for that slice of the format.

Outbound references may be **sibling-skill references** like `$hatch-pet` (resolved against installed skills) or **public URLs**. A sibling-skill reference must document a public-URL fallback so consumers can install the dependency if it isn't present locally — see the *Upstream skill* section of [`pethover/SKILL.md`](./pethover/SKILL.md) for an example.

The skill here is a documentation artifact — it describes the package format and the runtime contract, not executable code.
