# Content Operations Centre

The Content Operations Centre is the operator-facing management surface for English Spelling editorial work. It replaces the legacy Spelling Settings import/publish card for live content changes and gives operators one package workflow for words, sentence entries, pools, reward tracks, hero exposure, monster image references, audio generation, approval, publish, revert, and rollback.

The current platform role exposes edit and approval controls to the same admin user. The underlying capability contract is already split into view, edit, approve, publish, and rollback so future role separation can be added without changing the package or release data model.

Audio assets must be generated from TTS. The admin workflow does not support uploading audio files.

## Operator Goals

Use this runbook to:

- add, change, retire, or remove spelling words
- manage word-family variants for Extra words
- add or change sentence entries and word lists
- add or change spelling pools
- attach one or more reward tracks or monsters to a pool
- generate missing or overridden word and sentence audio through TTS
- upload source monster image assets for package-scoped review
- approve, publish, revert, or roll back a release

## Roles And Capabilities

Capability keys:

- `content_operations.view`
- `content_operations.edit`
- `content_operations.approve`
- `content_operations.publish`
- `content_operations.rollback`

Current admins can use all of them. Do not merge these concepts in code or documentation: future role setup may allow one user to edit while another approves or publishes. Approval and publish are part of the same package workflow; there is no separate approval system for audio, pools, or monster references.

## Data Model

The core tables are:

- `content_operation_packages` - draft editorial package metadata, base release identity, state, approver, publisher, and supersession links
- `content_operation_package_operations` - ordered package operations against content entities
- `content_operation_package_candidates` - rebuilt candidate snapshot and validation, audio, asset, reward, visibility, and conflict scans
- `content_operation_releases` - immutable published global spelling releases, release proof, rollback links, and snapshot hashes
- `content_operation_approvals` - approval history
- `content_operation_events` - operator event history
- `content_operation_audio_jobs` - TTS generation jobs and outcomes
- `content_operation_asset_uploads` - package-scoped monster image upload metadata
- `content_operation_account_overrides` - scoped override records

The route prefix is `/api/admin/content-operations`. The current subject id is `spelling`.

## Package Lifecycle

Package states:

- `draft`
- `ready_for_approval`
- `approved`
- `published`
- `rejected`
- `blocked`
- `reverted`
- `superseded`

Normal flow:

1. Create a package from the current published release.
2. Add ordered operations.
3. Rebuild the package candidate.
4. Review validation, audio, asset, reward, visibility, and conflict scans.
5. Generate missing TTS audio and upload any required monster image sources.
6. Mark the package ready for approval.
7. Approve the package.
8. Publish the package into a new immutable global release.
9. Confirm release proof and production visibility.

Any package edit after approval invalidates approval. Explicit audio override generation also invalidates approval because it changes package readiness.

## Editable Entities

Supported entity families include:

- `spelling.word`
- `spelling.sentenceEntry`
- `spelling.wordList`
- `spelling.pool`
- `spelling.rewardTrack`
- `spelling.heroExposure`
- `spelling.audioRequirementProfile`
- `spelling.monsterAssetReference`

Supported operation actions include create, upsert, replace, set, remove, and retire. Use the narrowest action that matches the operator intent so revert and diff output stay readable.

## Add Or Change A Word

1. Create or open a draft package.
2. Add a `spelling.word` operation with the slug, word text, family, list id, spelling pool, year groups, tags, accepted spellings, explanation, sentence references, provenance, and sort index.
3. Add or update the linked `spelling.sentenceEntry` rows in the same package.
4. Rebuild the candidate.
5. Resolve validation blockers before approval.
6. Generate missing audio through the package `generate-audio` action.
7. Approve and publish after scans are clear.

Extra words can include word-family variants. A variant supplies its own dictated word, accepted spellings, learner-facing explanation, and sentence references, but it does not publish as a separate runtime word. Edit variants as part of the parent word so the candidate scan can validate the combined word, sentence, and audio requirements.

Core statutory variants stay as their existing separate word rows to preserve English Spelling parity.

