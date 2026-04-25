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
