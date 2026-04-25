# Monster visual + effect config centre

The monster visual + effect config centre is the admin workflow for changing monster facing, image source context, offsets, scale, crop, shadow, and review state — and, since PR #157, the merged effect catalog, per-monster effect bindings, and per-monster celebration tunables — without editing renderer or effect-module code.

The centre publishes a single combined document. One save, one publish, one restore covers both visual and effect data.

## Operator workflow

Open **Admin / Operations** with platform role `admin`.

The **Monster visuals** panel shows:

- the current draft revision and published version
- queue filters for all assets, changed assets, assets needing review, and blockers
- one selected asset across the six renderer contexts
- editable baseline fields and selected-context fields
- the merged effect-catalog editor, per-monster effect bindings, and per-monster celebration tunables for the selected asset
- local autosave status
- explicit **Save draft**, **Publish**, and **Restore version** controls

`ops` accounts can view the panel and previews, but mutation controls are read-only. The Worker also enforces this, so browser controls are not the security boundary.

## Draft, publish, and restore

The Worker stores one global monster visual config row in D1:

- `draft_json` (visual + effect)
- `draft_revision`
- `published_json` (visual + effect)
- `published_version`
- `manifest_hash`
- `schema_version`

Saving writes only the shared draft. It does not change learner-visible rendering.

Publishing copies the current draft into the published config, increments the published version, writes a retained version row, and prunes history to the latest 20 versions. Visual and effect sub-documents publish atomically — there is no half-published state.

Restoring copies a retained version back into the draft only. It deliberately leaves the live published version unchanged until an admin publishes that restored draft. See **Rollback via restore** below.

All mutations require a request id and an expected draft revision. Concurrent stale saves are rejected with `409 stale_write`; the browser keeps the local draft buffer so the operator can refresh or reapply the change deliberately.

## Review gate

Publishing is Worker-enforced. A draft must include:

- schema version `1`
- the current generated manifest hash
- every asset from `assets/monsters`
- every baseline field
- every field for `meadow`, `codexCard`, `codexFeature`, `lightbox`, `celebrationOverlay`, and `toastPortrait`
- reviewed state for every asset/context

For the effect sub-document, publish is additionally blocked unless:

- every catalog entry is reviewed and conforms to its template's param schema
- every asset has both an effect-bindings row and a celebration-tunables row
- every binding entry references a known kind (catalog or bundled fallback) and is reviewed
- every celebration tunable (`caught`, `evolve`, `mega`) is reviewed and uses `modifierClass` from the closed allowlist (`''`, `'egg-crack'`)

Editing baseline values resets review state for all contexts on that asset. Editing a context resets that context only. Mark it reviewed again after checking the Admin preview.

## Authoring a new catalog entry

1. **Pick a template**. The catalog is constrained to seven templates: `motion`, `glow`, `sparkle`, `aura`, `particles-burst`, `shine-streak`, `pulse-halo`. Each owns its render body and CSS classes — admin cannot author new templates.
2. **Set kind, lifecycle, layer, surfaces, reducedMotion**. `kind` is the unique identifier; `lifecycle ∈ {persistent, transient, continuous}`, `layer ∈ {base, overlay}`, `reducedMotion ∈ {omit, simplify, asis}`.
3. **Fill template params**. The panel renders one field per param defined in `effect-templates/param-schemas.js` — number, string, enum, or boolean. Defaults must satisfy `min`/`max` and enum value lists.
4. **Optional zIndex and exclusiveGroup**. `zIndex` orders overlay stacking. `exclusiveGroup` (e.g. `'rarity'`) ensures only one entry from the group binds to an asset at a time.
5. **Review, then save the draft**. An entry is unreviewed by default; mark it reviewed after the panel preview confirms the look.
6. **Publish** the combined draft when all visual + effect blockers are clear.

New visual primitives still require a code change to add a template. The closed allowlist is the XSS boundary.

## Per-monster bindings

Each `monster-branch-stage` asset carries a bindings row with two slots:

- `continuous` — base-layer motion (idle bob, egg breathe). Stage 0 assets default to `egg-breathe`; later stages default to `monster-motion-float`.
- `persistent` — overlay effects (`shiny`, `mega-aura`, `rare-glow`).

Add a binding by selecting a kind from the catalog and filling its caller params (e.g. `intensity`, `palette`). Editing any field on a binding resets review state for that row. Bindings inside an `exclusiveGroup` are auto-deduplicated — adding a second `rarity` overlay replaces the first. Deleting a catalog kind drops every binding that referenced it; the runtime falls back to bundled defaults until the operator rebinds.

## Per-monster celebration tunables

For each asset and each celebration kind in `{caught, evolve, mega}` the panel shows three toggles:

