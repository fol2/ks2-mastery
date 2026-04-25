# Monster visual config centre

The monster visual config centre is the admin workflow for changing monster facing, image source context, offsets, scale, crop, shadow, and review state without editing renderer code.

## Operator workflow

Open **Admin / Operations** with platform role `admin`.

The **Monster visuals** panel shows:

- the current draft revision and published version
- queue filters for all assets, changed assets, assets needing review, and blockers
- one selected asset across the six renderer contexts
- editable baseline fields and selected-context fields
- local autosave status
- explicit **Save draft**, **Publish**, and **Restore version** controls

`ops` accounts can view the panel and previews, but mutation controls are read-only. The Worker also enforces this, so browser controls are not the security boundary.

## Draft, publish, and restore

The Worker stores one global monster visual config row in D1:

- `draft_json`
- `draft_revision`
- `published_json`
- `published_version`
- `manifest_hash`
- `schema_version`

Saving writes only the shared draft. It does not change learner-visible rendering.

Publishing copies the current draft into the published config, increments the published version, writes a retained version row, and prunes history to the latest 20 versions.

Restoring copies a retained version back into the draft only. It deliberately leaves the live published version unchanged until an admin publishes that restored draft.

All mutations require a request id and an expected draft revision. Concurrent stale saves are rejected with `409 stale_write`; the browser keeps the local draft buffer so the operator can refresh or reapply the change deliberately.

## Review gate

Publishing is Worker-enforced. A draft must include:

- schema version `1`
- the current generated manifest hash
- every asset from `assets/monsters`
- every baseline field
- every field for `meadow`, `codexCard`, `codexFeature`, `lightbox`, `celebrationOverlay`, and `toastPortrait`
- reviewed state for every asset/context
- valid numeric ranges for unit fields such as opacity, crop, and shadow opacity

Editing baseline values resets review state for all contexts on that asset. Editing a context resets that context only. Mark it reviewed again after checking the Admin preview.

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

## Runtime fallback

Learner rendering receives only the published runtime payload from `/api/bootstrap`.

Runtime resolution is forgiving:

- missing or malformed context entries fall back to bundled defaults for that asset/context
- manifest hash mismatch is recorded, but it does not blank existing published assets
- newly added assets use bundled fallback until a reviewed draft matching the new manifest is published

Publish validation is stricter than render validation. That split keeps production visuals resilient while preventing partial or unreviewed config from becoming the next published version.

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
