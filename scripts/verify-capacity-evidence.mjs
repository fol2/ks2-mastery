#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execSync, execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { relative, resolve } from 'node:path';

import {
  EVIDENCE_SCHEMA_VERSION,
  P1_UNCLASSIFIED_INSUFFICIENT_LOGS,
  evaluateThresholds,
} from './lib/capacity-evidence.mjs';

const CAPACITY_DOC_PATH = 'docs/operations/capacity.md';

// Tier configs live under this directory and are PR-reviewed. Evidence that
// claims a tier must cite a config file committed here, not an ad-hoc
// /tmp/loose.json. Without this check, an operator could supply relaxed
// thresholds under deadline pressure and have the evidence cross-check pass.
const TIER_CONFIG_DIR = 'reports/capacity/configs';

const DECISION_TIERS = new Set([
  'fail',
  'smoke-pass',
  'small-pilot-provisional',
  '30-learner-beta-certified',
  '60-learner-stretch-certified',
  '100-plus-certified',
]);

const TIERS_ABOVE_SMALL_PILOT = new Set([
  '30-learner-beta-certified',
  '60-learner-stretch-certified',
  '100-plus-certified',
]);

// Round 5 Finding 1 (High): dryRun:true is a legitimate preview mode for
// smoke-pass rows but must not launder certification-tier claims. When the
// decision belongs to this set the payload cannot set `dryRun: true`.
const TIERS_ABOVE_SMOKE_PASS = new Set([
  'small-pilot-provisional',
  '30-learner-beta-certified',
  '60-learner-stretch-certified',
  '100-plus-certified',
]);

// Round 5 Finding 3 (Medium): the minimum threshold keys a committed config
// MUST declare per tier. An empty `thresholds: {}` previously passed silently.
// Keys map onto capacity-evidence.mjs's KNOWN_THRESHOLD_KEYS; `maxResponseBytes`
// is the "maxBootstrapBytes" gate the plan mandates for classroom tiers.
const REQUIRED_THRESHOLD_KEYS_PER_TIER = new Map([
  ['small-pilot-provisional', ['max5xx', 'maxBootstrapP95Ms', 'maxCommandP95Ms']],
  ['30-learner-beta-certified', ['max5xx', 'maxBootstrapP95Ms', 'maxCommandP95Ms', 'maxResponseBytes']],
  ['60-learner-stretch-certified', ['max5xx', 'maxBootstrapP95Ms', 'maxCommandP95Ms', 'maxResponseBytes']],
  ['100-plus-certified', ['max5xx', 'maxBootstrapP95Ms', 'maxCommandP95Ms', 'maxResponseBytes']],
]);

// Exposed sentinel string for the placeholder row. Future authors rewording the
// placeholder MUST update this constant and the matching row in
// docs/operations/capacity.md together, or verify will start failing.
export const PLACEHOLDER_DATE_SENTINEL = '_pending first run_';

// Keys the verify script expects on every non-fail evidence JSON. Their
// presence is the shape guard that separates a genuine capacity-run artefact
// from a hand-written fabrication. Shapes are checked; values are not
// signed — the controls that matter are table-to-file cross-referencing and
// mandatory tier metadata on certification-tier claims.
const REQUIRED_EVIDENCE_KEYS = ['ok', 'reportMeta', 'summary', 'failures', 'thresholds', 'safety'];

// Round 7 Finding 1 (P1): reportMeta.commit MUST be a full 40-char hex SHA.
// `git cat-file -e <abbrev>^{commit}` resolves abbreviations, so a 7-char
// prefix of any real commit (for example the PR's own merge-commit prefix)
// would otherwise satisfy the existence probe. The format gate runs before
// any git helper so operators cannot exploit abbreviation resolution. Accept
// upper- or lower-case hex; the value is not rewritten — the probe uses it
// verbatim.
const COMMIT_SHA_REGEX = /^[0-9a-f]{40}$/i;

// Row commit cells are copied from evidence and should be hex prefixes (7..40
// chars inclusive). Tightening from the legacy length-only check rejects ref
// syntax like "HEAD", "master", "@{upstream}", and non-hex garbage that
// happens to exceed 7 characters.
const COMMIT_PREFIX_REGEX = /^[0-9a-f]{7,40}$/i;

const EXIT_OK = 0;
const EXIT_GATE_FAIL = 1;
const EXIT_USAGE_ERROR = 2;

/**
 * Parse the Capacity Evidence table out of docs/operations/capacity.md.
 * Returns an array of row objects. Missing trailing cells are recorded as
 * empty strings so downstream logic can report the drift explicitly; the
 * parser never throws on a short row (older short rows were the class of bug
 * that let fabricated rows slip past).
 */
export function parseEvidenceTable(markdown) {
  const lines = markdown.split(/\r?\n/);
  const rows = [];
  let inTable = false;
  let headerSeen = false;
  for (const line of lines) {
    if (line.startsWith('## Capacity Evidence')) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (line.startsWith('## ')) break;
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (!cells.length) continue;
    if (!headerSeen) {
      headerSeen = cells[0].toLowerCase() === 'date';
      continue;
    }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;

    const pick = (index) => (index < cells.length ? cells[index] : '');
    rows.push({
      date: pick(0),
      commit: pick(1),
      env: pick(2),
      plan: pick(3),
      learners: pick(4),
      burst: pick(5),
      rounds: pick(6),
      p95Bootstrap: pick(7),
      p95Command: pick(8),
      maxBytes: pick(9),
      count5xx: pick(10),
      signals: pick(11),
      decision: pick(12),
      evidence: pick(13),
      cellCount: cells.length,
      raw: line,
    });
  }
  return rows;
}

function isPlaceholderRow(row) {
  return row.date.includes(PLACEHOLDER_DATE_SENTINEL);
}

export function extractEvidencePath(evidenceCell) {
  // Accept bare paths and Markdown `[label](path)` links.
  const linkMatch = evidenceCell.match(/\((reports\/capacity\/[^)]+)\)/);
  if (linkMatch) return linkMatch[1];
  const pathMatch = evidenceCell.match(/(reports\/capacity\/\S+)/);
  if (pathMatch) return pathMatch[1];
  return null;
}

/**
 * Round 5 Finding 2 (Medium): structural coherence checks on the payload
 * summary before we trust any of its values. This is a cheap defence against
 * full-payload fabrication where the summary is internally consistent with
 * itself (thresholds and failures agreeing) but inconsistent with its own
 * arithmetic (totalRequests not matching endpoint sample counts, or timings
 * flipped). Full cryptographic signing remains a future mitigation; this
 * catches the low-effort hand-authoring routes.
 *
 * Returns an array of failure messages. If the array is non-empty, callers
 * should short-circuit downstream recomputation because the summary is
 * untrustworthy.
 */
