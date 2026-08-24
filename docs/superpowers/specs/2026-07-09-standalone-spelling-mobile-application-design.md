# Standalone Spelling Mobile Application Design

- **Date:** 9 July 2026
- **Status:** Design approved; Monster Camp revision amendment approved on 10 July 2026
- **Source product:** `ks2-mastery`
- **Target platforms:** iOS, iPadOS and Android
- **Delivery approach:** Capacitor-first standalone application

## 1. Executive summary

Create a standalone, local-first mobile application from the existing
`ks2-mastery` Spelling product. The application keeps the proven Spelling
pedagogy, learner flows, Word Bank, advanced practice modes and child-facing
Monster system, while removing the multi-subject web shell, account login,
Cloudflare-authoritative practice runtime, Admin Hub and Content Operations
Centre.

Spelling training is the product. Monsters are a motivational presentation of
real spelling mastery, not a second learning engine. Parent surfaces report the
child's spelling progress and settings; monster progress appears only in the
child experience.

After a learner completes Full KS2, the child experience continues through a
spelling-only Monster Camp revision loop. Guardian remains the scheduling and
marking authority. Monster Camp is a cosmetic projection of completed, eligible
revision missions; it cannot schedule words, change mastery or alter an earned
Monster stage.

The initial application is free and contains a meaningful Year 3 Starter
experience. A parent can buy a one-time `Full KS2` non-consumable product to
unlock the complete statutory Years 3-6 catalogue. The existing Extra catalogue
and Vellhorn do not belong to Full KS2; they form a future independent pack.
Every future paid pack has its own stable content namespace, reward track and
monster, and can never dilute progress earned in an earlier pack.

Normal learning is entirely local. Network access is required only for a store
purchase, purchase restoration, entitlement refresh, or initial pack download.
The durable learner store is SQLite, downloaded content is stored in the app's
private filesystem, and paid packs are delivered as signed data-only archives
from private object storage.

## 2. Product principles

1. **Spelling mastery is authoritative.** Answer history and word mastery drive
   every recommendation, statistic and monster transition.
2. **Monsters motivate; they do not redefine progress.** A monster is a child-
   facing projection of secured items in a named reward track.
3. **Local means operationally local.** Installed content, audio, progress and
   parent reporting work without a server.
4. **Children never enter a commercial flow.** Prices, purchasing, restoration
   and downloads exist only behind the Parent gate.
5. **A purchase expands the experience without resetting it.** Starter progress
   and the child's Inklet continue into Full KS2 unchanged.
6. **Content additions cannot cause emotional regression.** Pack revisions and
   new packs cannot reduce an earned monster stage.
7. **The free experience is real.** Starter provides a complete learning loop,
   useful progress and visible monster growth; it is not a paywall preview.
8. **Data collection is minimised by design.** Child profiles, progress and
   settings are not sent to or stored by the product operator. If the parent
   enables platform backup, Apple or Google processes the backed-up database
   under the device account.
9. **Revision is scheduled, bounded and pressure-free.** Guardian remains the
   scheduling and marking authority with the exact `[3, 7, 14, 30, 60, 90]`
   day schedule. The first eligible first-patrol, due or wobbling mission on an
   uncredited canonical Guardian day advances a non-spendable cosmetic Camp
   high-water by exactly one. Later same-day or ineligible completions advance
   it by zero. When no eligible work remains, the application shows the next
   review date and creates no reward-bearing work.
10. **Camp progress cannot be farmed or lost.** There are no per-answer rewards,
    coins, shops, random prizes, streak loss, missed-day penalties or repeated
    same-day Camp advancement.

## 3. Goals

- Publish one polished application on iPhone, iPad, Android phones and Android
  tablets.
- Reuse the existing React interface and pure JavaScript Spelling engine, then
  adapt them for mobile interaction rather than redesigning the product from
  scratch.
- Preserve English Spelling parity for all retained learner behaviours.
- Support a parent-managed device with multiple independent child profiles.
- Give children a calm reason to return after Full KS2 through one bounded,
  spelling-led revision mission when Guardian work is genuinely ready.
- Preserve all current child-facing Spelling functionality:
  - Smart Practice;
  - Trouble Words;
  - Spelling Test;
  - direct Word Bank drills;
  - Guardian;
  - Boss Dictation;
  - Pattern Quest;
  - achievements, summaries and session resume;
  - spelling monsters, Codex views and celebrations.
- Preserve current learning behaviour without treating every current content
  catalogue as part of Full KS2. The 1,215-item secure-extension catalogue and
  other non-statutory/11+ material remain preserved source work for future
  independent packs and do not ship in v1.
- Provide a spelling-only Parent area with learner switching, progress,
  sessions, settings, child management and pack management.
- Provide store-compliant non-consumable purchases and reliable restore,
  refund and redownload behaviour.
- Keep Starter small enough for a low-friction store install and keep paid pack
  delivery inexpensive at scale.

## 4. Non-goals

The first public release does not include:

- a `ks2-mastery` account or any other application account;
- cloud progress sync;
- cross-platform progress transfer;
- manual progress export or import;
- transfer of an Apple purchase to Google Play, or the reverse;
- Admin Hub, Content Operations Centre or authoring tools;
- Grammar, Punctuation, Reading, Arithmetic or Reasoning;
- the existing cross-subject Hero Mode, Hero Camp, Hero Quests, Hero Coins or
  Hero economy; the spelling-only Monster Camp defined here is a separate local
  projection;
- a Camp shop, spendable currency, per-answer rewards, random rewards, streak
  loss or missed-day penalties;
- advertising, third-party analytics, behavioural tracking or social features;
- executable code delivered in a content pack;
- a shared npm package or monorepo introduced before an observed need;
- a promise of Apple or Google family-account purchase sharing.

## 5. Platform decision

### 5.1 Capacitor-first

Capacitor is the default because the current product already has a substantial
React UI, a JavaScript domain engine and strong browser-oriented regression
coverage. Capacitor packages the compiled web application in maintained iOS and
Android native projects and provides native bridges for SQLite, billing,
filesystem, biometrics and lifecycle events.

