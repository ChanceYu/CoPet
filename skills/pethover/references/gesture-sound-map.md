# Gesture-Sound Role Map (Advisory)

Suggested sound roles per gesture. **Advisory, not binding** — pet packs may diverge for personality reasons, and universal sounds are optional.

| Gesture | Trigger summary | Suggested role | Notes |
|---|---|---|---|
| Single click | one click, brief hold | short "ping" / "bonk" | Friendly, low-amplitude. |
| Double-click (surprised) | two clicks within the double-click window | "huh?" / questioning tone | Pairs with the `questionMark` emotion overlay. |
| Rapid-click (petted) | multiple clicks in a short window | soft "purr" / giggle | Loopable or repeatable; respect cooldown. |
| Long-press (pettedSlow) | sustained pointer-down without movement | breathy "mmm" / contented sigh | Pairs with the `heart` overlay. |
| Drag-land | drop after sustained movement | "wheee!" / landing thud | One-shot. |
| Right-click context-menu open | contextmenu event on pet sprite | none (UI sound, optional) | Default: silent. |

Gesture detection signatures, cooldowns, and binding sprite mappings are owned by the PetHover runtime, not by this map. This file only suggests sound roles, never restates cooldown values or sprite-row identifiers.

For agent-state sounds (e.g., `thinking`, `failed`), no suggested mapping exists yet. When agent sounds become a feature, they get their own table here.
