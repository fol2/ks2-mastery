# `create-lean-zip` README

## Purpose

`scripts/create-lean-zip.mjs` generates a **lean code review ZIP** from tracked Git files without changing repository history.

The default behaviour is now framed around review payload, not release evidence:

- Include source, scripts, tests, fixtures, Worker code, shared modules, and repo config.
- Omit heavy visual assets, generated reports, validation output, and planning packs.
- Write a manifest explaining what was selected and omitted.

This keeps the archive small enough for code review while avoiding the old pattern where logs, screenshots, nested ZIPs, and release evidence dominated the package.

## Output location

By default, the ZIP is written to the **parent folder** of this repository:

- `../ks2-mastery-lean-MMDDHHMM.zip`

## Default profile

Default profile:

- `review`

The `review` profile uses an allowlist:

- root repo config and metadata (`package.json`, `package-lock.json`, `README.md`, `AGENTS.md`, Wrangler/Playwright config, etc.)
- `.github/**`
- `.githooks/**`
- `content/**`
- `legacy/**`
- `scripts/**`
- `shared/**`
- `skills/**`
- `src/**`
- `styles/**`
- `tests/**`
- `worker/**`

Default excludes still apply after profile selection:

- `assets/**`
- `worktrees/**`
- `.worktrees/**`
- `reports/**`
- `output/**`

The `review` allowlist does not select `docs/plans/**` by default. The broader `tracked` profile also excludes `docs/plans/**` because planning packs frequently contain logs, screenshots, nested ZIPs, and historical patch bundles.

Default mode:

- `omit` (excluded/out-of-profile files are not present in the ZIP)

Default size target:

- `< 25 MB`

## Quick start

From repository root:

```bash
node scripts/create-lean-zip.mjs
```

## CLI options

```bash
node scripts/create-lean-zip.mjs [options]
```

- `--output <path>`: Full output path for the ZIP.
- `--name <filename>`: Output filename in the parent folder.
- `--profile <review|tracked>`:
  - `review`: source, scripts, tests, fixtures, and repo config.
  - `tracked`: broader tracked-file snapshot, still excluding bulky artefacts.
- `--include <glob>`: Add an include glob to the `review` profile. The `tracked` profile already selects all tracked files before excludes.
- `--exclude <glob>`: Exclude glob (repeatable).
- `--mode <omit|placeholder|symlink>`:
  - `omit`: excluded files are not present in ZIP.
  - `placeholder`: excluded files are present as 0-byte files.
  - `symlink`: excluded files become symlinks to `.lean-omitted` (best-effort only).
- `--max-mb <number>`: Reporting threshold (default `25`).
- `--help`: Show usage help.

## Recommended mode for code review

Use `omit` (default).

Why:

- It keeps the archive focused on files reviewers normally inspect.
- It avoids thousands of empty placeholder entries.
- It avoids treating omitted screenshots/assets/evidence as part of the review payload.

Use `placeholder` only when the recipient needs to inspect omitted path topology.

## Testing expectations

The default `review` profile includes the test suite files and normal code fixtures, but it is not a full verification snapshot. Some historical gates read generated reports, release evidence, or planning documents that are omitted by design. Add exact paths back with `--include` when a reviewer needs those files for a specific test or audit.

## About symlink mode

`symlink` mode exists, but should be used cautiously:

- Symlink handling in ZIP extraction differs by OS and unzip tool.
- Some environments may materialise links differently or not preserve them at all.

If you need materialised omitted paths, prefer `placeholder` over `symlink`.

## How recipients should interpret a lean ZIP

A lean ZIP is **not** a production-complete asset package or release-evidence package.

It is a repository snapshot optimised for:

- code review,
- architecture discussion,
- development handover.

Excluded and out-of-profile content is intentional. Recipients should read:

- `LEAN_ZIP_MANIFEST.txt` in ZIP root.

The manifest lists:

- profile,
- mode,
- include globs,
- exclusion globs,
- counts of copied/omitted files,
- the omitted path list with reasons.

## Examples

Default lean ZIP:

```bash
node scripts/create-lean-zip.mjs
```

Lean ZIP with explicit filename:

```bash
node scripts/create-lean-zip.mjs --name ks2-dev-share.zip
```

Broader tracked-file snapshot:

```bash
node scripts/create-lean-zip.mjs --profile tracked
```

Review ZIP with selected docs added back:

```bash
node scripts/create-lean-zip.mjs --include "docs/operations/**"
```

Review ZIP excluding Playwright tests:

```bash
node scripts/create-lean-zip.mjs --exclude "tests/playwright/**"
```

Lean ZIP with placeholders:

```bash
node scripts/create-lean-zip.mjs --mode placeholder
```

## Scope and guarantees

The script:

- reads tracked files via `git ls-files`,
- applies the selected profile (`review` by default),
- applies default excludes for large assets, local worktree folders, generated validation artefacts, and planning packs,
- stages a temporary lean tree,
- creates a ZIP,
- cleans temporary files.

The script does **not**:

- modify tracked repository files,
- rewrite Git history,
- commit or push changes.