Capacitor does not convert the UI into SwiftUI or Jetpack Compose. The learner
surface remains a local React application rendered in the platform WebView.
Production builds bundle the application code; they never point at the live
`ks2-mastery` website.

### 5.2 Native alternatives

- SwiftUI does not run on Android. Swift can compile for Android, but that does
  not provide the Apple SwiftUI framework.
- Separate SwiftUI and Jetpack Compose clients would duplicate UI, billing,
  storage and regression work and would require rewriting the current domain
  integration.
- React Native is the explicit fallback because it can retain the JavaScript
  domain engine, although the React DOM UI would still need to be rewritten
  with native components.

### 5.3 Capacitor proof gate

Before committing the whole extraction to Capacitor, a bounded native vertical
slice must prove on real iOS and Android devices:

- one complete Starter spelling round;
- bundled local audio;
- one durable SQLite progress write and resume;
- one sandbox non-consumable purchase, restore and redownload;
- VoiceOver and TalkBack operation;
- software-keyboard behaviour;
- cold start, background/resume and audio interruption behaviour;
- the agreed performance budgets in section 18.

Capacitor passes if these behaviours meet the same learner contract and visual
quality on both platforms. React Native is considered only when evidence shows
a WebView ceiling that cannot be removed without disproportionate platform-
specific work.

## 6. Repository strategy

The mobile product is not maintained as a permanent Git branch.

### 6.1 Stage one: bounded extraction in `ks2-mastery`

Use a short-lived branch and worktree in the existing repository to establish
portable boundaries while all existing parity tests are available. This stage
extracts or isolates:

- the pure Spelling engine and service contracts;
- Spelling content and reward-track contracts;
- a spelling-only Monster projection;
- a spelling-only Parent read model;
- the multi-learner repository contract;
- pack manifest and entitlement contracts.

Before extraction, record the exact source commit and reconcile relevant
unmerged Spelling work. Non-statutory work such as Extra or 11+ content is
preserved for later packs but is not allowed to enter the Full KS2 statutory
denominator accidentally.

No native product is released from this branch.

### 6.2 Stage two: standalone mobile repository

After the portable boundary passes parity tests, create a separate repository
for the mobile product. It owns:

- the mobile React composition root;
- the extracted Spelling and Monster modules;
- Capacitor configuration;
- committed `ios/` and `android/` projects;
- SQLite, billing, filesystem and biometric adapters;
- pack build, signing and delivery tools;
- mobile test and release workflows.

The mobile repository has an independent store-release lifecycle. Core fixes
are intentionally backported between web and mobile when relevant. A published
shared package is introduced only if repeated dual maintenance demonstrates a
real need.

### 6.3 Why not a monorepo

Converting `ks2-mastery` into a monorepo would preserve exact code sharing but
would keep the mobile release coupled to unrelated subjects, Cloudflare Worker,
D1, R2 operations and a large cross-subject CI suite. That conflicts with the
goal of a smaller, independently releasable application.

## 7. Current extraction seams

The existing codebase already contains useful boundaries:

- `shared/spelling/service.js` and `shared/spelling/legacy-engine.js` contain
  the reusable learning engine.
- `src/subjects/spelling/service-contract.js`, `events.js` and `read-model.js`
  define learner state and projections.
- `src/subjects/spelling/repository.js` maps Spelling state onto a generic
  repository contract.
- `src/platform/core/repositories/local.js` proves the multi-learner local
  shape, although its `localStorage` implementation is not used in production
  mobile.
- `src/platform/app/create-local-app-controller.js` demonstrates local
  composition, but its Punctuation registration must not be carried into the
  standalone application.
- `src/platform/game/mastery/spelling.js` contains the Spelling Monster kernel,
  but its cross-subject imports and combined summaries must be removed from the
  mobile boundary.
- `src/surfaces/hubs/ParentHubSurface.jsx` and the existing parent read model
  are multi-subject and Worker-driven. The mobile application builds a new
  spelling-only parent model rather than copying this surface intact.

Production `ks2-mastery` is Worker-authoritative and has disabled local mode.
The mobile application therefore composes the shared engine with a new local
runtime; it does not wrap the current production bundle unchanged.

## 8. Architecture

```text
React mobile UI
  ├── Child shell
  └── Parent shell
        │
Mobile application services
  ├── learner/profile service
  ├── spelling session service
  ├── parent progress service
  ├── pack catalogue service
  └── purchase/download coordinator
        │
Pure domain
  ├── Spelling engine and contracts
  ├── Spelling content model
  ├── Spelling-only Monster projection
  └── pack/entitlement state machines
        │
Ports and native adapters
  ├── SQLite repositories
  ├── app-private filesystem
  ├── StoreKit 2
  ├── Google Play Billing
  ├── LocalAuthentication / Android biometrics
  └── entitlement gateway and private R2
```

### 8.1 Domain ownership

| Unit | Responsibility | Dependencies |
|---|---|---|
| Spelling domain | Select, present, mark and schedule words; calculate mastery | Pack content snapshot, clock, randomness port |
| Monster projection | Turn secured pack items into child-facing stage and next milestone | Spelling mastery, reward-track definition |
| Revision mission projection | Expose one eligible first-patrol, due or wobbling Guardian mission and the next review date | Guardian schedule, pack content, canonical Guardian day |
| Monster Camp projection | Ratchet a pack-scoped cosmetic high-water after an eligible completed mission | Guardian mission-completed event, learner/pack Camp state |
| Parent progress model | Derive secure, due, trouble, accuracy and session summaries | Spelling state and sessions only |
| Pack catalogue | Describe installed, available and entitled packs | Signed manifests, entitlement state |
| Purchase coordinator | Drive store purchase and restoration state | Store adapter, entitlement gateway |
| Download coordinator | Resume, verify and atomically activate pack versions | Filesystem, gateway, pack verifier |
| Learner repositories | Persist independent state for each child | SQLite transaction boundary |

The Parent progress model has no dependency on the Monster or Monster Camp
projections. The Monster and Monster Camp projections have no authority to
mutate Spelling mastery. Camp progress is not a second mastery scale: Monster
stages remain projections of secured spelling items only.