function checkStructuralCoherence(payload) {
  const messages = [];
  const summary = payload.summary || {};

  // Arithmetic identity: totalRequests must equal the sum of perEndpoint
  // sampleCount. `sampleCount` is the canonical field the load-test records;
  // `count` is a legacy alias and is consulted as a fallback so pre-existing
  // evidence stays compatible.
  const topTotal = Number(
    payload.totalRequests !== undefined ? payload.totalRequests : summary.totalRequests,
  );
  if (Number.isFinite(topTotal)) {
    const endpoints = summary.endpoints || {};
    const endpointKeys = Object.keys(endpoints);
    if (endpointKeys.length > 0) {
      let sum = 0;
      let haveCount = false;
      for (const key of endpointKeys) {
        const entry = endpoints[key] || {};
        const n = Number(
          entry.sampleCount !== undefined ? entry.sampleCount : entry.count,
        );
        if (Number.isFinite(n)) {
          sum += n;
          haveCount = true;
        }
      }
      if (haveCount && sum !== topTotal) {
        messages.push(
          `summary.totalRequests=${topTotal} does not match sum(endpoint.sampleCount)=${sum}. `
          + 'The arithmetic identity is broken; evidence must be produced by the load-test, not hand-authored.',
        );
      }
    }
  }

  // Timing ordering: both startedAt and finishedAt must be ISO timestamps and
  // finishedAt must not precede startedAt. A run where the clock went
  // backwards is a red flag. Missing timings are advisory and do not fail
  // here — the load-test always records them, so missing values would show up
  // as a separate class of drift.
  const startedAt = summary.startedAt ?? payload.reportMeta?.startedAt;
  const finishedAt = summary.finishedAt ?? payload.reportMeta?.finishedAt;
  if (startedAt !== undefined && startedAt !== null) {
    const startedMs = Date.parse(String(startedAt));
    if (!Number.isFinite(startedMs)) {
      messages.push(
        `summary.startedAt "${startedAt}" is not a parseable ISO timestamp.`,
      );
    } else if (finishedAt !== undefined && finishedAt !== null) {
      const finishedMs = Date.parse(String(finishedAt));
      if (!Number.isFinite(finishedMs)) {
        messages.push(
          `summary.finishedAt "${finishedAt}" is not a parseable ISO timestamp.`,
        );
      } else if (finishedMs < startedMs) {
        messages.push(
          `summary.finishedAt "${finishedAt}" is before summary.startedAt "${startedAt}". `
          + 'Timings must be monotonic.',
        );
      }
    }
  } else if (finishedAt !== undefined && finishedAt !== null) {
    // finishedAt supplied without startedAt is itself a structural break; parse
    // to surface typos.
    const finishedMs = Date.parse(String(finishedAt));
    if (!Number.isFinite(finishedMs)) {
      messages.push(
        `summary.finishedAt "${finishedAt}" is not a parseable ISO timestamp.`,
      );
    }
  }

  return messages;
}

/**
 * Probe shallow-clone state. Shallow clones legitimately cannot resolve every
 * commit, so the ancestry check must tolerate unknown SHAs there. A full
 * clone that cannot resolve an evidence commit is a fabrication signal and
 * must fail closed (round 6 probe E).
 *
 * Returns `true` when the git CLI reports the current working tree is a
 * shallow clone. Returns `false` on any failure — treating an unreadable git
 * environment as "not shallow" is the safe default: we err towards failing
 * closed on unknown SHAs rather than silently tolerating them.
 */
function isShallowClone() {
  try {
    const out = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).toString().trim();
    return out === 'true';
  } catch {
    return false;
  }
}

/**
 * Probe whether `evidenceCommit` exists in the local git object database.
 * `git cat-file -e <sha>^{commit}` exits 0 when the object is present and
 * non-zero when it is not — which is what we use to distinguish a legitimate
 * SHA the clone simply does not have (shallow depth) from a fabricated SHA
 * that no clone will ever resolve.
 *
 * Returns one of:
 *  - `'present'` — the commit is known locally.
 *  - `'missing'` — git replied but the object is not here.
 *  - `'unknown'` — git could not be consulted (no repo, command failure). The
 *    caller must treat this as a soft state and degrade to a warning, because
 *    the commit MIGHT exist in a clone with history — we simply cannot tell.
 */
function probeCommitExists(evidenceCommit) {
  // Use execFileSync with an args array to avoid shell quoting pitfalls —
  // `^` is a shell escape character on Windows cmd and strips the following
  // brace, so the traditional `git cat-file -e <sha>^{commit}` string would
  // lose its `{commit}` suffix and silently fall through to the wrong branch.
  // execFileSync bypasses the shell entirely and hands git the args verbatim.
  try {
    execFileSync('git', ['cat-file', '-e', `${evidenceCommit}^{commit}`], {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 2000,
    });
    return 'present';
  } catch (error) {
    // A clean "object does not exist" reply from git is status 1 with a
    // "Not a valid object name" stderr. Other statuses (128 = fatal, unknown
    // repo) are "unknown" — the caller falls back to a warning so CI-shards
    // without the full object database stay working.
    const stderr = String(error?.stderr || '');
    if (error && (error.status === 1 || /Not a valid object name|bad revision|unknown revision/.test(stderr))) {
      return 'missing';
    }
    return 'unknown';
  }
}

/**
 * Probe whether a locally-present evidence commit is reachable from HEAD.
 * `git cat-file -e` only proves object-database presence; dangling commits can
 * survive locally for weeks and still disappear from a clean clone. Requiring
 * HEAD reachability keeps evidence provenance reproducible from the PR branch
 * and, after merge, from main history.
 */
function probeCommitReachableFromHead(evidenceCommit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', evidenceCommit, 'HEAD'], {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 2000,
    });
    return 'reachable';
  } catch (error) {
    if (error && error.status === 1) return 'unreachable';
    return 'unknown';
  }
}

/**
 * Round 7 Finding 2 (P1): probe whether the evidence commit exists in the
 * local git database. Previously the equivalent check lived INSIDE
 * `requireConfigAncestry`, which was only invoked when `tier.configPath` was
 * set. Smoke-pass rows (which never carry a configPath) therefore skipped
 * the existence probe entirely and accepted any well-formed 40-char hex SHA.
 * After the hoist, this helper runs for every non-placeholder non-fail row
 * whose commit passes the format gate.
 *
 * Returns `{ failures: string[], warnings: string[] }`:
 *   - present on full clone → no messages.
 *   - missing on full clone → failure (fabrication signal).
 *   - missing on shallow clone → warning (legitimate depth limit).
 *   - unknown (git unavailable) → warning (CI-without-history tolerance).
 */
