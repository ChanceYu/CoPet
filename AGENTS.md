# PetHover Agent Guide

## Feature Module Development

Every new feature module follows the same workflow. Do not start coding on `main`.

### 1. Worktree-first

New feature modules must be developed in an isolated git worktree on a `feature/*` branch.

- Create a worktree with a `feature/<module-name>` branch before writing any code.
- Worktrees live under `.worktrees/` at the repository root (e.g. `.worktrees/virtual-pet-list/`). Do not place them under `.claude/worktrees/` or anywhere else.
- Use `EnterWorktree` to create the worktree and switch into it; do not hand-craft worktrees with raw `git worktree add` unless the harness is unavailable.
- One worktree per feature module. Do not reuse a worktree for an unrelated feature.
- Keep the worktree and its branch after the feature is merged. Do not delete or prune them.
- Bug fixes, doc updates, and small refactors that touch a single file may be made directly on `main` without a worktree.

### 2. Branch naming

- Feature branches: `feature/<kebab-case-module-name>` (e.g. `feature/virtual-pet-list`).
- The module name should describe the user-visible capability, not the implementation detail.
- Do not use `feat/`, `feature_`, `dev/`, or personal-name prefixes.

### 3. Code layout

- React components live **flat** under `src/components/`. Do not create per-feature subdirectories (e.g. `src/settings/`, `src/components/settings/`). The only allowed subdirectory is `src/components/ui/` for shadcn-style primitives.
- Group related components by **filename prefix**, not by folder. Example: `SettingsNav.tsx`, `SettingsPetsSection.tsx`, `SettingsAboutSection.tsx`.
- Window-level entry components (`PetWindow.tsx`, `SettingsWindow.tsx`) stay at `src/` top level. Auxiliary components they compose go flat into `src/components/`.
- Hooks go in `src/hooks/`, shared utilities in `src/lib/`, static assets in `src/assets/`.
- Asset placement follows the consumer, not the file type:
  - `src/assets/` — assets the frontend `import`s at build time and Vite processes (URL/hashing). Example: agent icon SVGs, `logo.png`.
  - `src-tauri/assets/` — content the Rust backend enumerates at runtime, ships through Tauri `bundle.resources`, and exposes to the webview via the `asset://` protocol (`convertFileSrc`).
  - Decision rule: if Rust lists it with `fs::read_dir`, or the frontend receives a filesystem path that must pass through `convertFileSrc`, the asset belongs under `src-tauri/assets/`. If the frontend imports it directly in TS/CSS, it belongs under `src/assets/`.
- Built-in pet packages live in `src-tauri/assets/pets/<pet-id>/` with `pet.json` + `spritesheet.{webp,png}`. They are discovered by `fs::read_dir` in `config_store.rs`, declared as `bundle.resources` and allowlisted under `assetProtocol.scope` (`$RESOURCE/assets/pets/**`) in `tauri.conf.json`, and share the same package format as user-imported pets under `~/.pethover/pets/`. Do not move built-in pets to `src/assets/`; doing so breaks runtime discovery, splits the built-in vs user-imported code paths, and forces a hardcoded manifest list.
- Rust source goes in `src-tauri/src/`; keep it production-only (no tests inline).

### 4. Tauri command boundary

- Frontend calls into Rust through Tauri commands; expose new Rust capability with a typed command and consume it from a hook in `src/hooks/`.
- Do not call `invoke` from inside presentational components — wrap it in a hook so tests can mock the Tauri layer with the shared harness.

### 5. Commit messages

Follow Conventional Commits with a scope matching the feature module:

```
<type>(<scope>): <imperative summary>
```

- `type`: `feat`, `fix`, `refactor`, `style`, `test`, `chore`, `docs`, `perf`.
- `scope`: feature module or surface area (e.g. `settings`, `window`, `pet`).
- Summary in the imperative mood, lowercase, no trailing period.
- Keep the subject short — under ~72 chars. If it doesn't fit, the commit is doing too much; split it.
- No body by default. Add one only when the *why* is non-obvious from the diff (hidden constraint, subtle interaction, workaround), and keep it brief — no multi-paragraph explanations.