The canonical Guardian day is the integer day produced by the injected clock
using the existing Guardian day contract and is shared by scheduling and
mission eligibility. Daily Camp credit uses exactly
`(learnerId, packId, canonicalGuardianDay)`; Hero date keys and server claims
are not reused.

### 8.2 Mobile command Unit of Work

The mobile application introduces a `SpellingCommandUnitOfWork`. For each
learner command it:

1. opens one SQLite transaction and reads the expected learner revision;
2. runs the engine without repository side effects to produce next subject and
   session state;
3. projects domain events, spelling-only Monster transitions and any eligible
   Monster Camp high-water transition as pure data;
4. validates the full mutation plan;
5. writes subject state, item progress, session, events, Monster state and Camp
   state;
6. increments the learner revision and commits once;
7. emits transient UI/audio effects only after commit.

The existing sequential repository writes and event-subscriber side effects are
not reused as the mobile commit boundary. A revision mismatch retries from a
fresh snapshot rather than partially applying a command.

## 9. Pack and content model

### 9.1 Product catalogue

| Internal pack/tier | Learner content | Child monster | Store entitlement |
|---|---|---|---|
| `ks2-core:starter` | Curated 20-item lower-entry subset of the Years 3-4 statutory list | Inklet through thresholds 1 and 10; threshold 30 is unreachable | None; bundled |
| `ks2-core:full` | All 213 current statutory-core Years 3-6 items | Inklet, Glimmerbug and Phaeton | `full-ks2` non-consumable |
| `extra-vocabulary` | Repackaged Extra catalogue | Vellhorn | Independent future non-consumable |
| `secure-vocabulary` | Current secure-extension/11+ source material, repackaged and quality-gated | A new pack-specific monster | Independent future product; not in v1 |
| Future pack | Namespaced words, prompts and audio | Pack-specific monster | Pack-specific non-consumable |

Starter and Full KS2 share the `ks2-core` namespace. A Starter item retains the
same identity after Full KS2 is installed, so purchase requires no progress
conversion. The signed Starter manifest freezes the exact 20 item IDs. Starter
is complete when all 20 items are secure. Current Inklet thresholds make the
first and second visible milestones available at 1 and 10 secure items, while
the third threshold at 30 is naturally unreachable; there is no artificial
runtime level cap.

The Full KS2 Inklet reward track and milestone thresholds are fixed from the
first release and are also used by Starter. Buying Full KS2 therefore adds
available items without rebasing Inklet or changing its next milestone. The
child surface reports absolute secured items and distance to the next growth
milestone rather than presenting a misleading percentage of unowned content.

Starter includes five-card Smart Practice and Spelling Test rounds, Trouble
Words when at least five due/trouble items exist, direct Word Bank drills,
summaries, local audio and Inklet celebrations. Full KS2 restores the existing
round-length choices. Guardian, Boss and Pattern Quest require the Full KS2
entitlement as well as their existing mastery prerequisites.

Starter and Full KS2 share one `ks2-core` Camp identity. Buying Full KS2 cannot
create, convert or reset a second Camp record. All `ks2-core` Guardian revision
and Camp access requires the `full-ks2` entitlement as well as the existing
mastery prerequisites; Starter neither exposes nor advances Camp. A future pack
requires its own pack entitlement and owns an independent Camp record keyed by
its permanent `packId`, so its monster and cosmetic progress cannot overwrite
`ks2-core` history.

### 9.2 Stable identity

- Every pack has a permanent `packId`.
- Every learning item has a permanent identifier within its pack.
- Durable and runtime item identity is `packId:itemId`; raw word slug is display
  and lookup metadata only.
- The engine, progress maps, events, sessions and Monster projections all carry
  the composite runtime identity. Legacy slugs migrate to their taxonomy-owned
  pack, for example `ks2-core:accommodate`.
- V1 pack validation rejects the same normalised spelling target appearing in
  two simultaneously active packs. Cross-pack shared mastery is not inferred.
- Every monster route has a permanent `rewardTrackId`.
- Apple and Google product identifiers map to an internal `entitlementId`; they
  are never used as learning-state keys.
- Correcting text, audio or metadata without changing the learning target does
  not change item identity. A different spelling target or pedagogic unit must
  receive a new item ID.
- Removing an item from an active catalogue does not delete its historical
  progress.
- A published reward track cannot gain a larger denominator or harder
  thresholds through an ordinary pack revision. A genuine content expansion
  uses a new pack or reward track.

### 9.3 Signed manifest

Each pack version has a signed manifest containing:

- pack ID and semantic content version;
- content schema version;
- minimum compatible application and schema versions;
- required internal entitlement IDs;
- item inventory and stable IDs;
- reward tracks, monster identity and milestone thresholds;
- archive names, byte sizes and SHA-256 digests;
- total installed and temporary-space requirements;
- release timestamp and signing-key identifier.

Monster definitions in the manifest are namespaced and declarative. They
contain stable ID, stage names, copy, colours, asset references, reward-track
thresholds and optional aggregate source tracks. Extraction replaces the
current hard-coded roster and year-band router with this generic schema. The
binary provides an allow-listed renderer and effect templates; a monster that
needs a new rendering behaviour requires an application update.

The release system signs the manifest with an offline release key. The
application contains only the corresponding public verification keys.

### 9.4 Data-only rule

A downloadable pack may contain:

- spelling words, accepted answers, explanations and sentence prompts;
- declarative scheduling/content metadata already understood by the binary;
- audio;
- monster images and declarative visual configuration;
- reward tracks and thresholds;
- signed manifests and checksums.

A downloadable pack may not contain JavaScript, HTML, WASM, native libraries,
scripts, templates that execute as code, or a new exercise engine. A new
behaviour ships in a reviewed application update before any pack can reference
it.

Mobile packs are built from the compact published runtime snapshot. Editorial
draft history, Content Operations records and generated JavaScript source
materialisations are build inputs only and never ship as learner pack content.

### 9.5 Offline audio contract