function probeEvidenceCommitPresence(evidenceCommit) {
  const existence = probeCommitExists(evidenceCommit);
  if (existence === 'present') {
    const reachability = probeCommitReachableFromHead(evidenceCommit);
    if (reachability === 'reachable') {
      return { failures: [], warnings: [] };
    }
    if (reachability === 'unreachable') {
      if (isShallowClone()) {
        return {
          failures: [],
          warnings: [
            `evidence commit ${evidenceCommit.slice(0, 10)} exists locally but is not reachable from HEAD in this shallow clone. `
            + 'Verify the commit in a full clone before accepting the evidence.',
          ],
        };
      }
      return {
        failures: [
          `evidence commit ${evidenceCommit.slice(0, 10)} exists locally but is not reachable from HEAD; possible dangling local provenance. `
          + 'Evidence commits must be reachable from the PR branch or main history before they can be accepted.',
        ],
        warnings: [],
      };
    }
    return {
      failures: [],
      warnings: [
        `could not prove commit ${evidenceCommit.slice(0, 10)} is reachable from HEAD. `
        + 'Set CAPACITY_VERIFY_SKIP_ANCESTRY=1 to silence this warning only in justified shallow CI shards.',
      ],
    };
  }
  if (existence === 'missing') {
    if (isShallowClone()) {
      return {
        failures: [],
        warnings: [
          `evidence commit ${evidenceCommit.slice(0, 10)} is not in the local clone, but the repo is shallow. `
          + 'Set CAPACITY_VERIFY_SKIP_ANCESTRY=1 in CI if this is a known shallow shard.',
        ],
      };
    }
    return {
      failures: [
        `evidence commit ${evidenceCommit.slice(0, 10)} does not exist in repo history; possible fabrication. `
        + 'Full clones must resolve the evidence commit before it can be accepted.',
      ],
      warnings: [],
    };
  }
  // 'unknown' — git could not be consulted (no repo, permission issue, etc.).
  return {
    failures: [],
    warnings: [
      `could not probe commit ${evidenceCommit.slice(0, 10)}: git unavailable. `
      + 'Set CAPACITY_VERIFY_SKIP_ANCESTRY=1 to silence this warning.',
    ],
  };
}

/**
 * Round 5 Finding 4 (Low): confirm the committed tier config commit is an
 * ancestor of the evidence commit. Catches the rebase-race route where a
 * config-loosening PR merges between an evidence run and its row commit: the
 * evidence cites the pre-merge SHA but the committed config would be the
 * post-merge loosened one.
 *
 * Round 6 Finding 2 (P1): closes the fabricated-SHA bypass. The previous
 * helper treated ALL git-errors from `merge-base --is-ancestor` as warnings,
 * so an operator could submit a plausible 40-char hex SHA that no clone
 * contains and sail through with warnings only. The helper now:
 *   1. detects shallow clones via `git rev-parse --is-shallow-repository`,
 *   2. relies on the hoisted `probeEvidenceCommitPresence` check (round 7)
 *      to have already rejected fabricated SHAs on full clones,
 *   3. degrades to a warning on shallow clones or unreadable git state so
 *      CI-without-history shards keep working.
 *
 * Round 6 Finding 1 (P1): when CAPACITY_VERIFY_SKIP_ANCESTRY=1 disables the
 * check we now emit an audit warning naming the env var. Previously the skip
 * path returned silently, leaving no trace an operator had bypassed the
 * check.
 *
 * Round 7 Finding 2 (P1): commit-existence probing hoisted to caller so
 * smoke-pass rows (no configPath, no ancestry call) still get the existence
 * check. `requireConfigAncestry` therefore focuses on the merge-base
 * comparison only; the caller has already surfaced any missing-commit
 * failure or warning.
 *
 * Returns an object `{ failures: string[], warnings: string[] }`. Callers push
 * failures into the row's message list; warnings are printed via console.warn
 * and surfaced in the JSON envelope so they are visible but non-fatal.
 */
