# Spelling content model

This pass moves English Spelling content out of long-lived code blobs and into a small versioned content domain.

It keeps two rules explicit:

1. operators edit a **draft** bundle
2. the learner runtime only reads a **published release snapshot**

That means content operations can grow later without pulling publishing logic into the spelling engine or letting live draft edits leak into active sessions.

## Scope

This model currently covers:

- word lists
- words
- sentence entries and sentence variants
- spelling pool metadata (`core` or `extra`)
- year-group metadata
- tags
- source notes and provenance
- draft vs published state
- release versions and publication pointers

It does **not** try to become a general CMS.
It is only the minimum versioned content layer needed to stop treating spelling content as permanent code.

## Domain model

The persisted subject-content bundle is:

```txt
{
  modelVersion,
  subjectId,
  draft,
  releases,
  publication
}
```

### Draft

There is one active draft for the spelling subject.

```txt
{
  id,
  state: 'draft',
  version,
  title,
  notes,
  sourceNote,
  provenance,
  createdAt,
  updatedAt,
  wordLists,
  words,
  sentences
}
```

The draft is the editable operator-facing source.
It may change over time.
It is validated before import and before publish.

### Word lists

```txt
{
  id,
  title,
  spellingPool,
  yearGroups,
  tags,
  wordSlugs,
  sourceNote,
  provenance,
  sortIndex
}
```

Word lists are the authoring/grouping boundary.
They keep pool and year-group metadata explicit and give future operator tooling a stable unit smaller than “all spelling content”.
`spellingPool` defaults to `core` for legacy bundles. `core` lists must keep year-group metadata; `extra` lists may have an empty `yearGroups` array because they are expansion material rather than statutory Years 3-6 content.

### Words

```txt
{
  slug,
  word,
  family,
  listId,
  spellingPool,
  yearGroups,
  tags,
  accepted,
  variants,
  explanation,
  sentenceEntryIds,
  sourceNote,
  provenance,
  sortIndex
}
```

`sentenceEntryIds` point at sentence rows rather than embedding long sentence arrays directly in the word row.
That keeps sentence banks versionable and easier to validate.

`explanation` is a required, short, learner-facing meaning note shown in the word bank explainer.
Legacy bundles that pre-date this field are backfilled from the canonical seeded word list when the slug already exists there.

`spellingPool` is inherited from the word list if omitted. Existing version-one content without pool metadata therefore remains `core` by default.
Extra words publish with runtime `year: 'extra'`, `yearLabel: 'Extra'`, and no statutory year groups.

Extra words may define `variants` for opt-in word-family practice. A variant supplies its own dictated word, accepted spellings, learner-facing explanation, and sentence references, but it does not publish as a separate runtime word. The learner still secures the base Extra word slug. Core words must continue to model statutory variants as their existing separate word rows, preserving the original KS2 parity.

In the Content Operations Centre this is edited as part of the parent word. Operators should add, change, or retire word-family variants in the same package operation set as the base word so validation can scan the combined word, sentence, and audio requirements before approval.

### Sentence entries / variants

```txt
{
  id,
  wordSlug,
  text,
  variantLabel,
  tags,
  sourceNote,
  provenance,
  sortIndex
}
```

A word can point at one or more sentence entries.
The published runtime snapshot later collapses those back into the legacy runtime shape the preserved spelling engine expects.

### Releases

A published release is immutable.

```txt
{
  id,
  state: 'published',
  version,
  title,
  notes,
  sourceDraftId,
  sourceNote,
  provenance,
  publishedAt,
  snapshot
}
```

Each release stores a generated runtime snapshot.
That is deliberate.
The runtime should not rebuild itself from live draft rows at session start.

### Publication pointer

```txt
{
  currentReleaseId,
  publishedVersion,
  updatedAt
}
```

The publication pointer decides what the learner runtime reads.
The runtime does not infer “latest” from the draft.
It follows the current published release.

## Draft vs published behaviour

### Draft rules

- Draft rows are editable.
- Draft rows can be imported/exported.
- Draft rows must validate before publish.
- Draft rows are not used by the learner runtime just because they exist.

### Publish rules

