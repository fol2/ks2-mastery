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

export function applyAdminHubDashboardKpisPatch(adminHub, rawKpis) {
  const hub = coerceAdminHub(adminHub);
  if (!hub) return adminHub;
  const next = stripOkEnvelope(rawKpis);
  if (!isPlainObject(next)) return hub;
  return { ...hub, dashboardKpis: next };
}

export function applyAdminHubOpsActivityPatch(adminHub, rawActivity) {
  const hub = coerceAdminHub(adminHub);
  if (!hub) return adminHub;
  const next = stripOkEnvelope(rawActivity);
  if (!isPlainObject(next)) return hub;
  return { ...hub, opsActivityStream: next };
}

export function applyAdminHubErrorLogSummaryPatch(adminHub, rawSummary) {
  const hub = coerceAdminHub(adminHub);
  if (!hub) return adminHub;
  const next = stripOkEnvelope(rawSummary);
  if (!isPlainObject(next)) return hub;
  // Preserve the per-panel in-flight scalar so a narrow refresh that fires
  // during a pending status transition does not wipe the saving guard.
  const previous = isPlainObject(hub.errorLogSummary) ? hub.errorLogSummary : {};
  const savingEventId = typeof previous.savingEventId === 'string' ? previous.savingEventId : '';
  return {
    ...hub,
    errorLogSummary: savingEventId ? { ...next, savingEventId } : next,
  };
}

export function applyAdminHubAccountOpsMetadataPatch(adminHub, rawDirectory) {
  const hub = coerceAdminHub(adminHub);
  if (!hub) return adminHub;
  const next = stripOkEnvelope(rawDirectory);
  if (!isPlainObject(next)) return hub;
  // Preserve the per-panel in-flight scalar (U5 follow-up Finding 1) so a
  // narrow refresh mid-save does not unmask the row while a PUT is pending.
  const previous = isPlainObject(hub.accountOpsMetadata) ? hub.accountOpsMetadata : {};
  const savingAccountId = typeof previous.savingAccountId === 'string' ? previous.savingAccountId : '';
  return {
    ...hub,
    accountOpsMetadata: savingAccountId ? { ...next, savingAccountId } : next,
  };
}