function requireConfigAncestry(configRelativePath, evidenceCommit) {
  if (process.env.CAPACITY_VERIFY_SKIP_ANCESTRY === '1') {
    return {
      failures: [],
      warnings: [
        'ancestry check disabled via CAPACITY_VERIFY_SKIP_ANCESTRY=1 — justified only for shallow-clone CI shards',
      ],
    };
  }
  if (!evidenceCommit || evidenceCommit === 'unknown') {
    return {
      failures: [],
      warnings: [
        `ancestry check skipped: evidence commit is "${evidenceCommit || 'missing'}". `
        + 'Set CAPACITY_VERIFY_SKIP_ANCESTRY=1 to silence this warning.',
      ],
    };
  }
  let configCommit;
  try {
    configCommit = execSync(`git log -n 1 --format=%H -- ${JSON.stringify(configRelativePath)}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).toString().trim();
  } catch {
    return {
      failures: [],
      warnings: [
        `ancestry check skipped: git log failed for ${configRelativePath} (no history or not in a repo). `
        + 'Set CAPACITY_VERIFY_SKIP_ANCESTRY=1 to silence this warning.',
      ],
    };
  }
  if (!configCommit || !/^[0-9a-f]{7,40}$/i.test(configCommit)) {
    return {
      failures: [],
      warnings: [
        `ancestry check skipped: git log returned no commit for ${configRelativePath}.`,
      ],
    };
  }
  // Round 7 (P1): commit existence is resolved by the caller via
  // `probeEvidenceCommitPresence`. If the commit is missing locally the
  // caller has already emitted either a failure (full clone) or a warning
  // (shallow). Re-probe silently here and skip merge-base for missing
  // commits so we do not emit a duplicate "could not resolve" warning.
  const existence = probeCommitExists(evidenceCommit);
  if (existence !== 'present') {
    return { failures: [], warnings: [] };
  }
  try {
    // --is-ancestor exits 0 if the first SHA is an ancestor of the second, 1
    // otherwise. execSync throws on non-zero exit; we distinguish the
    // "definitely not an ancestor" outcome from the "git error" outcome by
    // checking the thrown `status` field. Commit existence has already been
    // resolved above, so status other than 0 or 1 only happens on real git
    // failures and is treated as a warning to preserve shallow-CI behaviour.
    execSync(`git merge-base --is-ancestor ${configCommit} ${evidenceCommit}`, {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 2000,
    });
    return { failures: [], warnings: [] };
  } catch (error) {
    if (error && error.status === 1) {
      return {
        failures: [
          `config ${configRelativePath} was modified after evidence commit; possible rebase-race. `
          + `config commit ${configCommit.slice(0, 10)} is not an ancestor of evidence commit ${evidenceCommit.slice(0, 10)}.`,
        ],
        warnings: [],
      };
    }
    return {
      failures: [],
      warnings: [
        `ancestry check could not resolve ${evidenceCommit.slice(0, 10)} in the local repo: ${error?.message || 'unknown git error'}. `
        + 'Set CAPACITY_VERIFY_SKIP_ANCESTRY=1 to silence this warning.',
      ],
    };
  }
}

/**
 * Cross-check the committed tier config file against evidence.thresholds and
 * evidence.tier.tier. Closes the "local-tamper-don't-push" fabrication route:
 * an operator who locally edits the config to weaken thresholds, runs, and
 * commits only the evidence would otherwise pass the existing path check.
 *
 * Returns an array of failure messages; empty on a clean cross-check.
 */
function compareConfigAgainstEvidence(absoluteConfigPath, payload, rowDecision) {
  const messages = [];
  let config;
  try {
    config = JSON.parse(readFileSync(absoluteConfigPath, 'utf8'));
  } catch (error) {
    messages.push(`tier config file is not valid JSON: ${error.message}`);
    return messages;
  }

  // Committed tier configs MUST declare a tier value. A config without a
  // declared tier would let an operator commit `{thresholds: {max5xx: 999}}`
  // and cite it from any tier row — the cross-check would find matching
  // thresholds but learn nothing about which tier those thresholds were
  // reviewed for.
  if (!config.tier) {
    messages.push(
      `tier config "${absoluteConfigPath}" is missing a top-level \`tier\` field. `
      + 'Every config under reports/capacity/configs/ must declare the tier it backs.',
    );
  } else if (config.tier !== rowDecision) {
    messages.push(
      `tier config "${absoluteConfigPath}" declares tier "${config.tier}"; `
      + `row claims "${rowDecision}".`,
    );
  }

  const configThresholds = config.thresholds || {};
  const evidenceThresholds = payload.thresholds || {};
  const evidenceLimits = evidenceThresholds.limits && typeof evidenceThresholds.limits === 'object' && !Array.isArray(evidenceThresholds.limits)
    ? evidenceThresholds.limits
    : null;

  // `classroom-load-test.mjs` merges the per-key threshold map (U1 shape) with
  // legacy PR #177 block-level summary keys (`configured`, `violations`,
  // `limits`) into the same `thresholds` object so two test harnesses can
  // probe their distinct shapes off one report. Strip those summary keys from
  // the cross-check so verify does not flag them as "evidence has threshold X
  // not in config".
  const LEGACY_THRESHOLD_SUMMARY_KEYS = new Set(['configured', 'violations', 'limits']);

  // Union of keys: iterate BOTH directions so a threshold that appears on
  // one side but not the other is caught. A PR that deletes a key from the
  // committed config while the evidence still references it (or vice versa)
  // indicates config/evidence drift.
  const allKeys = new Set([
    ...Object.keys(configThresholds).filter((key) => !LEGACY_THRESHOLD_SUMMARY_KEYS.has(key)),
    ...Object.keys(evidenceThresholds).filter((key) => !LEGACY_THRESHOLD_SUMMARY_KEYS.has(key)),
  ]);
  for (const key of allKeys) {
    const configValue = configThresholds[key];
    const evidenceEntry = evidenceThresholds[key];
    const configPresent = key in configThresholds;
    const evidencePresent = key in evidenceThresholds;

    if (configPresent && !evidencePresent) {
      messages.push(
        `tier config declares threshold "${key}" but evidence omits it. `
        + 'Evidence must have been produced with the config currently committed.',
      );
      continue;
    }
    if (evidencePresent && !configPresent) {
      // Evidence has a threshold the committed config does not. This can
      // happen legitimately via CLI override; we still surface it so
      // operators notice drift between intent (config) and runtime (CLI).
      messages.push(
        `evidence records threshold "${key}" but committed config omits it. `
        + 'CLI overrides are permitted but should be codified in the tier config.',
      );
      continue;
    }

    const configured = evidenceEntry.configured;
    if (evidenceLimits && Object.prototype.hasOwnProperty.call(evidenceLimits, key)) {
      const limitValue = evidenceLimits[key];
      const limitsMatch = typeof configured === 'boolean'
        ? Boolean(limitValue) === configured
        : Number(limitValue) === Number(configured);
      if (!limitsMatch) {
        messages.push(
          `evidence.thresholds.limits.${key} = ${limitValue} but evidence.thresholds.${key}.configured = ${configured}. `
          + 'The summary limits block must agree with the per-threshold gate result.',
        );
      }
    }
    if (typeof configValue === 'boolean') {
      if (configValue !== Boolean(configured)) {
        messages.push(
          `tier config "${key}" = ${configValue} but evidence.thresholds.${key}.configured = ${configured}. `
          + 'The config committed to git must match the thresholds the evidence was gated against.',
        );
      }
      continue;
    }
    if (Number(configValue) !== Number(configured)) {
      messages.push(
        `tier config "${key}" = ${configValue} but evidence.thresholds.${key}.configured = ${configured}. `
        + 'This is the local-tamper-without-pushing fabrication route — '
        + 'evidence must be produced against the committed config values.',
      );
    }
  }

  // Honour config-declared minimum evidence schema version. Previously the
  // hardcoded `schemaVersion < 2` only gated classroom-tier rows; a config
  // that declares `minEvidenceSchemaVersion: 3` would have had no effect.
  const declaredMin = Number(config.minEvidenceSchemaVersion);
  if (Number.isFinite(declaredMin) && declaredMin > 0) {
    const evidenceSchema = Number(payload.reportMeta?.evidenceSchemaVersion);
    if (Number.isFinite(evidenceSchema) && evidenceSchema < declaredMin) {
      messages.push(
        `tier config declares minEvidenceSchemaVersion ${declaredMin}; `
        + `evidence has v${evidenceSchema}. Regenerate the evidence with a tool at the required schema.`,
      );
    }
  }

  // Round 5 Finding 3 (Medium): enforce the plan's minimum threshold keys per
  // tier. An empty `thresholds: {}` previously passed silently because the
  // union-of-keys loop above is a no-op when both sides are empty. The tier
  // promise (5xx=0, latency bounds, bytes cap) must be codified by the
  // committed config, not by run-time CLI flags that leave no audit trail.
  const requiredKeys = REQUIRED_THRESHOLD_KEYS_PER_TIER.get(rowDecision);
  if (requiredKeys) {
    const missingRequired = requiredKeys.filter((key) => !(key in configThresholds));
    if (missingRequired.length) {
      messages.push(
        `tier config "${absoluteConfigPath}" for tier "${rowDecision}" is missing required threshold key(s): ${missingRequired.join(', ')}. `
        + `Tier "${rowDecision}" must declare at minimum: ${requiredKeys.join(', ')}.`,
      );
    }
  }
  return messages;
}