- Publishing validates the full bundle first.
- Publishing generates a new immutable runtime snapshot from the current draft.
- Publishing appends a new release with the next integer version.
- Publishing moves the publication pointer to that new release.
- Publishing does not mutate older releases.

### Runtime rules

- `createSpellingService()` can now receive a `contentSnapshot`.
- The main shell rebuilds the spelling service from `spellingContent.getRuntimeSnapshot()`.
- `getRuntimeSnapshot()` resolves published content only. If an account is still on an older published seed release, the runtime supplements missing words from the bundled current seed release while preserving the account's own published words.
- If an explicit word is requested and it does not exist in the published snapshot, session start now fails cleanly instead of silently falling back to a different round.

That last rule matters for safety: content-pinning should not quietly drift into a different session than the caller asked for.

## Runtime snapshot shape

Published releases store a compact runtime snapshot compatible with the preserved spelling engine.

```txt
{
  generatedAt,
  words,
  wordBySlug
}
```

Each runtime word includes the legacy engine fields the existing spelling PoC already expects, including sentence arrays and family-word groupings.
Runtime words also include `spellingPool`. Current values are:

- `core` for statutory Years 3-6 spelling content
- `extra` for expansion spelling content outside the statutory pools

The legacy `all` spelling filter is still accepted by the service, but it aliases to `core`. Extra content has to be requested explicitly through the `extra` filter and is excluded from SATs Test mode.

Extra word-family variants are runtime prompts only. They are used when an Extra session opts in to word-family variants, while aggregate totals, secure counts, reward progress, and word-bank rows stay keyed to the base Extra word.

This keeps the subject engine deterministic and unchanged in its core pedagogy while letting content-management logic live outside it.

## Schema and backend support

A new Worker/D1 table stores account-scoped subject content bundles.

### `account_subject_content`

```txt
account_id
subject_id
content_json
updated_at
updated_by_account_id
```

Pre-cutover use:

- `subject_id = 'spelling'`
- account-scoped draft/release content storage
- content writes protected by the same account revision / idempotency mutation policy already introduced in Pass 9

Compatibility Worker routes:

- `GET /api/content/spelling`
- `PUT /api/content/spelling`

After the first published global content operations release exists, `account_subject_content` is no longer the effective production spelling content source. Learner runtime, admin hubs, content-quality signals, and the legacy export route resolve the published global release first. `account_subject_content` remains only as a pre-cutover fallback and as diagnostic legacy storage.

The compatibility route state after cutover is:

- `GET /api/content/spelling` is retained for export and diagnostics. It returns the current global release bundle and a `compatibility` block with the release id, snapshot hash, and `legacyWriteDisabled: true`.
- `PUT /api/content/spelling` is disabled once a published global release exists. It returns `409 subject_content_legacy_write_cutover` with the release id, snapshot hash, published time, and the required mutation path.
- New learner-visible spelling content changes must go through content operations packages, approval, and publish into immutable global releases.

The seed helper `scripts/migrate-spelling-content-to-global-release.mjs` generates first-release-only SQL. Re-running it against an environment that already has a published spelling global release is a no-op; local or remote dry-runs report the detected release and the post-cutover compatibility policy.

## Content Operations packages and global releases

Current production editorial work uses the Content Operations Centre rather than the legacy Spelling Settings import/publish card.

Primary tables:

- `content_operation_packages` hold draft editorial intent, approval state, base release identity, and publish metadata.
- `content_operation_package_operations` hold ordered changes to words, sentence entries, word lists, pools, reward tracks, hero exposure, audio requirement profiles, and monster asset references.
- `content_operation_package_candidates` hold rebuilt candidate snapshots plus validation, audio, asset, reward, visibility, and conflict scan results.
- `content_operation_releases` hold immutable global spelling snapshots, release proof, rollback links, and publication history.

Package states are `draft`, `ready_for_approval`, `approved`, `published`, `rejected`, `blocked`, `reverted`, and `superseded`. A package can be edited and approved by the same current admin role, but the capability contract is already split into view, edit, approve, publish, and rollback so future role separation does not require a data-model change.

Publishing a package creates a new immutable global release. Learner runtime, admin hubs, content-quality signals, and the compatibility export endpoint resolve that release first. Direct mutation of the old account-scoped spelling bundle is intentionally blocked after cutover.

