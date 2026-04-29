// PR #188 H1: narrow-response patch helpers for the four admin ops panels.
//
// Each helper accepts the current adminHub read-model plus a narrow per-panel
// response payload from one of the /api/admin/ops/* GET routes and returns a
// new adminHub object with only the target sibling field replaced. All other
// siblings — including the per-panel in-flight scalars (`savingAccountId`,
// `savingEventId`) wired by the U5 follow-up work — are preserved. Helpers
// never mutate their inputs; they allocate a fresh adminHub object and a
// fresh sibling object so React sees a new reference and re-renders.
//
// This module is deliberately kept free of any content-heavy or role-helper
// imports so it can be pulled into the production client bundle without
// triggering the forbidden-module audit in `scripts/audit-client-bundle.mjs`
// (the bundle audit disallows `admin-read-model.js` because it transitively
// imports the full spelling content dataset for server-side hub build).
//
// P1.5 Phase A (U1): each panel now also carries a `refreshedAt` timestamp
// (server-produced `generatedAt` copied in on successful refresh) and a
// `refreshError` sibling ({ code, message, at, correlationId? } | null). The
// latter is set by the four refresh helpers in main.js when the narrow
// fetch rejects, and cleared on the next successful refresh. The patch
// helpers below preserve these two siblings across refreshes so a successful
// patch clears the error without dropping the saving scalars, and so a
// failing patch can overwrite them without stomping the latest server data
// that was already applied.
//
// P2 U1: `postMasteryDebug` is a new top-level admin-hub sibling populated
// by the full hub bundle only — there is no narrow /api/admin/ops/*
// refresh route for this field in P2 U1. The four patch helpers below use
// object spread (`{ ...hub, <sibling>: next }`), which preserves every
// other top-level sibling including `postMasteryDebug`. No additional
// helper is required; a POST-based admin-only diagnostic refresh can be
// added later without touching the four existing narrow-patch paths.

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function coerceAdminHub(value) {
  return isPlainObject(value) ? value : null;
}

function stripOkEnvelope(value) {
  if (!isPlainObject(value)) return value;
  // Worker ops GETs wrap their response as { ok: true, ...payload }. Drop the
  // envelope flag so the patch result matches the same sibling shape that the
  // full hub bundle emits.
  if ('ok' in value) {
    const { ok: _ok, ...rest } = value;
    return rest;
  }
  return value;
}

// P1.5 Phase A (U1): compose the new sibling with preserved `refreshedAt`
// / `refreshError` envelope values. The caller supplies the new payload and
// the previous sibling (which may be absent on first load). Rules:
//
// - `refreshedAt` always updates to the new server `generatedAt` on success
//   because the caller passes the fresh payload. We mirror it via the patch
//   helpers to keep a single source of truth ("the value rendered beside the
//   Refresh button is exactly the timestamp of the last successful fetch").
// - `refreshError` is cleared on success (the user just saw a green refresh,
//   there is no error to surface). Failures set it via the refreshError
//   setters in main.js before ever calling the patch helper, so this path
//   only sees the success case.
// - Any extra sibling scalars the caller wants to preserve (savingAccountId,
//   savingEventId) are merged via the third argument.
function composeSuccess(previousSibling, nextPayload, preserveKeys = []) {
  const prev = isPlainObject(previousSibling) ? previousSibling : {};
  const generatedAt = Number.isFinite(Number(nextPayload?.generatedAt))
    ? Number(nextPayload.generatedAt)
    : 0;
  const preserved = {};
  for (const key of preserveKeys) {
    if (typeof prev[key] === 'string' && prev[key]) preserved[key] = prev[key];
  }
  return {
    ...nextPayload,
    ...preserved,
    refreshedAt: generatedAt,
    refreshError: null,
  };
}

export function applyAdminHubDashboardKpisPatch(adminHub, rawKpis) {
  const hub = coerceAdminHub(adminHub);
  if (!hub) return adminHub;
  const next = stripOkEnvelope(rawKpis);
  if (!isPlainObject(next)) return hub;
  const previous = isPlainObject(hub.dashboardKpis) ? hub.dashboardKpis : null;
  return { ...hub, dashboardKpis: composeSuccess(previous, next) };
}