/**
 * Re-run threshold evaluation at verify time and assert the recomputed
 * `failures` array matches the payload. Closes the "failures-array laundering"
 * adversarial route: an operator who edits `evidence.failures` to empty and
 * flips individual `thresholds[key].passed: true` would otherwise have the
 * cross-check accept the evidence at face value.
 *
 * The re-evaluation uses the payload's own summary and reconstructs threshold
 * config from the *configured* values recorded in evidence, then compares the
 * recomputed outcome to the payload's claims.
 */
function recomputeFailures(payload) {
  const messages = [];
  const summary = payload.summary || {};
  const thresholds = payload.thresholds || {};
  // Reconstruct threshold input from evidence.thresholds.<name>.configured.
  const reconstructed = {};
  for (const [name, entry] of Object.entries(thresholds)) {
    if (entry && entry.configured !== undefined && entry.configured !== null) {
      reconstructed[name] = entry.configured;
    }
  }
  const dryRun = Boolean(payload.dryRun);
  const { thresholds: recomputed, failures: recomputedFailures } = evaluateThresholds(
    summary,
    reconstructed,
    { dryRun },
  );

  // Compare recomputed pass/fail for each threshold to the payload's claims.
  for (const [name, entry] of Object.entries(thresholds)) {
    const recomputedEntry = recomputed[name];
    if (!recomputedEntry) continue;
    if (Boolean(recomputedEntry.passed) !== Boolean(entry.passed)) {
      messages.push(
        `threshold "${name}" claims passed=${entry.passed} but recomputation says passed=${recomputedEntry.passed}. `
        + 'Evidence.thresholds.<name>.passed must reflect the observed data — hand-edits are rejected.',
      );
    }
  }

  // Compare the claimed failures list to the recomputed list.
  const claimedFailures = Array.isArray(payload.failures) ? [...payload.failures].sort() : [];
  const actualFailures = [...recomputedFailures].sort();
  if (JSON.stringify(claimedFailures) !== JSON.stringify(actualFailures)) {
    messages.push(
      `evidence.failures claims [${claimedFailures.join(', ') || '<none>'}] but recomputation yields [${actualFailures.join(', ') || '<none>'}]. `
      + 'The failures array was tampered with after the run.',
    );
  }
  return messages;
}

/**
 * Cross-check the numeric cells in a capacity.md row against the evidence
 * payload. An operator who writes a tier row with nice-looking metrics but
 * points at an unrelated evidence file will trip this check.
 *
 * Cells compared:
 * - learners, bootstrapBurst, rounds (from reportMeta)
 * - 5xx count (from summary.signals.server5xx)
 * - P95 bootstrap, P95 command (from summary.endpoints)
 * - Max response bytes (from summary.endpoints — max across all endpoints)
 *
 * Latency and bytes use exact equality because capacity.md cells are copied
 * from the evidence at row-authoring time; a mismatch means either the row
 * was written against a different evidence file or the numbers were
 * fabricated. Per-millisecond flakiness across different runs is not a
 * concern — each tier row cites one specific run.
 */
function checkNumericDrift(row, payload) {
  const messages = [];
  const meta = payload.reportMeta || {};
  const summary = payload.summary || {};
  const signals = summary.signals || {};
  const endpoints = summary.endpoints || {};
  const bootstrapKey = Object.keys(endpoints).find((key) => key.endsWith('/api/bootstrap'));
  const commandKey = Object.keys(endpoints).find((key) => /subjects\/.*\/command/.test(key));
  const bootstrap = bootstrapKey ? endpoints[bootstrapKey] : null;
  const command = commandKey ? endpoints[commandKey] : null;

  const compare = (rowValue, evidenceValue, label) => {
    if (!rowValue || rowValue === '—') return;
    const rowNum = Number(rowValue);
    if (!Number.isFinite(rowNum)) return;
    if (evidenceValue === null || evidenceValue === undefined) {
      messages.push(`evidence missing ${label} while row declares ${rowNum}.`);
      return;
    }
    const evidenceNum = Number(evidenceValue);
    if (!Number.isFinite(evidenceNum) || evidenceNum !== rowNum) {
      messages.push(
        `${label} mismatch: row=${rowNum} evidence=${evidenceValue}.`,
      );
    }
  };

  compare(row.learners, meta.learners, 'learners');
  compare(row.burst, meta.bootstrapBurst, 'bootstrapBurst');
  compare(row.rounds, meta.rounds, 'rounds');
  compare(row.count5xx, signals.server5xx || 0, 'server5xx');
  compare(row.p95Bootstrap, bootstrap?.p95WallMs, 'p95Bootstrap');
  compare(row.p95Command, command?.p95WallMs, 'p95Command');
  if (row.maxBytes && row.maxBytes !== '—') {
    const allBytes = Object.values(endpoints).map((e) => Number(e.maxResponseBytes) || 0);
    const evidenceMaxBytes = allBytes.length ? Math.max(...allBytes) : null;
    compare(row.maxBytes, evidenceMaxBytes, 'maxBytes');
  }

  return messages;
}

/**
 * P4 U8: Evidence provenance and anti-fabrication guard.
 *
 * Certifiable tiers (30-learner-beta-certified, 60-learner-stretch-certified,
 * 100-plus-certified) MUST carry a provenance block with:
 *   - gitSha not 'unknown'
 *   - dirtyTreeFlag not true
 *   - thresholdConfigHash matching the committed config file (when config present)
 *
 * Lower tiers (smoke-pass, small-pilot-provisional) accept missing provenance
 * for manual/local runs.
 *
 * Returns an array of failure messages; empty on a clean check.
 */
