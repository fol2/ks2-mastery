# `create-lean-zip` README

## Purpose

`scripts/create-lean-zip.mjs` generates a **lean development/share ZIP** from tracked Git files without changing repository history.

The default behaviour is designed for safe sharing:

- Keep repository structure visible.
- Exclude heavy asset payloads.
- Replace excluded files with **0-byte placeholders** so recipients can see what is intentionally omitted.

This helps reviewers understand what is not included, rather than assuming files are missing by mistake.

## Output location

By default, the ZIP is written to the **parent folder** of this repository:

- `../ks2-mastery-lean.zip`

## Default exclusion policy

Default exclude glob:

- `assets/**`

Default mode:

- `placeholder` (0-byte files for excluded paths)

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
- `--exclude <glob>`: Exclude glob (repeatable).
- `--mode <omit|placeholder|symlink>`:
  - `omit`: excluded files are not present in ZIP.
  - `placeholder`: excluded files are present as 0-byte files.
  - `symlink`: excluded files become symlinks to `.lean-omitted` (best-effort only).
- `--max-mb <number>`: Reporting threshold (default `100`).
- `--help`: Show usage help.

## Recommended mode for sharing

Use `placeholder` (default).

Why:

- It is cross-platform and archive-tool friendly.
- Recipients can inspect full paths and understand intentional exclusions.
- 0-byte files cannot be opened as real payloads, which signals omission clearly.

## About symlink mode

`symlink` mode exists, but should be used cautiously:

- Symlink handling in ZIP extraction differs by OS and unzip tool.
- Some environments may materialise links differently or not preserve them at all.

For predictable sharing outcomes, prefer `placeholder`.

## How recipients should interpret a lean ZIP

A lean ZIP is **not a production-complete asset package**.

It is a repository snapshot optimised for:

- code review,
- architecture discussion,
- development handover.

Excluded content is intentional. Recipients should read:

- `LEAN_ZIP_MANIFEST.txt` in ZIP root.

The manifest lists:

- mode,
- exclusion globs,
- counts of copied/omitted files,
- the full omitted path list.

## Examples

Default lean ZIP:

```bash
node scripts/create-lean-zip.mjs
```

Lean ZIP with explicit filename:

```bash
node scripts/create-lean-zip.mjs --name ks2-dev-share.zip
```

Lean ZIP excluding assets and Playwright screenshots:

```bash
node scripts/create-lean-zip.mjs --exclude "assets/**" --exclude "tests/playwright/**"
```

Lean ZIP with omission instead of placeholders:

```bash
node scripts/create-lean-zip.mjs --mode omit
```

## Scope and guarantees

The script:

- reads tracked files via `git ls-files`,
- stages a temporary lean tree,
- creates a ZIP,
- cleans temporary files.

The script does **not**:

- modify tracked repository files,
- rewrite Git history,
- commit or push changes.