export function applyAdminHubOpsActivityPatch(adminHub, rawActivity) {
  const hub = coerceAdminHub(adminHub);
  if (!hub) return adminHub;
  const next = stripOkEnvelope(rawActivity);
  if (!isPlainObject(next)) return hub;
  const previous = isPlainObject(hub.opsActivityStream) ? hub.opsActivityStream : null;
  return { ...hub, opsActivityStream: composeSuccess(previous, next) };
}

export function applyAdminHubErrorLogSummaryPatch(adminHub, rawSummary) {
  const hub = coerceAdminHub(adminHub);
  if (!hub) return adminHub;
  const next = stripOkEnvelope(rawSummary);
  if (!isPlainObject(next)) return hub;
  // Preserve the per-panel in-flight scalar so a narrow refresh that fires
  // during a pending status transition does not wipe the saving guard.
  const previous = isPlainObject(hub.errorLogSummary) ? hub.errorLogSummary : null;
  return {
    ...hub,
    errorLogSummary: composeSuccess(previous, next, ['savingEventId']),
  };
}

export function applyAdminHubAccountOpsMetadataPatch(adminHub, rawDirectory) {
  const hub = coerceAdminHub(adminHub);
  if (!hub) return adminHub;
  const next = stripOkEnvelope(rawDirectory);
  if (!isPlainObject(next)) return hub;
  // Preserve the per-panel in-flight scalar (U5 follow-up Finding 1) so a
  // narrow refresh mid-save does not unmask the row while a PUT is pending.
  const previous = isPlainObject(hub.accountOpsMetadata) ? hub.accountOpsMetadata : null;
  return {
    ...hub,
    accountOpsMetadata: composeSuccess(previous, next, ['savingAccountId']),
  };
}

export function applyAdminHubProductionEvidencePatch(adminHub, rawSummary) {
  const hub = coerceAdminHub(adminHub);
  if (!hub) return adminHub;
  const next = stripOkEnvelope(rawSummary);
  if (!isPlainObject(next)) return hub;
  const previous = isPlainObject(hub.productionEvidence) ? hub.productionEvidence : null;
  return { ...hub, productionEvidence: composeSuccess(previous, next) };
}

// U8 (P3): narrow-refresh patch for the denial log panel. Mirrors the
// four existing sibling patch helpers above. The denial panel has no
// in-flight saving scalars, so no `preserveKeys` are needed.
export function applyAdminHubDenialPatch(adminHub, rawDenials) {
  const hub = coerceAdminHub(adminHub);
  if (!hub) return adminHub;
  const next = stripOkEnvelope(rawDenials);
  if (!isPlainObject(next)) return hub;
  const previous = isPlainObject(hub.denialLog) ? hub.denialLog : null;
  return { ...hub, denialLog: composeSuccess(previous, next) };
}

// P1.5 Phase A (U1): failure-case patch — record the refresh error on the
// target panel without touching any other sibling. The refreshedAt scalar
// is preserved verbatim (whatever timestamp the UI was displaying from the
// last successful refresh stays put), so the header continues to show "last
// refreshed <N> ago" alongside the new error banner.
const PANEL_KEYS = Object.freeze({
  dashboardKpis: 'dashboardKpis',
  opsActivityStream: 'opsActivityStream',
  errorLogSummary: 'errorLogSummary',
  accountOpsMetadata: 'accountOpsMetadata',
  productionEvidence: 'productionEvidence',
  denialLog: 'denialLog',
});

export function applyAdminHubPanelRefreshError(adminHub, panelKey, refreshError) {
  const hub = coerceAdminHub(adminHub);
  if (!hub) return adminHub;
  const key = PANEL_KEYS[panelKey];
  if (!key) return hub;
  const previous = isPlainObject(hub[key]) ? hub[key] : { generatedAt: 0 };
  const nextError = refreshError && typeof refreshError === 'object'
    ? { ...refreshError }
    : null;
  return {
    ...hub,
    [key]: {
      ...previous,
      refreshError: nextError,
      // `refreshedAt` is only updated on success — on failure we keep whatever
      // timestamp was already rendered so the user can see "last refreshed
      // at X; current attempt failed".
      refreshedAt: Number(previous.refreshedAt) || Number(previous.generatedAt) || 0,
    },
  };
}