V1 ships the two approved bundled British-English voice profiles already
represented by production content: `Iapetus` and `Sulafat`. The mobile Parent
setting selects a bundled voice, not an OpenAI/Gemini/browser provider. For
every installed item and sentence prompt, the pack contains:

- word-only audio at natural pace for each voice;
- full dictation audio at normal pace for each voice;
- separately generated slow dictation audio for each voice.

Slow Replay does not alter playback rate. The manifest maps
`runtimeItemId + sentenceId + voiceId + pace + audioKind` to one exact asset
path and digest. Pack readiness fails closed if any required asset is absent.
Scored practice has no browser/native-TTS fallback because device voices would
change pronunciation and parity. A post-install corrupt asset causes the card
to be skipped safely and the pack to be marked for Parent repair.

## 10. Purchase, entitlement and download flow

### 10.1 Purchase boundary

The child experience never displays a price, Buy button, Restore action or
store sheet. It may show only neutral copy such as:

> More spelling adventures are available — ask a grown-up.

The Parent area, after PIN or biometric authentication, owns the catalogue,
prices, purchases, restoration, download status, storage management and pack
repair actions.

### 10.2 Purchase state flow

1. The Parent area requests localised product details from StoreKit or Google
   Play Billing.
2. The parent starts the native purchase flow.
3. Cancellation returns to the catalogue without an error state.
4. A pending transaction, including Apple Ask to Buy or Google pending payment,
   remains pending and grants no entitlement.
5. A completed transaction is verified locally and submitted to the receipt-
   only entitlement gateway.
6. The gateway verifies the signed Apple transaction or Google purchase token,
   maps it to the internal entitlement and returns short-lived download access.
7. The application durably records the verified entitlement and transaction-
   processing journal before finishing or acknowledging the transaction.
8. The Download coordinator installs the pack.

Unfinished transaction work is retried across app restarts. Google `PURCHASED`
transactions are acknowledged well inside the mandatory three-day window;
failure to acknowledge is a release-blocking error because Google may refund
and revoke the purchase.

Entitlements refresh on purchase updates, application launch/resume when a
network is available, entry to Parent Packs, explicit Restore, and application
update. Normal child practice never waits for a refresh.

The gateway receives no learner ID, learner name, progress, session or monster
state. Its operational data is limited to the store proof, product mapping,
request integrity and minimal fraud/rate-limit signals.

### 10.3 Pack download

- Starter content and audio are part of the application installation.
- Paid content is stored in private R2 as a small number of immutable archives,
  normally 25-75 MB each.
- The gateway returns a signed manifest and short-lived bearer URLs only after
  entitlement verification.
- R2 credentials never enter the application.
- Download jobs are resumable and persist chunk completion.
- Before any archive download, the app verifies manifest signature, schema,
  entitlement, minimum application/schema version, declared paths, file count
  and compressed/extracted size ceilings.
- Every archive is verified against its manifest digest before extraction.
- Extraction rejects absolute paths, `..` traversal, symlinks, hard links,
  unknown extensions, undeclared files, excessive file count and decompression
  beyond the signed ceiling.
- The previous valid pack remains active until activation completes.

Activation is a crash-safe two-phase switch:

1. download and extract into a versioned staging directory;
2. verify every declared file and write an activation marker containing the
   manifest digest;
3. atomically rename staging to an immutable installed-version directory;
4. in one SQLite transaction, register the ready version and flip the active
   pointer from the previous version;
5. on startup, reconcile orphan installed directories, incomplete staging
   directories and a missing active path; retain or roll back to the last
   verified version before child access.

A crash before the SQLite flip leaves the old version active and a removable
orphan. A crash after the flip is safe because the immutable installed path and
activation marker already exist.

Pack encryption is not treated as the security boundary. Store entitlement
controls authorised use; signatures and hashes protect integrity. This avoids
device-specific encryption complexity without weakening the learning-state
model.

### 10.4 Restore, refund and offline use

- Store restoration rebuilds app-wide entitlement state and redownloads missing
  packs.
- Apple and Google entitlements do not transfer between ecosystems.
- All local child profiles on a device share an app-wide entitlement.
- Once verified and installed, a non-consumable pack remains usable offline.
- Temporary store or gateway failure never locks installed content.
- The application refreshes entitlement state after reconnection.
- A reported refund or revocation removes access to paid content but never
  deletes learner progress, session history or earned-stage history.
- A permanently offline device can continue using its last verified install
  until the platform can report a changed entitlement.

## 11. Local data model

SQLite is the durable source for learner and application state. Existing JSON
service envelopes may remain inside versioned SQLite records where this
preserves parity; tables are normalised only where lifecycle, isolation or
querying requires it.

| Record | Scope | Key fields and purpose |
|---|---|---|
| App metadata | Device | schema version, onboarding state, selected learner |
| Learner | Per child | local UUID, nickname, year group, goal, colour, timestamps |
| Subject state | Per child | `spelling` UI/data envelope, state version |
| Item progress | Per child/item | `learnerId`, `packId:itemId`, mastery evidence |
| Practice session | Per child | active/completed state and summary |
| Domain event | Per child | required mastery/session transitions |
| Monster state | Per child/track | branch, earned-stage high-water, celebration acknowledgements |
| Camp state | Per child/pack | `packId`, monotonic `campHighWater`, `lastCreditedGuardianDay`, `lastCreditedEventId`, acknowledgements |
| Entitlement | App-wide | internal ID, store, state, last verification |
| Installed pack | App-wide | pack/version, manifest digest, active filesystem path |
| Download job | App-wide | pack/version, chunks, bytes, retry state |

### 11.1 Transaction boundary

An accepted spelling answer and all of its durable consequences commit in one
SQLite transaction:

```text
answer
  -> item mastery
  -> session state
  -> domain events
  -> monster high-water / celebration state
  -> eligible campHighWater ratchet
  -> commit
```

The same transaction records any branch, earned-stage high-water or celebration
state caused by a newly secured word. Monster stage remains derivable from
Spelling mastery and the stable reward track. A process kill can lose only the
unsubmitted text currently in the input control.

