---
date: 2026-04-24
topic: monster-visual-config-centre
---

# Monster Visual Config Centre

## Problem Frame

Monster visual metadata is currently spread across build-time constants and renderer-specific tuning. `src/surfaces/home/data.js` owns facing and meadow path behaviour, `src/surfaces/home/codex-view-model.js` owns feature/lightbox foot alignment, and `src/platform/game/monsters.js` owns product-level monster catalogue data. This makes visual review slow because every facing, offset, shadow, crop, motion, or context-specific adjustment requires code edits and redeploys.

James needs an online Admin / Operations visual config centre where monster assets can be reviewed, tuned, saved as draft, and published as a global production visual config. The admin page should render the previews itself, so the review workflow does not require jumping through every learner surface while tuning. Once published, all monster renderers should eventually consume the same reviewed config, with hard fallback to bundled defaults when runtime config is unavailable.

Evidence used:

- `src/surfaces/home/data.js`
- `src/surfaces/home/MonsterMeadow.jsx`
- `src/surfaces/home/codex-view-model.js`
- `src/surfaces/home/CodexCreature.jsx`
- `src/surfaces/shell/ToastShelf.jsx`
- `src/surfaces/shell/MonsterCelebrationOverlay.jsx`
- `src/surfaces/hubs/AdminHubSurface.jsx`
- `src/platform/game/monsters.js`
- `assets/monsters/`
- `worker/README.md`

---

## Actors

- A1. James / Admin: Reviews, edits, saves, publishes, and restores global monster visual config.
- A2. Operations user: Can inspect and preview visual config but cannot mutate or publish it.
- A3. Learner: Sees published monster visuals in normal dashboard, Codex, toast, and celebration flows.
- A4. Admin preview renderer: Renders all selected asset contexts inside the Admin / Operations page.
- A5. Worker config boundary: Stores cloud draft, published versions, review state, mutation receipts, and serves the active config.
- A6. Monster renderers: Dashboard meadow, Codex cards, Codex feature, lightbox, celebration overlay, and toast portrait surfaces.
- A7. Asset manifest generator: Produces the authoritative list of monster assets from `assets/monsters/` at build time.

---

## Key Flows

- F1. Asset discovery and seeded config
  - **Trigger:** The app is built or the manifest generation step runs.
  - **Actors:** A7, A5, A6
  - **Steps:** The asset manifest is generated from all present `assets/monsters/` folders, current bundled defaults are converted into the first published visual config, and runtime consumers retain bundled fallback values.
  - **Outcome:** Every present monster asset has a known baseline for Admin review, and production can render even if remote config is missing.
  - **Covered by:** R1, R2, R3, R4, R20, R21, R22

- F2. Admin review and local tuning
  - **Trigger:** James opens Monster Visuals from Admin / Operations.
  - **Actors:** A1, A4
  - **Steps:** The page shows a review queue, James selects an asset, previews all renderer contexts in-place, drags visual handles or changes numeric fields, and the browser keeps a local autosave buffer until James explicitly saves.
  - **Outcome:** James can tune visuals safely without changing the cloud draft or live production config on every drag.
  - **Covered by:** R5, R6, R7, R8, R9, R10, R11, R12, R13

- F3. Cloud draft save and review completion
  - **Trigger:** James presses Save or uses the save shortcut.
  - **Actors:** A1, A5
  - **Steps:** The current local buffer is written to the shared cloud draft, review state is updated per asset/context, and the queue reflects incomplete, changed, unreviewed, and published-mismatch states.
  - **Outcome:** The shared draft is durable across refreshes, machines, and future planning/implementation work.
  - **Covered by:** R9, R10, R11, R14, R15, R16

- F4. Strict publish
  - **Trigger:** James publishes the shared cloud draft.
  - **Actors:** A1, A5, A6, A3
  - **Steps:** Publish validation checks every asset baseline, every renderer context, every exposed field, and every reviewed state. If valid, the draft becomes the new global published config and all live renderers consume it through the shared visual model.
  - **Outcome:** Production learners see a complete reviewed global config; partial or unreviewed drafts cannot leak into production.
  - **Covered by:** R14, R15, R16, R17, R18, R19, R20, R21, R22