One pool can have zero, one, or many reward tracks. A reward track chooses its monster id, exposure state, surfaces, stage behaviour, and related asset references. Do not model the data as exactly one pool equals exactly one monster.

## Repository and service boundary

The content layer is deliberately separate from the subject engine.

### Local repository

`createLocalSpellingContentRepository()`

- stores the content bundle in local storage
- falls back to the seeded bundle if no stored content exists

### API repository

`createApiSpellingContentRepository()`

- hydrates from `/api/content/spelling`
- writes with account-scoped mutation metadata only before global-release cutover
- tracks the current account revision for replay-safe writes

Accounts with no stored spelling content receive the current seeded bundle, including the Extra expansion, on first read before cutover.
Accounts that already have stored account-scoped content are not silently overwritten by newer seeds before cutover; operators should import/publish the updated bundle, or intentionally reset to seeded content after taking a backup.

After cutover, operators should not use this repository as an editorial publish surface. It is kept so older tools can hydrate/export the effective content, while the write path fails closed instead of bypassing package approval.

### Content service

`createSpellingContentService()` owns:

- reading and writing the content bundle
- validation
- runtime-snapshot resolution
- portable import/export
- publish
- reset-to-seeded
- summary generation for the thin operator UI

The spelling engine never owns draft/release rules.

## Import / export pipeline

Source-of-truth content file:

- `content/spelling.seed.json`

Generated runtime files:

- `src/subjects/spelling/data/content-data.js`
- `src/subjects/spelling/data/word-data.js`

Available scripts:

```bash
npm run content:seed
npm run content:validate
npm run content:generate
npm run content:export
npm run content:import -- <input.json> [output.json]
```

### Pipeline intent

- `content:seed`
  - builds the initial content bundle from the preserved legacy vendor files
- `content:validate`
  - checks the seed bundle directly
- `content:generate`
  - compiles the published snapshot into runtime modules
- `content:export`
  - writes a portable content export from the source bundle
- `content:import`
  - validates a portable payload before writing it back to the source bundle

The generated runtime data is therefore downstream from the published snapshot, not the authoring surface itself.

## Validation rules now enforced

Validation currently catches:

- duplicate words
- malformed word entries
- malformed sentence entries
- missing year-group metadata on lists and words
- core/extra pool mismatches between lists, draft words, and published runtime words
- missing or cross-linked sentence references
- invalid publish states
- duplicate release ids or versions
- broken publication pointers

Those checks run in both the content service and the Worker route.

## Content Operations Centre management surface

The operator-facing management surface is now the Content Operations Centre at `/api/admin/content-operations` and the corresponding admin UI.

Current hooks:

- create, list, inspect, edit, approve, publish, revert, and roll back spelling content packages
- add, change, retire, or remove words, word-family variants, sentence entries, word lists, pools, reward tracks, hero exposure, and monster asset references
- rebuild package candidates and view validation, audio, asset, reward, visibility, and conflict scan summaries
- generate package-scoped TTS audio into R2 for missing or explicitly overridden word and sentence variants
- upload package-scoped monster image assets, attach them through asset-reference operations, and publish only after scan validation passes
- view compact release history and retrieve a full release snapshot only through the dedicated snapshot endpoint

The UI exposes edit and approval actions to the same current platform admin role. The underlying capability keys remain split so a future role model can separate editors, approvers, publishers, and rollback operators without changing package or release records.

## Seeded legacy baseline

The initial spelling content bundle was seeded from:

- `legacy/vendor/word-list.js`
- `legacy/vendor/word-meta.js`
- `legacy/vendor/sentence-bank-*.js`

That means the content model starts from the same preserved English Spelling material already used by the rebuilt PoC.
This pass changes the storage and publication shape, not the underlying spelling curriculum.

## Remaining deltas / limitations

The current model is intentionally scoped:

- only English Spelling content is modelled through Content Operations packages today
- package `rebase` and explicit `scan-audio` routes are reserved and return `501` until their implementation lands
- direct file/local development mode still uses the local content repository; signed-in production runtime uses the global release path
- production proof automation and close-out gates are documented separately from the content model

The repo now has a manageable content boundary with explicit package, approval, publish, release, revert, and rollback rules, while the learner runtime stays deterministic and pinned to immutable published snapshots.