function checkProvenance(payload, rowDecision) {
  const messages = [];
  const provenance = payload.reportMeta?.provenance;
  const requiresProvenance = TIERS_ABOVE_SMALL_PILOT.has(rowDecision);

  // Lower tiers tolerate absent provenance.
  if (!provenance) {
    if (requiresProvenance) {
      messages.push(
        `tier "${rowDecision}" requires reportMeta.provenance for certification traceability. `
        + 'Evidence must be produced by a CI workflow, not hand-authored.',
      );
    }
    return messages;
  }

  // When provenance is present, validate its contents for certifiable tiers.
  if (requiresProvenance) {
    if (!provenance.gitSha || provenance.gitSha === 'unknown') {
      messages.push(
        `provenance.gitSha is "${provenance.gitSha || 'missing'}"; certifiable tiers require a resolved git SHA. `
        + 'Ensure the capacity run executes within a git repository.',
      );
    }
    if (provenance.dirtyTreeFlag === true) {
      messages.push(
        'provenance.dirtyTreeFlag is true; certifiable tiers require a clean git working tree. '
        + 'Commit all changes before running a certification capacity test.',
      );
    }
    // ADV-002: reject thresholdConfigHash='unknown' for certifiable tiers when
    // a configPath is present. Previously this value silently skipped the hash
    // cross-check below, so an attacker could hand-edit evidence to set the
    // hash to 'unknown' and bypass tamper detection entirely.
    if (payload.tier?.configPath && provenance.thresholdConfigHash === 'unknown') {
      messages.push(
        'provenance.thresholdConfigHash is unknown — config integrity cannot be verified for certifiable tiers',
      );
    }
  }

  // thresholdConfigHash cross-check: when the evidence records a configPath
  // AND provenance records a hash, re-hash the committed config and compare.
  // Mismatch means the config was tampered with after the run or the evidence
  // was generated against a different config file.
  const configPath = payload.tier?.configPath;
  if (configPath && provenance.thresholdConfigHash
      && provenance.thresholdConfigHash !== 'none'
      && provenance.thresholdConfigHash !== 'unknown') {
    const absoluteConfigPath = resolve(process.cwd(), configPath);
    if (existsSync(absoluteConfigPath)) {
      try {
        const content = readFileSync(absoluteConfigPath, 'utf8');
        const currentHash = createHash('sha256').update(content).digest('hex');
        if (currentHash !== provenance.thresholdConfigHash) {
          messages.push(
            `provenance.thresholdConfigHash mismatch: evidence recorded "${provenance.thresholdConfigHash.slice(0, 16)}..." `
            + `but committed config "${configPath}" now hashes to "${currentHash.slice(0, 16)}...". `
            + 'The config file was modified after the evidence was produced; regenerate the evidence.',
          );
        }
      } catch {
        // Cannot read config for hash comparison — surface but do not fail.
        // The config-existence check elsewhere will catch missing files.
      }
    }
  }

  return messages;
}

function checkWorkerLogDiagnosticBoundaries(payload) {
  const messages = [];
  const join = payload.diagnostics?.workerLogJoin;
  if (!join || typeof join !== 'object' || Array.isArray(join)) return messages;

  const certification = join.certification || {};
  if (
    join.contributesToCertification === true
    || certification.contributesToCertification === true
    || certification.certifying === true
    || certification.promotesCertification === true
  ) {
    messages.push(
      'diagnostics.workerLogJoin is diagnostic-only; joined Cloudflare CPU/wall data must not contribute to certification.',
    );
  }

  const samples = Array.isArray(join.samples) ? join.samples : [];
  for (const [index, sample] of samples.entries()) {
    const invocationStatus = sample?.join?.invocation?.status || 'missing';
    const missingInvocation = invocationStatus !== 'matched'
      || !isStrictFiniteDiagnosticNumber(sample?.cloudflare?.cpuTimeMs)
      || !isStrictFiniteDiagnosticNumber(sample?.cloudflare?.wallTimeMs);
    if (missingInvocation && sample?.classification !== P1_UNCLASSIFIED_INSUFFICIENT_LOGS) {
      messages.push(
        `diagnostics.workerLogJoin.samples[${index}] is missing invocation CPU/wall logs but classification is "${sample?.classification || 'missing'}"; expected "${P1_UNCLASSIFIED_INSUFFICIENT_LOGS}".`,
      );
    }
  }

  return messages;
}

function isStrictFiniteDiagnosticNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return false;
  }
  const n = Number(value);
  return Number.isFinite(n);
}

/**
 * Verify a single evidence row against its persisted JSON file.
 * Returns `{ ok, messages: string[], warnings: string[] }` where `ok: false`
 * means the row fails the cross-check. `warnings` surface non-fatal concerns
 * (e.g. git ancestry check could not resolve) so CI still completes.
 */