- F5. Restore previous version
  - **Trigger:** James chooses a prior published version.
  - **Actors:** A1, A5, A4
  - **Steps:** The old version is restored into draft, James previews or adjusts it, and only a later publish makes it live again.
  - **Outcome:** Rollback is safe and reviewable instead of an immediate production mutation.
  - **Covered by:** R17, R18, R19

---

## Requirements

**Visual Config Model**

- R1. The visual config centre must cover every monster asset folder present under `assets/monsters/`, not only monsters currently active in gameplay.
- R2. Asset discovery must come from a build-time generated manifest based on `assets/monsters/`, so Admin review, validation, and renderer fallback use the same asset list.
- R3. The initial published config must be generated from current bundled defaults, including existing facing, preferred path, scale, foot alignment, and renderer-specific defaults where available.
- R4. Visual config must use asset baseline plus renderer context overrides. Each `monster-branch-stage` asset has a baseline, and each renderer context can override it.
- R5. The required renderer contexts are `meadow`, `codexCard`, `codexFeature`, `lightbox`, `celebrationOverlay`, and `toastPortrait`.
- R6. Every exposed visual field is required before publish. V1 should expose the practical and advanced tuning surface: facing, path or motion profile, x/y offset, scale, anchor or foot position, shadow x/y/scale/opacity, z/layer hint, duration, delay, bob, tilt, crop bounds, filter, and any other visible motion/timing/crop/filter field that the Admin editor exposes.

**Admin Review Experience**

- R7. Monster Visuals must live inside the existing Admin / Operations surface, not as a public page and not as an unprotected route.
- R8. The Admin page must render the preview itself. James should not need to navigate through the dashboard, Codex, toast, or celebration surfaces while tuning a value.
- R9. The review UI must be queue-based, with filters for monster, branch, stage, incomplete, changed, unreviewed, and published mismatch states.
- R10. Each selected asset detail view must show all six renderer contexts together, so James can review cross-context consistency before marking anything done.
- R11. Editing must support visual drag controls plus exact numeric controls. Dragging changes the preview and local buffer; numeric controls preserve precise repeatable values.
- R12. The Admin editor must support basic review shortcuts: next/previous asset, switch context by number, save draft, publish when valid, and mark reviewed or revert based on state.
- R13. Draft edits must autosave locally in the browser to protect against refresh or accidental navigation, but only a manual Save writes to the shared cloud draft.
- R14. Review state must be tracked per asset/context, not only per asset.

**Draft, Publish, Permissions, and History**

- R15. Admin accounts can edit, save, publish, restore previous versions into draft, and mark contexts reviewed. Operations accounts can inspect and preview only.
- R16. The shared cloud draft must not affect learner production UI until it is published.
- R17. Publishing requires every asset baseline, every context override, every exposed field, and every asset/context review state to be complete and valid.
- R18. The published config is global platform-wide. It is not per account, per learner, or per subject.
- R19. The system must retain the last 20 published versions. Restoring an older version must copy it into draft first; it must not immediately mutate live production.
- R20. If a new asset folder appears, the current live production config remains unaffected. The next publish is blocked until the new asset and all required contexts are complete and reviewed.
- R21. Save and publish mutations must be auditable through the existing mutation receipt pattern used by other admin mutations.

**Runtime Consumption**

- R22. All existing monster renderers must eventually consume the published visual config through a shared visual model: dashboard meadow, Codex card, Codex feature, lightbox, celebration overlay, and toast portrait.
- R23. Runtime renderers must have hard fallback to bundled defaults if the published config cannot be loaded, is incomplete, or is older than the current asset manifest.
- R24. Published config must not alter learning logic, monster progress, mastery thresholds, rewards, or content. It controls visual presentation only.
- R25. Renderer refactors must preserve the current learner-visible behaviour until a reviewed published config explicitly changes a visual value.

---

## Acceptance Examples