## Add Or Change A Pool

1. Add or update the `spelling.pool` operation.
2. Attach or change `spelling.wordList` membership as needed.
3. Attach reward tracks through `spelling.rewardTrack`.
4. Set hero exposure through `spelling.heroExposure` when a reward track should be visible, hidden, scheduled, or rollout-flagged on specific surfaces.
5. Rebuild the candidate and review reward and visibility scans.

Do not assume one pool exactly equals one monster. A pool can have zero, one, or many reward tracks, and each reward track can choose its own monster id, exposure state, surfaces, stage behaviour, and asset references.

## Generate Audio

Use package action `generate-audio`.

Default profiles:

- word audio: `male.natural` and `female.natural`
- sentence audio: `male.normal`, `male.slow`, `female.normal`, and `female.slow`

Generation is package-scoped. The action builds the latest candidate, scans missing or stale audio requirements, generates buffered spelling audio through TTS, stores the result in R2, and records provenance in `content_operation_audio_jobs`.

Operational limits:

- default limit: 5 items
- maximum limit: 25 items
- account-level rate limit: 4 actions per minute
- override generation requires an override reason and invalidates package approval

Audio upload is not supported. If audio is missing or wrong, regenerate it through TTS and R2 storage.

## Upload Monster Image Assets

Use package action `upload-monster-asset` for source monster image assets.

Accepted source images:

- JPEG
- PNG
- WebP

Limits:

- maximum file size: 4 MiB
- minimum dimension: 96 px
- maximum dimension: 4096 px
- maximum aspect ratio: 4:1
- account-level rate limit: 12 uploads per 10 minutes

Uploads are stored in R2 under `content-operations/packages` and are package-scoped until published. A private no-store preview route lets admins review the candidate asset. The image is not learner-visible until a package publishes the matching `spelling.monsterAssetReference`.

Fallback behaviour stays defensive: missing, expired, malformed, or unpublished asset references fall back to bundled monster visuals.

## Approve And Publish

Before approval:

- candidate validation has no blockers
- required word and sentence audio is generated or intentionally scoped out
- monster image asset scans pass
- reward and visibility scans match the intended pool and hero exposure
- conflict scan is empty or deliberately resolved

Approval records the package readiness state. Publish creates a new immutable row in `content_operation_releases` and makes that global spelling release the source for learner runtime, admin hubs, content-quality signals, and the compatibility export route.

Package and release list endpoints are compact. They do not inline full snapshots, raw proof blobs, large conflict arrays, or strict audio item arrays. Fetch a full release snapshot only from the dedicated snapshot endpoint.

## Recovery

Use package revert when the desired repair is "undo this package with a new package". Revert builds inverse operations where the data model supports it, keeps the audit trail explicit, and publishes a new release after approval.

Use release rollback when the desired repair is "move production back to a prior immutable release". Rollback records `rollback_of_release_id` and release proof so the production history remains understandable.

`spelling.monsterAssetReference` is metadata for scan and runtime reference resolution. It is not always invertible in the same way as structural spelling content, so review asset references manually during revert.

## Operational Limits

Body caps:

- package metadata: 32 KiB
- package operations and conflict resolution: 256 KiB
- package actions: 128 KiB
- release proof and rollback: 64 KiB

Rate limits:

- `generate-audio`: 4 actions per account per minute
- `upload-monster-asset`: 12 actions per account per 10 minutes

Security and privacy:

- list endpoints stay compact by default
- account ids are masked in admin safe-copy output
- learner and child identifiers are stripped from hub payloads
- asset upload rate limits run before the multipart body is read
- audio generation rate limits run before any TTS provider call

## Verification

For a full editorial release, operators should prove:

- the package operation list describes the intended word, pool, audio, and monster changes
- candidate validation is clear
- audio scan is clear or deliberately scoped
- asset scan is clear
- reward and visibility scans match the intended hero exposure
- approval was recorded after the final edit
- publish produced a new release id and snapshot hash
- learner runtime resolves the new global release
- rollback or revert instructions are known before production publish