Examples:

- `feat(settings): add SettingsAboutSection`
- `fix(settings): align section heading IDs with tabpanel aria-labelledby`
- `refactor(settings): compose window from sectioned shell`

### 6. Definition of done

A feature module is done only when **all** of the following hold:

- [ ] Branch is `feature/<module-name>` in a dedicated worktree.
- [ ] Components placed flat under `src/components/` with prefix-based grouping.
- [ ] Tauri commands wrapped in a hook, not invoked directly from components.
- [ ] Frontend behavior covered by Playwright specs in `src/tests/`.
- [ ] Rust behavior covered by Cargo integration tests in `src-tauri/tests/`.
- [ ] `pnpm test:frontend`, `pnpm test:rust`, `pnpm build`, and `cargo fmt --manifest-path src-tauri/Cargo.toml --check` all pass.
- [ ] Commit history follows Conventional Commits with module scope.

## Test Layout

Test files are split by runtime and must stay out of the repository-root `tests` directory.

- Frontend integration and end-to-end tests go in `src/tests`.
- Rust integration tests go in `src-tauri/tests`.
- Do not create or keep a repository-root `tests` directory.
- Rust test attributes such as `#[test]`, `#[cfg(test)]`, and `#[tokio::test]` are only allowed in `src-tauri/tests/*.rs`.
- Do not put Rust test modules or test functions in `src-tauri/src` or other non-test `.rs` files.

All Rust coverage should be written as Cargo integration tests under `src-tauri/tests`. Cargo discovers these files automatically, so do not add explicit `[[test]]` entries unless a test needs a non-standard path or name.

## Frontend Tests

Use Playwright for frontend integration and end-to-end coverage.

- Put Playwright specs in `src/tests/*.spec.ts`.
- Put shared Playwright harnesses or test helpers in `src/tests`.
- Use the shared Tauri mock harness pattern when testing UI flows that call Tauri commands or listen for Tauri events.
- Do not write tests for CSS styling or visual presentation details. Frontend tests should cover behavior, commands, state changes, and accessible UI contracts instead of class styling, computed CSS, layout geometry, shadows, borders, colors, transitions, or screenshots.
- Do not add Vitest, jsdom, or Testing Library tests for these integration workflows.

Run frontend tests with:

```sh
pnpm test:frontend
```

## Rust Tests

Use Cargo integration tests for cross-module Rust behavior.

- Put Rust integration tests in `src-tauri/tests/*.rs`.
- Keep Rust tests out of `src-tauri/src`; source `.rs` files should contain production code only.
- Prefer real filesystem and real HTTP boundaries where practical.

Run Rust tests with:

```sh
pnpm test:rust
```

Some Rust integration tests bind local TCP ports. If a sandbox blocks local networking with `Operation not permitted`, rerun `pnpm test:rust` outside the sandbox.

## Verification

Match the test budget to the blast radius of the change. Run the **smallest closure** that can actually break — do not run the full suite for every tweak.

| Change scope | Required check |
|---|---|
| Style/CSS only, copy/i18n string, single-file with no behavior change | `pnpm build` only — skip the spec suite |
| One component or one hook | That file's spec only: `pnpm test:frontend src/tests/<name>.spec.ts` |
| One Rust module or one command | That module's Cargo test only: `cargo test --manifest-path src-tauri/Cargo.toml --test <name>` |
| Major feature module, shared infrastructure (test harness, app state, runtime, hooks consumed across components), or a DoD claim | Full suites: `pnpm test:frontend`, `pnpm test:rust`, `pnpm build`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check` |

Running the full Playwright matrix for a CSS tweak is wasted budget. Pick the narrowest command that exercises the changed surface; escalate to full suites only when crossing a feature-module boundary or shipping work.