- AE1. **Covers R7, R8, R11, R13.** Given James changes `vellhorn-b1-3` facing in the Admin page, when he drags or changes numeric controls, the Admin preview updates and the local buffer is protected, but production remains unchanged until Save and Publish complete.
- AE2. **Covers R15.** Given an Operations user opens Monster Visuals, when they inspect an asset, they can preview every context but cannot save, publish, restore, or mark reviewed.
- AE3. **Covers R14, R17.** Given one `codexFeature` context is not marked reviewed, when James attempts to publish, publish is blocked and the Admin page identifies the incomplete asset/context.
- AE4. **Covers R1, R20.** Given a new folder is added under `assets/monsters/`, when the manifest includes it, the existing published config stays live but the next publish is blocked until that asset has complete reviewed baseline and context config.
- AE5. **Covers R18, R22.** Given James publishes a valid visual config, when any learner opens dashboard, Codex, lightbox, toast, or celebration flows, those renderers use the same global published values for the matching asset/context.
- AE6. **Covers R19.** Given James restores version 4 while version 7 is live, when the restore action completes, version 4 becomes the cloud draft and version 7 remains live until James publishes the restored draft.
- AE7. **Covers R23, R25.** Given the Worker config read fails, when a learner opens the dashboard, the monster renderer uses bundled defaults and does not show a blank or broken visual.

---

## Success Criteria

- James can review monster visuals online without editing source constants for every facing, offset, crop, shadow, timing, or scale adjustment.
- The Admin page makes high-volume review practical through a queue, all-context previews, local autosave, numeric controls, drag controls, shortcuts, and per-context reviewed state.
- Production learners only see complete reviewed global visual configs.
- Planning can proceed without inventing the product workflow, permission model, publish gate, rollback behaviour, asset scope, or renderer contexts.
- Runtime renderers become simpler over time because they consume a shared visual model rather than each owning disconnected visual metadata.
- Config failure is non-destructive: live learners always have bundled fallback rendering.

---

## Scope Boundaries

- Do not build asset upload, replacement, image editing, or background-removal workflows in this feature.
- Do not make visual config account-scoped, learner-scoped, or subject-scoped.
- Do not let draft changes affect production before publish.
- Do not allow partial publish with warnings; V1 publish is strict.
- Do not make Operations users mutate global visual config.
- Do not change monster progression, reward events, mastery thresholds, spelling content, punctuation content, or learner state.
- Do not require James to preview values by navigating out to normal learner surfaces while tuning.
- Do not remove bundled visual defaults; they remain the safety fallback.

---

## Key Decisions

- Use Admin / Operations as the home: It already carries the role-gated operator surface and avoids creating another admin entry point.
- Build a visual config centre, not a tiny facing-only panel: James wants to review and tune all monster visual metadata from the web.
- Render previews inside Admin: This keeps review fast and avoids scattering tuning work across learner flows.
- Publish should eventually feed all monster renderers: The centre should create the durable source of truth, not an admin-only toy.
- Use asset baseline plus context overrides: One image needs a shared baseline but may need different tuning in meadow, Codex, lightbox, toast, and celebration contexts.
- Cover all asset folders present: Review should follow available art, including future or not-yet-active monsters.
- Use global platform-wide config: Monster asset metadata is product-level, not account-specific.
- Admin edits and publishes, Ops views only: The config is global and production-sensitive.
- Use visual drag plus numeric controls: Review needs both speed and exact repeatability.
- Use shared cloud draft with version history and rollback-to-draft: This keeps work durable and makes recovery safe.
- Require all exposed fields and all contexts to be reviewed before publish: A global production visual config should be complete and trustworthy.
- Seed from bundled defaults: The first published version should preserve current behaviour before James starts tuning.

---

## Dependencies / Assumptions

- The existing Admin / Operations permission boundary remains the correct place for global operator controls.
- The current static asset layout under `assets/monsters/<monster>/<branch>/<monster>-<branch>-<stage>.<size>.webp` remains the source asset convention.
- The build pipeline can add a manifest generation step without changing how monster assets are served.
- Existing renderers can be refactored to share a monster visual model while preserving current visual defaults.
- Mutation receipts remain the platform pattern for auditable admin changes.
- Concurrent admin edits should not silently overwrite each other; planning should choose the exact conflict-handling mechanism.

---

## Outstanding Questions

### Resolve Before Planning

- None.

### Deferred to Planning

- [Affects R2, R3][Technical] Define the exact generated manifest shape and how bundled defaults are converted into the seed published config.
- [Affects R6][Technical] Enumerate the final field list per renderer context and decide which fields are common versus context-specific while still satisfying the "all exposed fields required" rule.
- [Affects R13, R15, R21][Technical] Define save conflict handling for multiple admins or stale browser-local buffers.
- [Affects R22, R23][Technical] Decide the sequence for refactoring each renderer onto the shared visual model while keeping fallback behaviour stable.

---

## Next Steps

-> /ce-plan for structured implementation planning.