export function verifyEvidenceRow(row) {
  const messages = [];
  const warnings = [];
  if (isPlaceholderRow(row)) {
    return { ok: true, messages: ['placeholder row — skipped'], warnings };
  }

  if (!DECISION_TIERS.has(row.decision)) {
    messages.push(
      `decision "${row.decision}" is not one of: ${[...DECISION_TIERS].join(', ')}`,
    );
    return { ok: false, messages, warnings };
  }

  // A row should always have 14 cells. Short rows point at markdown drift
  // rather than a legitimate claim; fail them explicitly so the parser cannot
  // be used to smuggle a row through by dropping columns.
  if (row.cellCount < 14) {
    messages.push(`row has ${row.cellCount} cells; expected 14 (Date..Evidence)`);
    return { ok: false, messages, warnings };
  }

  // `fail` decisions are not backed by evidence files and do not support a
  // claim: they record a failed run for audit. Skip the remaining checks.
  if (row.decision === 'fail') {
    return { ok: true, messages: [], warnings };
  }

  const evidencePath = extractEvidencePath(row.evidence);
  if (!evidencePath) {
    messages.push(`missing evidence path; Evidence cell: "${row.evidence}"`);
    return { ok: false, messages, warnings };
  }

  const absolute = resolve(process.cwd(), evidencePath);
  if (!existsSync(absolute)) {
    messages.push(`evidence file not found: ${evidencePath}`);
    return { ok: false, messages, warnings };
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (error) {
    messages.push(`evidence file is not valid JSON: ${error.message}`);
    return { ok: false, messages, warnings };
  }

  // Shape guard: a hand-written fabrication missing any of these keys is
  // rejected. Values are checked below where they matter (ok, commit, tier,
  // schemaVersion); the shape itself is the first line of defence against
  // someone writing `{"ok":true,"reportMeta":{"commit":"x","evidenceSchemaVersion":2}}`
  // and calling it `100-plus-certified`.
  const missingKeys = REQUIRED_EVIDENCE_KEYS.filter((key) => !(key in payload));
  if (missingKeys.length) {
    messages.push(
      `evidence JSON missing required key(s): ${missingKeys.join(', ')}. `
      + 'Evidence must be produced by scripts/classroom-load-test.mjs or scripts/probe-production-bootstrap.mjs --output, not hand-edited.',
    );
  }

  // Round 7 Finding 1 (P1): reject reportMeta.commit values that are not a
  // full 40-char hex SHA. `git cat-file -e <abbrev>^{commit}` honours
  // abbreviation resolution, so a 7-char prefix of any real commit would
  // otherwise satisfy the existence probe. This gate fires BEFORE any git
  // helper runs so operators cannot exploit abbreviation resolution. The
  // check is additive: other checks (report.ok, schema version, tier cross-
  // reference) still run so their messages surface too — but the downstream
  // git probes are gated on this flag so we never hand git an abbreviation.
  const evidenceCommitValue = payload.reportMeta?.commit;
  const evidenceCommitString = typeof evidenceCommitValue === 'string' ? evidenceCommitValue : '';
  const evidenceCommitFormatValid = COMMIT_SHA_REGEX.test(evidenceCommitString);
  if (!evidenceCommitFormatValid) {
    messages.push(
      `reportMeta.commit must be a 40-char hex SHA, got ${JSON.stringify(evidenceCommitValue)}. `
      + 'Evidence must carry the full commit SHA; abbreviated or ref-syntax values are rejected.',
    );
  }

  if (payload.ok !== true) {
    messages.push(`evidence file report.ok is not true (found ${payload.ok})`);
  }

  // Round 5 Finding 1 (High): dryRun:true must not back any decision above
  // smoke-pass. A true dry-run produces no observed latency, so gateUpperBound
  // reports passed=true for null latency — legitimate for previewing a pinned
  // config, illegitimate for any tier that promises measured behaviour. Any
  // of small-pilot-provisional and the three classroom tiers must be backed
  // by a real run.
  if (payload.dryRun === true && TIERS_ABOVE_SMOKE_PASS.has(row.decision)) {
    messages.push(
      `dryRun:true cannot back a non-smoke-pass decision ("${row.decision}"). `
      + 'Dry-run previews are only valid for smoke-pass rows; certification tiers require a real run.',
    );
  }

  const evidenceCommitRaw = evidenceCommitString;
  const rowCommitRaw = String(row.commit || '').trim();
  if (rowCommitRaw && rowCommitRaw !== '—') {
    // Round 7 Finding 1 (P1): row commit cell is tightened from a length-only
    // check to a hex-prefix format gate. Values like "HEAD", "master",
    // "@{upstream}", or "HEAD123" used to satisfy length >= 7 and then sneak
    // through to `evidenceCommitRaw.startsWith(rowCommitRaw)` with
    // startsWith's string matching. The format gate rejects anything that
    // isn't 7..40 hex characters before any comparison runs.
    if (rowCommitRaw.length < 7) {
      messages.push(
        `row commit "${rowCommitRaw}" is too short; use at least 7 hex chars.`,
      );
    } else if (!COMMIT_PREFIX_REGEX.test(rowCommitRaw)) {
      messages.push(
        `row commit "${rowCommitRaw}" is not a valid hex SHA prefix; use 7..40 hex chars.`,
      );
    } else if (!evidenceCommitRaw.startsWith(rowCommitRaw)) {
      messages.push(`commit mismatch: row=${rowCommitRaw} evidence=${evidenceCommitRaw || 'unknown'}`);
    }
  }

  const schemaVersion = Number(payload.reportMeta?.evidenceSchemaVersion);
  if (!Number.isFinite(schemaVersion) || schemaVersion < 1) {
    messages.push(
      `evidenceSchemaVersion is missing or invalid (found: ${JSON.stringify(payload.reportMeta?.evidenceSchemaVersion)}). `
      + 'Evidence must carry a numeric schema version (v1 = pre-P4, v2 = P4 U1+).',
    );
  }
  // Reject a future-schema-version value we don't know how to verify; this
  // prevents an operator from hand-editing a schema version higher than the
  // tool's compiled-in ceiling to unlock gates the tool cannot yet enforce.
  // The compiled-in `EVIDENCE_SCHEMA_VERSION` constant is the authoritative
  // ceiling.
  if (Number.isFinite(schemaVersion) && schemaVersion > EVIDENCE_SCHEMA_VERSION) {
    messages.push(
      `evidenceSchemaVersion ${schemaVersion} is higher than the current tool version (${EVIDENCE_SCHEMA_VERSION}). `
      + 'Upgrade the verify script to the deploy that ships that schema, or regenerate the evidence.',
    );
  }
  if (TIERS_ABOVE_SMALL_PILOT.has(row.decision) && schemaVersion < 2) {
    messages.push(
      `tier "${row.decision}" requires evidenceSchemaVersion >= 2; found v${Number.isFinite(schemaVersion) ? schemaVersion : 'unknown'}. `
      + 'Bootstrap capacity telemetry (queryCount, d1RowsRead) is required for classroom-tier claims.',
    );
  }

  // Cross-check decision against tier metadata when present. Every
  // certification-tier run (learners >= 20) MUST be invoked with
  // `--config reports/capacity/configs/<tier>.json`, which writes
  // `payload.tier.tier` and `payload.tier.configPath` into the evidence file.
  if (TIERS_ABOVE_SMALL_PILOT.has(row.decision)) {
    const evidenceTier = payload.tier?.tier;
    if (!evidenceTier) {
      messages.push(
        `tier "${row.decision}" requires evidence produced with --config reports/capacity/configs/<tier>.json. `
        + 'Evidence file is missing tier.tier.',
      );
    } else if (evidenceTier !== row.decision) {
      messages.push(
        `tier mismatch: row claims "${row.decision}" but evidence tier.tier is "${evidenceTier}".`,
      );
    }
    if (!payload.tier?.configPath) {
      messages.push(
        `tier "${row.decision}" requires evidence to record tier.configPath. `
        + 'Re-run with --config reports/capacity/configs/<tier>.json.',
      );
    }
  }

  // Round 7 Finding 2 (P1): probe evidence commit presence for EVERY
  // non-placeholder non-fail row — not only rows with a tier.configPath.
  // Previously this check lived inside `requireConfigAncestry`, which was
  // only called when `configPath` was set. Smoke-pass rows therefore skipped
  // the existence probe and accepted any well-formed 40-char hex SHA.
  //
  // Round 8 Finding 1 (P1): the existence probe MUST NOT honour
  // CAPACITY_VERIFY_SKIP_ANCESTRY. That env var was originally the shallow-
  // clone escape hatch for the merge-base rebase-race ancestry check; r7
  // inadvertently also gated the fabricated-SHA detector behind it, so
  // `CAPACITY_VERIFY_SKIP_ANCESTRY=1` silently disabled the detector on full
  // clones and let a forged 40-char hex SHA through with no warnings. The
  // existence probe is now gated ONLY by its own shallow-clone detection
  // (see `probeEvidenceCommitPresence` → `isShallowClone()`): shallow clones
  // degrade to a warning, full clones fail closed unconditionally. The env
  // var's remaining scope is the merge-base check inside
  // `requireConfigAncestry`, which is the only place it has ever truly
  // needed to live.
  if (evidenceCommitFormatValid) {
    const presence = probeEvidenceCommitPresence(evidenceCommitString);
    if (presence.failures.length) messages.push(...presence.failures);
    if (presence.warnings.length) {
      for (const warning of presence.warnings) {
        warnings.push(warning);
        console.warn(`[capacity-verify] ${warning}`);
      }
    }
  }

  // Config path + content cross-checks run whenever evidence records a
  // tier.configPath (applies to both small-pilot rows that opted into
  // --config and classroom-tier rows that are required to use --config).
  // Guards against a loose --config path and the "local-tamper-don't-push"
  // fabrication route where an operator relaxes a committed config locally,
  // runs, and commits only the evidence.
  const configPath = payload.tier?.configPath;
  if (configPath) {
    const normalisedConfigPath = relative(process.cwd(), resolve(process.cwd(), configPath)).replaceAll('\\', '/');
    if (!normalisedConfigPath.startsWith(`${TIER_CONFIG_DIR}/`)) {
      messages.push(
        `tier config path "${configPath}" is outside ${TIER_CONFIG_DIR}/. `
        + 'Certification-tier runs must cite a PR-reviewed config.',
      );
    } else if (!existsSync(resolve(process.cwd(), configPath))) {
      messages.push(
        `tier config file referenced by evidence does not exist at ${configPath}.`,
      );
    } else {
      const configCrossCheck = compareConfigAgainstEvidence(
        resolve(process.cwd(), configPath),
        payload,
        row.decision,
      );
      if (configCrossCheck.length) messages.push(...configCrossCheck);

      // Round 5 Finding 4 (Low): ancestry check — the config commit that
      // last modified this file must be an ancestor of the evidence commit.
      // Uses the normalised relative path so `git log -- <path>` matches
      // the committed tree regardless of OS path separator.
      const ancestry = requireConfigAncestry(
        normalisedConfigPath,
        String(payload.reportMeta?.commit || ''),
      );
      if (ancestry.failures.length) messages.push(...ancestry.failures);
      if (ancestry.warnings.length) {
        for (const warning of ancestry.warnings) {
          warnings.push(warning);
          console.warn(`[capacity-verify] ${warning}`);
        }
      }
    }
  }

  // Round 5 Finding 2 (Medium): structural coherence BEFORE recomputation.
  // If summary arithmetic does not hold, recomputation would be re-deriving
  // threshold outcomes from fabricated inputs, so short-circuit that step.
  const coherenceFailures = checkStructuralCoherence(payload);
  if (coherenceFailures.length) {
    messages.push(...coherenceFailures);
  }

  // Provenance anti-fabrication guard (P4 U8). Certifiable tiers (above
  // small-pilot-provisional) MUST carry a provenance block with valid CI
  // metadata. Lower tiers (smoke-pass, small-pilot-provisional) accept
  // missing provenance for manual/local runs.
  const provenanceMessages = checkProvenance(payload, row.decision);
  if (provenanceMessages.length) {
    messages.push(...provenanceMessages);
  }

  const diagnosticBoundaryMessages = checkWorkerLogDiagnosticBoundaries(payload);
  if (diagnosticBoundaryMessages.length) {
    messages.push(...diagnosticBoundaryMessages);
  }

  // Cross-check numeric cells in the capacity.md row against evidence
  // summary. This makes it harder for a hand-edited row to claim a
  // tier-relevant metric (learners, burst, P95) that the backing evidence
  // never observed.
  const numericDrift = checkNumericDrift(row, payload);
  if (numericDrift.length) {
    messages.push(...numericDrift);
  }

  // Reject rows where the evidence reports any failed thresholds. A table
  // row stating a successful tier must not point at a run that recorded
  // threshold failures.
  if (Array.isArray(payload.failures) && payload.failures.length > 0) {
    messages.push(
      `evidence file records threshold failures: ${payload.failures.join(', ')}. `
      + 'Non-fail tier rows may only cite runs with failures: [].',
    );
  }

  // Re-run threshold evaluation at verify time and reject hand-edits that
  // empty `failures` or flip individual threshold `passed` flags. Without
  // this check, an operator could produce a failing run, edit the JSON, and
  // the committed-config cross-check would still accept values that match
  // the config — because it's the config vs evidence, not the summary vs
  // evidence. This closes that laundering route.
  //
  // Skip recomputation when structural coherence already failed; the summary
  // is untrustworthy so re-deriving from it would produce misleading output.
  if (!coherenceFailures.length) {
    messages.push(...recomputeFailures(payload));
  }

  return { ok: messages.length === 0, messages, warnings };
}

export function verifyCapacityDoc(docPath = CAPACITY_DOC_PATH) {
  const absolute = resolve(process.cwd(), docPath);
  if (!existsSync(absolute)) {
    return { ok: false, report: [`Capacity doc not found at ${docPath}`], warnings: [] };
  }
  const markdown = readFileSync(absolute, 'utf8');
  const rows = parseEvidenceTable(markdown);
  const report = [];
  const warnings = [];
  let ok = true;

  if (!rows.length) {
    report.push('No Capacity Evidence table rows found — doc may have drifted.');
    return { ok: false, report, rowCount: 0, warnings };
  }

  for (const [index, row] of rows.entries()) {
    const result = verifyEvidenceRow(row);
    if (result.warnings && result.warnings.length) {
      for (const warning of result.warnings) {
        warnings.push(`[row ${index + 1}] ${warning}`);
      }
    }
    if (!result.ok) {
      ok = false;
      for (const message of result.messages) {
        report.push(`[row ${index + 1}] ${message}`);
        report.push(`  source: ${row.raw}`);
      }
    }
  }
  return { ok, report, rowCount: rows.length, warnings };
}

function usage() {
  return [
    'Usage: node ./scripts/verify-capacity-evidence.mjs [options] [doc-path]',
    '',
    'Cross-checks the Capacity Evidence table in docs/operations/capacity.md',
    '(or <doc-path> if supplied) against its referenced JSON evidence files.',
    '',
    'Options:',
    '  --help, -h                 Print this usage summary.',
    '  --json                     Emit a machine-readable JSON report to stdout',
    '                             in addition to human-readable errors on stderr.',
    '',
    'Exit codes:',
    '  0  Verification passed (all rows consistent).',
    '  1  Verification failed (gate failure).',
    '  2  Usage error (unknown flag, bad invocation).',
  ].join('\n');
}

export function runVerify(argv = process.argv.slice(2)) {
  let docPath = CAPACITY_DOC_PATH;
  let emitJson = false;
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      return EXIT_OK;
    }
    if (arg === '--json') {
      emitJson = true;
      continue;
    }
    if (arg.startsWith('--')) {
      console.error(`Unknown option: ${arg}`);
      console.error(usage());
      return EXIT_USAGE_ERROR;
    }
    docPath = arg;
  }

  const { ok, report, rowCount, warnings } = verifyCapacityDoc(docPath);

  if (emitJson) {
    console.log(JSON.stringify({ ok, rowCount, messages: report, warnings: warnings || [] }, null, 2));
  }

  if (!ok) {
    if (!emitJson) {
      console.error('Capacity evidence verification FAILED.');
      for (const entry of report) console.error(`  ${entry}`);
    }
    return EXIT_GATE_FAIL;
  }
  if (!emitJson) {
    console.log(`Capacity evidence verification passed (${rowCount} row(s) checked).`);
  }
  return EXIT_OK;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runVerify();
}