- `showParticles` (boolean)
- `showShine` (boolean)
- `modifierClass` — closed allowlist `['', 'egg-crack']`. Anything else fails publish.

Each kind tracks its own review state independently. Editing one tunable does not reset review on the others — operators can land `caught` changes without re-reviewing `mega`.

## Rollback via restore

Restoring is the safe rollback path for a botched publish. It copies a retained version into the draft only; the live published config does not change until that draft is published. The combined visual + effect blob restores atomically. See **Draft, publish, and restore** above for the storage shape.

## Bundled fallback coverage

Runtime resolution is forgiving:

- missing or malformed visual context entries fall back to bundled defaults for that asset/context
- manifest hash mismatch is recorded, but it does not blank existing published assets
- newly added assets use bundled fallback until a reviewed draft matching the new manifest is published
- the eight code-registered effects (`egg-breathe`, `monster-motion-float`, `shiny`, `mega-aura`, `rare-glow`, `caught`, `evolve`, `mega`) always re-register first at boot so a broken catalog can never fully blank monster rendering

Publish validation is stricter than render validation. That split keeps production visuals resilient while preventing partial or unreviewed config from becoming the next published version. Strict publish blocks unreviewed entries; bundled defaults stay available regardless.

## Concurrent admin tabs

Each admin tab generates a `tabNonce` on mount, scoped into the autosave key alongside `accountId`, `manifestHash`, and `draftRevision`. Two tabs editing the same draft do not stomp each other's local autosave entries.

`findStaleAutosave()` scans neighbouring keys at the same `manifestHash` + `draftRevision` and surfaces any other tab's autosave as a recovery banner so the operator can deliberately reapply the change rather than losing it silently.

## Rollout

The first publish of the merged config **must** include the bundled defaults verbatim so behaviour is byte-equivalent to runtime fallback. R10 of `docs/plans/2026-04-25-002-feat-monster-effect-config-integration-plan.md` enforces this. Subsequent publishes can ramp visual or effect changes independently.

Production smoke after deploy:

```sh
npm run smoke:production:effect
```

The probe hits the same `/api/bootstrap` payload the browser consumes (`monsterVisualConfig.config.effect`), asserts the merged shape parses, asserts the catalog includes all eight bundled kinds, and asserts every covered asset has bindings or celebration tunables defined. Retries with exponential backoff on 5xx. CLI flags: `--env=prod|preview|local`, `--url=<base>`, `--verbose`.

If the smoke probe fails, restore the previous retained version into draft and re-publish.

## Celebration overlay nested-wrapper contract

The `celebrationOverlay` context renders through a two-element structure in `src/platform/game/render/effects/celebration-shell.js` and `src/surfaces/shell/MonsterCelebrationOverlay.jsx`:

```
<span class="monster-celebration-visual ..." style="--visual-offset-x, --visual-scale, --visual-anchor-x, ...">
  <span class="monster-celebration-shadow" />
  <img  class="monster-celebration-art ..." />
</span>
```

Division of responsibility:

- The outer `.monster-celebration-visual` is positioned at the stage centre (`top: 50%; left: 50%`) and carries the var-driven transform that applies per-monster `offsetX`, `offsetY`, `scale`, and `anchorX / anchorY` from monster-visual-config.
- The inner `.monster-celebration-art` is `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain` inside the wrapper. Its keyframes animate only `scale` (and, where the choreography needs it, a small `translateY` or `rotate`). They must **never** contain `translate(-50%, …)` — the img is already aligned to the wrapper via `inset: 0`, so a self-centring translate would shift it out of the wrapper and stomp on the wrapper's per-monster offset/anchor/scale.

Self-centred peripheral elements (`.monster-celebration-halo`, `.monster-celebration-white`, `.monster-celebration-shine`, and their variant keyframes) are the opposite shape: their base rule places them at `top: 50%; left: 50%` and their keyframes deliberately carry `translate(-50%, -50%)` to stay centred as they scale.

`tests/celebration-keyframe-contract.test.js` pins both invariants. See `docs/plans/2026-04-25-002-fix-celebration-sprite-centring-plan.md` for the regression history (introduced in PR #119, partial fix in PR #141).

## Asset changes

Monster assets live under:

```txt
assets/monsters/<monster>/<branch>/<monster>-<branch>-<stage>.<size>.webp
```

When folders change, regenerate the manifest:

```sh
npm run assets:monster-visual-manifest
```

The normal bundle build also runs the manifest generator before building the app bundle. `scripts/assert-build-public.mjs` compares the generated manifest with `assets/monsters` and fails clearly if the manifest is stale.

Use the package scripts for Cloudflare work:

```sh
npm run check
npm run db:migrate:remote
npm run deploy
```

Do not bypass the OAuth-safe package scripts with raw Wrangler commands.
