// membership-repository.js — Account-learner membership, role gates, and
// access-control helpers. Extracted from repository.js (P3 U6 split) with
// ZERO behaviour change. Every exported symbol is barrel-re-exported from
// repository.js so existing consumers are unaffected.

import {
  normaliseLearnerRecord,
} from '../../src/platform/core/repositories/helpers.js';
import {
  PLATFORM_ROLES,
  canManageAccountRoles,
  canViewAdminHub,
  canViewParentHub,
  normalisePlatformRole,
} from '../../src/platform/access/roles.js';
import {
  BadRequestError,
  ForbiddenError,
} from './errors.js';
import {
  all,
  first,
  sqlPlaceholders,
} from './d1.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const WRITABLE_MEMBERSHIP_ROLES = new Set(['owner', 'member']);
export const MEMBERSHIP_ROLES = new Set(['owner', 'member', 'viewer']);

// ─── Row-to-model helpers ────────────────────────────────────────────────────

export function learnerRowToRecord(row) {
  return normaliseLearnerRecord({
    id: row.id,
    name: row.name,
    yearGroup: row.year_group,
    avatarColor: row.avatar_color,
    goal: row.goal,
    dailyMinutes: row.daily_minutes,
    createdAt: row.created_at,
  }, row.id);
}

export function membershipRowToModel(row) {
  return {
    learnerId: row?.learner_id || row?.id || '',
    role: row?.role || 'viewer',
    sortIndex: Number(row?.sort_index) || 0,
    stateRevision: Number(row?.state_revision) || 0,
    learner: learnerRowToRecord(row),
  };
}

// ─── Membership queries ──────────────────────────────────────────────────────

export function writableRole(role) {
  return WRITABLE_MEMBERSHIP_ROLES.has(role);
}

export async function listMembershipRows(db, accountId, { writableOnly = false } = {}) {
  const allowedRoles = writableOnly ? ['owner', 'member'] : ['owner', 'member', 'viewer'];
  const rolePlaceholders = sqlPlaceholders(allowedRoles.length);
  return all(db, `
    SELECT
      m.account_id,
      m.learner_id,
      m.role,
      m.sort_index,
      m.created_at AS membership_created_at,
      m.updated_at AS membership_updated_at,
      l.id,
      l.name,
      l.year_group,
      l.avatar_color,
      l.goal,
      l.daily_minutes,
      l.created_at,
      l.updated_at,
      l.state_revision
    FROM account_learner_memberships m
    JOIN learner_profiles l ON l.id = m.learner_id
    WHERE m.account_id = ?
      AND m.role IN (${rolePlaceholders})
    ORDER BY m.sort_index ASC, l.created_at ASC, l.id ASC
  `, [accountId, ...allowedRoles]);
}

export async function getMembership(db, accountId, learnerId) {
  return first(db, `
    SELECT account_id, learner_id, role, sort_index, created_at, updated_at
    FROM account_learner_memberships
    WHERE account_id = ? AND learner_id = ?
  `, [accountId, learnerId]);
}

export async function requireLearnerWriteAccess(db, accountId, learnerId) {
  const membership = await getMembership(db, accountId, learnerId);
  if (!membership || !writableRole(membership.role)) {
    throw new ForbiddenError('Learner access denied.', {
      learnerId,
      required: 'owner-or-member',
    });
  }
  return membership;
}

export async function requireLearnerReadAccess(db, accountId, learnerId) {
  const membership = await getMembership(db, accountId, learnerId);
  if (!membership || !MEMBERSHIP_ROLES.has(membership.role)) {
    throw new ForbiddenError('Learner access denied.', {
      learnerId,
      required: 'owner-member-or-viewer',
    });
  }
  return membership;
}

// ─── Platform role helpers ───────────────────────────────────────────────────

export function accountPlatformRole(account) {
  return normalisePlatformRole(account?.platform_role);
}

export function accountType(account) {
  return account?.account_type === 'demo' ? 'demo' : 'real';
}

// ─── Access-gate functions ───────────────────────────────────────────────────

export function requireParentHubAccess(account, membership) {
  if (!canViewParentHub({ platformRole: accountPlatformRole(account), membershipRole: membership?.role })) {
    throw new ForbiddenError('Parent Hub access denied.', {
      code: 'parent_hub_forbidden',
      required: 'platform-role-parent-or-admin plus readable learner membership',
      learnerId: membership?.learner_id || null,
    });
  }
}

export function requireAdminHubAccess(account) {
  if (accountType(account) === 'demo' || !canViewAdminHub({ platformRole: accountPlatformRole(account) })) {
    throw new ForbiddenError('Admin / operations access denied.', {
      code: 'admin_hub_forbidden',
      required: 'platform-role-admin-or-ops',
    });
  }
}

export function requireAccountRoleManager(account) {
  if (accountType(account) === 'demo' || !canManageAccountRoles({ platformRole: accountPlatformRole(account) })) {
    throw new ForbiddenError('Account role management requires an admin account.', {
      code: 'account_roles_forbidden',
      required: 'platform-role-admin',
    });
  }
}

export function requireMonsterVisualConfigManager(account) {
  if (accountType(account) === 'demo' || accountPlatformRole(account) !== 'admin') {
    throw new ForbiddenError('Monster visual config changes require an admin account.', {
      code: 'monster_visual_config_forbidden',
      required: 'platform-role-admin',
    });
  }
}

// U10 follower (MEDIUM — admin-only policy lock): the Grammar Writing
// Try archive + hard-delete routes are destructive data mutations. The
// reviewer convergence chose the stricter gate (admin only, ops 403)
// rather than `requireAdminHubAccess` which grants ops through. Mirrors
// `requireMonsterVisualConfigManager` and emits a dedicated error code
// (`grammar_transfer_admin_forbidden`) so the security test can lock
// the exact policy string.
export function requireGrammarTransferAdmin(account) {
  if (accountType(account) === 'demo' || accountPlatformRole(account) !== 'admin') {
    throw new ForbiddenError('Grammar Writing Try archive and delete require an admin account.', {
      code: 'grammar_transfer_admin_forbidden',
      required: 'platform-role-admin',
    });
  }
}

export function requireSubjectContentExportAccess(account) {
  if (!canViewAdminHub({ platformRole: accountPlatformRole(account) })) {
    throw new ForbiddenError('Spelling content export requires an admin or operations account.', {
      code: 'subject_content_export_forbidden',
      required: 'platform-role-admin-or-ops',
    });
  }
}

export function requireSubjectContentWriteAccess(account) {
  if (accountPlatformRole(account) !== 'admin') {
    throw new ForbiddenError('Spelling content import requires an admin account.', {
      code: 'subject_content_write_forbidden',
      required: 'platform-role-admin',
    });
  }
}

export function normaliseRequestedPlatformRole(value) {
  const role = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!PLATFORM_ROLES.includes(role)) {
    throw new BadRequestError('Unknown platform role.', {
      code: 'unknown_platform_role',
      allowed: PLATFORM_ROLES,
    });
  }
  return role;
}