The Camp ratchet accepts only a completed first-patrol, due or wobbling Guardian
mission for the matching learner and entitled pack. Daily credit uniqueness is
exactly `(learnerId, packId, canonicalGuardianDay)`. `lastCreditedEventId` is
stored separately for replay and audit deduplication; the event ID is not part
of the daily uniqueness key.

For normalised non-negative `campHighWater`, the deterministic transition is:

```text
credit = eligible mission AND daily tuple not credited ? 1 : 0
next campHighWater = current campHighWater + credit
```

The first eligible completed mission on an uncredited day therefore increments
`campHighWater` by exactly one. Ineligible and later same-day completions
increment it by zero. A replay, double completion or resume cannot create a
second daily credit, and later writes can never lower the high-water.

### 11.2 Data minimisation

- Profiles use a nickname and year group; no date of birth or email is needed.
- Raw keystrokes are never retained.
- Item progress and lifetime aggregates are retained until the parent resets or
  deletes the learner.
- Detailed completed-session summaries are retained for 365 days and capped at
  the latest 500 per learner; older detail is compacted into lifetime
  aggregates.
- Projected domain events are capped at the latest 1,000 per learner after their
  durable progress/Monster consequences are committed.
- Pack requests never include child identifiers.
- No advertising identifier, location, contacts, camera or microphone access is
  requested.

### 11.3 Backup

- Platform backup is best-effort and works only on eligible devices where the
  parent has enabled iCloud or Android backup; it is not a guaranteed recovery
  service.
- The live database uses WAL. At completed-session, profile/security change and
  clean app-background checkpoints, SQLite's online backup API produces one
  consistent `backup.sqlite` snapshot after committed WAL state is checkpointed.
- Platform backup includes the consistent snapshot and Parent PIN verifier. It
  excludes the live database sidecars, downloaded archives, extracted audio and
  monster assets.
- The backed-up database has a hard 20 MB budget, below Android's 25 MB Auto
  Backup quota. Retention compaction runs before producing a snapshot that would
  exceed the budget.
- The application provides no manual export/import in the first release.
- Platform backup does not promise iOS-to-Android transfer.
- After device restore, the existing Parent PIN remains valid and biometrics
  must be enrolled again.
- Onboarding and the privacy policy state that Apple or Google processes the
  snapshot when platform backup is enabled; the product operator does not
  receive it.

## 12. Multi-child lifecycle

### 12.1 First run

The first launch is Parent-first:

1. Explain local-only storage and purchase ownership in plain language.
2. Create a Parent PIN.
3. Optionally enable platform biometrics.
4. Create one or more child profiles with nickname and year group.
5. Enter the profile picker and begin Starter.

Subsequent launches open the profile picker. The Parent area remains available
through a consistently placed locked control.

### 12.2 Isolation

- Learner IDs namespace subject state, item progress, sessions, domain events
  and Monster and Camp state.
- Switching learner stops current audio and flushes the active transaction.
- Each learner's active session remains independently resumable.
- Changing year group changes recommendations, not historical progress.
- Entitlements and installed packs are app-wide; mastery is learner-specific.
- Camp state is learner- and pack-specific. Starter and Full share the
  `ks2-core` record; another learner or future pack cannot read or mutate it.

### 12.3 Destructive actions

- `Reset progress` requires Parent authentication and two-step confirmation.
  It removes the selected child's learning, Monster and Camp state but
  preserves the profile, settings, entitlements and installed packs.
- `Delete child` requires Parent authentication and two-step confirmation. It
  cascades through that learner's state without affecting another learner.
- `Reset application` is the final recovery action and clearly states that all
  local child data will be removed while store purchases remain restorable.

## 13. Parent authentication

- The Parent PIN is never stored in plain text.
- A salted verifier is retained with the backed-up application state.
- Failed attempts use increasing local delays.
- Optional Face ID, Touch ID or Android biometric authentication unlocks the
  Parent area through Keychain/Keystore-protected native state.
- PIN remains the fallback when biometric authentication fails.
- Device-owner authentication may reset a forgotten Parent PIN.
- If neither PIN nor device-owner authentication is available, full local reset
  is the final recovery path.
- A successful Parent gate does not bypass native store purchase authentication.

## 14. Navigation and presentation

### 14.1 Child navigation

The approved navigation is a Monster-led home base with one dominant Spelling
action.

Phone navigation uses four child destinations:

- Home;
- Practise;
- Words;
- Monsters.

Tablet layouts adapt the same information architecture to wider navigation;
they do not create a second product. Phones are portrait-first. Tablets support
responsive portrait and landscape layouts.

The Child Home shows:

- the selected child's nickname and year group;
- the active installed-pack monster;
- the next genuine spelling-driven growth milestone;
- one primary `Continue spelling`, `Start practice` or, when eligible,
  `Today's revision mission` action;
- today's bounded practice progress;
- no price, pack shop or purchase call to action.

After Full KS2 graduation, Home offers `Today's revision mission` only for a
first patrol or when Guardian work is due or wobbling. If its completion is the
first eligible completion on an uncredited day, it ratchets the active pack's
Camp high-water by exactly one; later same-day completions add zero. If eligible
work remains after the daily Camp credit, Home shows `Camp complete for today`
and may offer unrewarded spelling revision with explicit copy that Camp cannot
advance again that day. Home shows `All rested` and the next review date only
when no first-patrol, due or wobbling work remains; it does not invent another
reward-bearing mission.

The Monsters destination shows only monsters from installed packs. It explains
growth through secure spelling items and may show current stage, secured count,
next threshold and earned forms. It does not show sad locked creatures, prices
or unowned product cards.

Monster Camp lives within the existing Home and Monsters information
architecture; it is not a fifth destination, catalogue or shop. Camp cosmetics
may acknowledge revision consistency, but cannot be labelled as Monster
mastery, bought, spent or reduced.

### 14.2 Starter completion

When the child completes the available Starter catalogue:

- celebrate the earned Inklet milestone;
- preserve every item and Monster achievement;
- return to useful review and Word Bank actions;
- use a neutral `ask a grown-up` message for further content;
- avoid countdowns, loss framing, guilt, repeated interruption or an automatic
  purchase sheet.

### 14.3 Parent area

The Parent area has four destinations:

- Progress;
- Children;
- Packs;
- Settings.

Progress shows secure, due and trouble words, spelling accuracy, recent
sessions and useful learning focus. It deliberately contains no Monster ratio,
stage, Camp high-water, Camp cosmetics or commercialised monster progress. It
may show Guardian due count, next review date and recent revision sessions as
spelling evidence only.

Children manages local profiles. Packs manages purchase, restoration,
downloads, repair and storage. Settings manages learner preferences, local
audio preferences, Parent security and destructive actions.

## 15. Offline and failure behaviour

### 15.1 Failure principles

1. Technical failure never automatically clears learner progress.
2. Installed verified content remains available offline.
3. Purchased, downloaded, installed and learner-progress states remain
   separate.
4. Child copy is calm and actionable; technical detail remains in Parent views.

### 15.2 Required outcomes

| Failure | Required outcome |
|---|---|
| Purchase cancelled | Return normally; no entitlement and no error alarm |
| Apple/Google purchase pending | Show pending in Parent Packs; do not unlock |
| Purchase succeeds, download fails | Preserve entitlement and resumable job; Starter remains usable |
| Archive hash/signature fails | Delete temporary archive; never activate it |
| Pack update fails | Continue using the previous verified version |
| Pack requires a newer app/schema | Do not activate; Parent Packs requests an app update |
| Storage is insufficient | Stop before download and show required space |
| Active audio is unreadable | Skip the affected card safely, preserve session and offer Parent repair |
| Store/gateway is offline | Keep installed content available; retry commerce later |
| Refund/revocation arrives | Lock paid content; retain learner history |
| SQLite migration fails | Restore the pre-migration snapshot and enter Parent recovery; never auto-reset |
| App is killed | Preserve every committed transaction and resumable session |

Pack activation follows:

```text
verify signed manifest and declared ceilings
  -> download/hash/extract in staging
  -> write verified activation marker
  -> atomic rename to immutable installed path
  -> transactionally flip SQLite active pointer
  -> startup reconciliation / old-version retirement
```

Before a schema migration, the app creates and verifies a SQLite online-backup
snapshot. The migration runs transactionally and must pass `integrity_check`
plus repository contract probes. Failure restores the verified snapshot,
preserves it from cleanup and opens a Parent-only recovery screen with Retry.
Full reset is offered only after explicit Parent confirmation and is never an
automatic response to repeated failure.

If a child session genuinely cannot continue, use neutral copy such as:

> This practice is resting safely. Ask a grown-up to check the spelling pack.

## 16. Privacy, child safety and store compliance

This is a child-facing educational product even if the final App Store category
is Education rather than Kids. Engineering therefore meets the stricter child-
directed baseline from the beginning.

### 16.1 Hard requirements

- No ads, third-party analytics or behavioural tracking.
- No unnecessary device permissions.
- No child profile, progress or product-defined persistent device identifier in
  pack-download requests. If platform integrity/attestation tokens are needed,
  they are verified transiently, documented in the DPIA and not retained as a
  learner/device profile.
- Gateway/CDN network metadata such as IP addresses is minimised, retained only
  when operationally necessary, and declared accurately rather than hidden
  behind a `Data Not Collected` claim.
- A public privacy policy describing local profiles, platform purchases,
  minimal gateway processing, deletion and retention.
- Accurate Apple App Privacy and Google Data Safety declarations.
- Parent-gated commerce and external links.
- Native Apple IAP and Google Play Billing for all digital unlocks.
- Restore, pending purchase, acknowledgement, refund and revocation handling.
- A meaningful Starter product that exceeds a repackaged website or thin demo.
- A machine-verifiable build audit rejecting executable content in packs.
- An asset-provenance and distribution-rights register for every audio file,
  word list, illustration, monster asset, icon and store screenshot.
- A Children’s Code data-protection impact assessment before public release.
- An SDK/plugin register showing why every native dependency is necessary and
  suitable for a child-directed service.

### 16.2 Store category gate

The formal Apple Kids Category choice is intentionally made at store-metadata
readiness, not during architecture. The application is designed towards the
stricter baseline, but compliance is not claimed until the release audits pass.
Public submission cannot proceed until the product owner records the category
and age-band decision. Google target-audience and Families declarations must
accurately cover the KS2 age range.

### 16.3 Review boundary

App Review notes must explain:

- that the application is a local bundled React/Capacitor product, not a remote
  website;
- how to complete Starter without a login;
- how the reviewer opens the Parent area;
- which IAP unlocks Full KS2;
- how to restore and download the pack;
- that downloaded archives contain data and assets only.

## 17. Accessibility

Release requires:

- complete VoiceOver and TalkBack navigation;
- meaningful labels, headings and focus order;
- correct live announcements for answer feedback and recoverable errors;
- minimum 44 pt iOS and 48 dp Android touch targets;
- completion of learner and Parent flows at 200% text scaling;
- Reduced Motion support for non-essential Monster animation;
- no reliance on colour alone for status or correctness;
- accessible replay, slow replay, loading and audio-failure controls;
- external-keyboard completion of a spelling round;
- no answer leakage introduced by accessibility labels.

## 18. Performance and size budgets

The v1 compatibility floor is iOS/iPadOS 15 and Android API 24, matching the
selected Capacitor 8 baseline. Minimum-OS launch and core-flow compatibility is
tested in simulator/emulator. Performance certification uses these physical
reference classes on their current supported OS:

- iPhone SE (2nd generation);
- iPad (9th generation);
- Google Pixel 6a;
- Samsung Galaxy Tab A9 with 4 GB RAM.

The exact OS/build identifiers are recorded in the release evidence. The proof
and release candidate must meet hard thresholds:

| Measure | Sample and hard threshold |
|---|---:|
| Cold start to interactive profile picker | p95 <= 2.0 s across 30 terminated-app launches |
| Local answer feedback | p95 <= 100 ms across 200 submissions |
| Local audio start | p95 <= 250 ms across 100 uncached player starts from local files |
| SQLite answer transaction | p95 <= 50 ms across 200 representative commits |
| Child navigation/celebration frames | >=95% at <=16.7 ms and >=99% at <=33.3 ms during a scripted five-minute run |
| Starter compressed store download | <=120 MB on the largest reference-device variant |
| Backed-up SQLite snapshot | <=20 MB after retention compaction |

Pack installation uses the signed manifest's exact compressed and extracted
sizes. The preflight requires free bytes for all remaining compressed chunks,
the full new extracted version, staging metadata and 10% filesystem overhead;
the previous active version remains in place for rollback until activation is
proved. A fixed percentage of pack size alone is not accepted as the estimate.

The Full KS2 pack's exact size is measured from final audio rather than guessed
from generated source files. Parent Packs shows download and installed sizes
before installation.

## 19. Test strategy

### 19.1 Automated layers

| Layer | Required coverage |
|---|---|
| Domain | Existing Spelling parity, marking, scheduling and session behaviour |
| Item identity | Legacy-slug migration, composite IDs and duplicate-target rejection |
| Unit of Work | Failure injection at every mutation step proves all-or-nothing commit |
| Advanced modes | Guardian, Boss, Pattern Quest, achievements and resume |
| Monster | Data-driven routing, stages, aggregate Phaeton, branch and non-regression |
| Revision and Camp | Exact `[3, 7, 14, 30, 60, 90]` Guardian schedule, first-patrol/due/wobbling eligibility, exact daily uniqueness tuple, deterministic `+1`/`+0` Camp ratchet, `Camp complete for today` versus rested next-date states and no Monster-stage mutation |
| Repository contract | Identical behaviours against memory and SQLite adapters |
| Pack | Schema, signature, hash, resume, two-phase activation, startup reconciliation, path traversal, symlink and decompression-bomb rejection |
| Audio | Exact item/sentence/voice/pace mapping and 100% readiness |
| Billing | Buy, cancel, pending, restore, acknowledgement, refund and revoke |
| React UI | Multi-child, Parent gate, navigation and Starter boundary |
| Migration/backup | Pre-migration restore, retention compaction, 20 MB budget and eligible-device restore |
| Boundary audit | No cross-subject imports and no executable pack content |

### 19.2 Device matrix

Validate at least:

- iPhone SE (2nd generation);
- one current mainstream iPhone;
- iPad (9th generation) in portrait and landscape;
- Google Pixel 6a;
- Samsung Galaxy Tab A9 with 4 GB RAM;
- VoiceOver on a physical Apple device;
- TalkBack on a physical Android device.

### 19.3 Critical end-to-end journeys

- Parent-first setup with two or more children.
- Complete Starter from fresh install while offline after installation.
- Switch children and prove state/session isolation.
- Kill and relaunch during a resumable session.
- Complete one eligible Full-KS2 Guardian mission offline, kill and resume at
  the completion boundary, and prove `campHighWater` advances exactly once.
- Finish the day's eligible mission and prove another same-day round cannot
  advance Camp state. If due work remains, show `Camp complete for today` and
  offer only explicitly unrewarded revision; once no eligible work remains,
  show `All rested` and the next review date.
- Complete independent revision missions for two children and for two pack IDs
  without crossing Guardian or Camp state.
- Buy Full KS2 in sandbox and install all chunks.
- Interrupt and resume the pack download.
- Restore after reinstall and redownload the pack.
- Handle Apple Ask to Buy and Google pending purchase through delayed
  completion.
- Handle refund/revocation without deleting learning history.
- Detect corrupt archive and retain the previous valid version.
- Reject install for low storage without partial activation.
- On eligible, backup-enabled test devices, restore the SQLite snapshot through
  platform device backup.
- Complete the full learner and Parent journeys with assistive technology.

## 20. Release sequence and gates

The release sequence is:

1. iOS TestFlight validation.
2. Android closed testing.
3. Resolve all platform-specific failures against one shared acceptance matrix.
4. Submit both public releases together.

Neither public release proceeds while the other platform has an open release-
blocking defect.

Public release requires all of the following evidence:

- domain, repository, pack, billing and UI suites green;
- extraction source commit and statutory/secure-extension/Extra allocation
  manifest recorded;
- exact release-candidate device journeys green;
- multi-child isolation proof;
- purchase, pending, restore, refund and redownload proof;
- interrupted-download, corruption, low-storage and rollback proof;
- VoiceOver and TalkBack proof;
- performance and initial-download budgets met;
- App Privacy, Data Safety, privacy policy and Children’s Code DPIA completed;
- third-party SDK/plugin audit completed;
- asset-provenance and distribution-rights audit completed;
- executable-pack-content audit at zero findings;
- offline-audio readiness at 100% for every required item/voice/pace/kind;
- Apple and Google review metadata accurately describes free and paid content.

## 21. Operations and cost boundary

The application requires object storage and a very small entitlement gateway,
not an always-on conventional application server.

Recommended production shape:

```text
StoreKit / Play Billing
  -> receipt-only Cloudflare Worker
  -> short-lived authorised URLs
  -> private R2 immutable pack archives
```

At prices verified on 9 July 2026:

- R2 Standard includes 10 GB-month storage, 10 million Class B reads and free
  Internet egress each month.
- Storage above the free allocation is USD 0.015 per GB-month and Class B reads
  are USD 0.36 per million.
- A paid Workers plan starts at USD 5 per month when free limits are no longer
  suitable.
- Apple Developer Program membership is USD 99 per year.
- Google Play registration is a one-time USD 25.
- Qualifying small-developer store programmes can make the platform transaction
  charge approximately 15%; current programme eligibility must be confirmed
  before pricing the product.

For illustration, a 400 MB Full KS2 pack split into eight archive requests
would generate at least 80,000 archive reads for 10,000 complete downloads,
plus manifest, HEAD/range, retry, repair and version-check traffic. This lower
bound remains far below the verified 10-million-read Standard allowance and has
no R2 egress charge. Store commission, content production and product support
are materially larger costs than pack bandwidth at early scale.

