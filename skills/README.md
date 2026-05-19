# PetHover Skills

PetHover-specific skill packages. Each skill documents one slice of the PetHover **pet package format** — a directory under `$HOME/.pethover/pets/<pet-id>/` that holds a `pet.json` manifest plus per-skill resource folders.

Today there is **one PetHover skill**, [`pethover`](./pethover/SKILL.md). It is the single orchestration entry point for generating a pet from an image or text input — it calls the upstream `$hatch-pet` skill for sprites/behavior, then generates matching audio.

## Pet package layout

```
$HOME/.pethover/pets/<pet-id>/
├── pet.json
├── spritesheet.png             # $hatch-pet output, PNG or WebP (8×9 atlas, 192×208 per cell)
└── pethover/
    └── audio/                  # generated MP3 clips
        ├── click.mp3
        └── ...
```

`<pet-id>` is a kebab-case identifier unique within `$HOME/.pethover/pets/`. Built-in pets ship inside the app bundle using the same layout.

A minimal `pet.json`:

```json
{
  "id": "example-pet",
  "name": "Example Pet",
  "version": "1.0.0",
  "pethover": {}
}
```

The `pethover` section is optional — a pet without generated assets simply omits it.

PetHover-side configuration lives under a single `pethover` top-level section in `pet.json`, written by the `pethover` skill. If more PetHover skills are added later, they coordinate within the same section.

When a skill writes to `pet.json`, it must only mutate its own top-level key and preserve every other field verbatim — sibling keys are off-limits.

## The skill

| Folder | `name` | `displayName` | Owns |
|---|---|---|---|
| [`pethover/`](./pethover/SKILL.md) | `pethover` | PetHover | The full pet-generation pipeline (image/text input → `$hatch-pet` → audio), the `pethover` section of `pet.json`, and the `pethover/` resource folder in the pet package. |

## Single-responsibility policy

The skill folder is **self-contained**. No file inside the skill folder may link to files outside its own folder. A pet author or runtime implementer only needs to read the skill for the domain they're working on; installing the skill in isolation must give them complete documentation for that slice of the format.

Outbound references may be **sibling-skill references** like `$hatch-pet` (resolved against installed skills) or **public URLs**. A sibling-skill reference must document a public-URL fallback so consumers can install the dependency if it isn't present locally — see the *Upstream skill* section of [`pethover/SKILL.md`](./pethover/SKILL.md) for an example.

The skill here is a documentation artifact — it describes the package format and the runtime contract, not executable code.