Cost controls:

- use a handful of archives, never thousands of per-audio downloads;
- retain immutable versions only while they are supported;
- set Worker CPU and request limits;
- separate production and test buckets;
- log no learner data and minimise receipt-gateway retention;
- use only aggregate Worker/R2 counters for storage, request outcomes and pack-
  level download demand; v1 sends no client analytics or adoption events.

## 22. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Capacitor cannot meet native quality | Bounded real-device proof; React Native fallback before full build |
| Worker-authoritative web logic is copied accidentally | Extract shared domain and characterise parity before creating mobile repo |
| Cross-subject Monster code expands scope | Create spelling-only projection and boundary audit |
| Parent Hub drags in other subjects/auth roles | Build spelling-only local Parent model and surface |
| WebView storage is evicted | Native SQLite plus backed-up database and transactional migrations |
| Legacy global slugs collide across packs | Composite runtime IDs everywhere; reject duplicate active targets in v1 |
| Mobile answer writes remain multi-step | Pure command plan plus one SQLite Unit of Work |
| File activation and DB pointer diverge | Immutable installed paths, activation markers and startup reconciliation |
| Future monster needs hard-coded app changes | Generic namespaced monster/reward schema with allow-listed renderers |
| Pack changes reduce a child's monster | Stable item IDs and earned-stage high-water |
| A pack revision dilutes a published denominator | Freeze public reward tracks; ship expansion as a new track/pack |
| Revision rewards become a grind or second economy | Only eligible Guardian missions ratchet a non-spendable once-per-day Camp high-water; rested days create no reward-bearing work |
| Camp cosmetics are mistaken for mastery | Keep Monster stages spelling-derived and persist Camp state separately by learner and pack |
| Purchase succeeds but files fail | Separate entitlement/install state and resumable download |
| Pack contains executable behaviour | Signed schema, extension allow-list and build audit |
| Offline audio is incomplete or too large | Exact audio manifest, readiness gate, chunking and measured pack size |
| Child is pressured to buy | Parent-only commerce and neutral child copy |
| Gateway logs over-collect network metadata | Minimise retention, strip learner data and declare actual processing |
| Download cost grows unexpectedly | R2 free egress, chunk archives, usage limits and monitoring |
| Store policy changes | Re-check primary policy sources at submission readiness |
| No account means no cross-store recovery | State limitation clearly in Parent onboarding and restore copy |
| Platform backup is unavailable or over quota | Best-effort disclosure, 20 MB snapshot budget and retention compaction |
| PIN is forgotten | Device-owner reset; full local reset only as final recovery |

## 23. Acceptance criteria

The design is successfully implemented when:

1. A parent can install the app, create a PIN and create multiple local child
   profiles without an account.
2. A child can secure the signed 20-item Starter inventory offline, reach the
   Inklet milestones at 1 and 10, and remain below the 30-item milestone.
3. Parent Progress reports the selected child's spelling evidence without
   Monster analytics.
4. Child Home and Monsters present genuine spelling-derived Monster growth.
5. Two children can practise, resume and progress without reading or mutating
   one another's state.
6. A parent can buy Full KS2, resume an interrupted download and activate a
   verified pack without resetting Starter progress or rebasing Inklet
   thresholds.
7. All 213 signed statutory-core Years 3-6 items, Inklet, Glimmerbug and Phaeton
   work offline after installation.
8. Extra/Vellhorn and secure-extension/11+ source content remain outside Full
   KS2 and can later become independent packs without changing the base
   progression denominator.
9. Restore on the same store ecosystem reconstructs entitlement and pack files;
   an eligible, backup-enabled device configuration restores the consistent
   learner snapshot without promising universal recovery.
10. Refund or revocation removes paid access without erasing learning history.
11. No downloaded pack can introduce executable behaviour.
12. The agreed accessibility, performance, privacy, billing and store-release
    gates pass on both platforms before simultaneous public release.
13. A graduated Full-KS2 learner sees `Today's revision mission` only for first
    patrol, due or wobbling Guardian work. `All rested` appears only when none
    of those states remains, together with the next review date and no reward-
    bearing mission.
14. Guardian retains the exact `[3, 7, 14, 30, 60, 90]` day schedule. A wrong
    answer returns tomorrow and never reduces Mega, an earned Monster stage or
    `campHighWater`.
15. Daily Camp credit uniqueness is exactly
    `(learnerId, packId, canonicalGuardianDay)`. The first eligible completed
    mission on an uncredited day increments `campHighWater` by exactly one;
    ineligible or later same-day completions increment it by zero. Replay,
    double completion, relaunch and resume cannot increase it twice, and the
    high-water never decreases. `lastCreditedEventId` is retained separately
    for replay and audit deduplication.
16. If further due work exists after daily credit, the child sees `Camp complete
    for today` and may continue explicitly unrewarded spelling revision.
    Further same-day practice cannot advance Camp state. No balance, currency,
    shop, per-answer reward, random reward, streak loss or missed-day penalty
    exists in the child experience or durable model.
17. `ks2-core:starter` and `ks2-core:full` resolve to the same Camp identity,
    but `ks2-core` revision and Camp require the `full-ks2` entitlement. Every
    future pack requires its own entitlement and has independent Monster and
    Camp progress.
18. Two children can complete and resume revision missions without reading or
    mutating one another's Guardian, Monster or Camp state.
19. Parent Progress reports Guardian due count, next review date and revision
    sessions without exposing Monster or Camp analytics.
20. After the `full-ks2` entitlement is active and Full KS2 is installed, the
    complete Guardian and Monster Camp revision loop works offline.

## 24. Primary references

- [Capacitor documentation](https://capacitorjs.com/docs)
- [Capacitor storage guidance](https://capacitorjs.com/docs/guides/storage)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple StoreKit current entitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)
- [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Google Play Billing integration](https://developer.android.com/google/play/billing/integrate)
- [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en-GB)
- [Google Play Families policy](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en-GB)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [ICO Children's Code introduction](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code)
