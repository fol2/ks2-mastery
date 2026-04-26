// Phase D / ADV-4 + SEC-Med (Phase D reviewer) coverage: demo sessions
// bypass `requireActiveAccount` + `requireMutationCapability`, and the
// auth-boundary denials emit a structured `capacity.auth.request_denied`
// log line with code + opsStatus.
//
// ADV-4 rationale: the P1.5 plan defers ops_status enforcement on demo
// accounts (line 89). Demo sessions have their own write-gating and
// cannot touch account-ops mutations, so ops_status would double-gate
// without benefit.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U14

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  requireActiveAccount,
  requireMutationCapability,
} from '../worker/src/auth.js';

function captureConsoleLog(fn) {
  const originalLog = console.log;
  const captured = [];
  console.log = (message) => {
    captured.push(typeof message === 'string' ? message : JSON.stringify(message));
  };
  try {
    fn();
  } finally {
    console.log = originalLog;
  }
  return captured;
}

test('ADV-4 — demo session with suspended metadata bypasses requireActiveAccount', () => {
  assert.doesNotThrow(() => {
    requireActiveAccount({
      accountId: 'demo-account-xyz',
      demo: true,
      opsStatus: 'suspended',
      statusRevision: 1,
      statusRevisionAtIssue: 1,
    });
  });
});

test('ADV-4 — demo session with payment_hold metadata bypasses requireMutationCapability', () => {
  assert.doesNotThrow(() => {
    requireMutationCapability({
      accountId: 'demo-account-xyz',
      demo: true,
      opsStatus: 'payment_hold',
    });
  });
});

test('ADV-4 — demo session with suspended metadata also bypasses requireMutationCapability', () => {
  assert.doesNotThrow(() => {
    requireMutationCapability({
      accountId: 'demo-account-xyz',
      demo: true,
      opsStatus: 'suspended',
    });
  });
});

test('ADV-4 — real (non-demo) suspended session is STILL blocked', () => {
  assert.throws(
    () => requireActiveAccount({
      accountId: 'adult-real-x',
      demo: false,
      opsStatus: 'suspended',
    }),
    { extra: { ok: false, code: 'account_suspended' } },
  );
});

test('SEC-Med — requireActiveAccount emits capacity.auth.request_denied on suspended block', () => {
  const captured = captureConsoleLog(() => {
    try {
      requireActiveAccount({
        accountId: 'adult-real-x',
        demo: false,
        opsStatus: 'suspended',
      });
    } catch (error) {
      // Expected throw — we only care about the log.
      assert.ok(error);
    }
  });
  const match = captured.find((line) => {
    try {
      const parsed = JSON.parse(line);
      return parsed.event === 'capacity.auth.request_denied';
    } catch {
      return false;
    }
  });
  assert.ok(match, `expected capacity.auth.request_denied log line; got: ${captured.join(' | ')}`);
  const parsed = JSON.parse(match);
  assert.equal(parsed.code, 'account_suspended');
  assert.equal(parsed.opsStatus, 'suspended');
});

test('SEC-Med — requireMutationCapability emits capacity.auth.request_denied on payment_hold block', () => {
  const captured = captureConsoleLog(() => {
    try {
      requireMutationCapability({
        accountId: 'adult-real-y',
        demo: false,
        opsStatus: 'payment_hold',
      });
    } catch (error) {
      assert.ok(error);
    }
  });
  const match = captured.find((line) => {
    try {
      const parsed = JSON.parse(line);
      return parsed.event === 'capacity.auth.request_denied';
    } catch {
      return false;
    }
  });
  assert.ok(match, 'expected capacity.auth.request_denied log line for payment_hold');
  const parsed = JSON.parse(match);
  assert.equal(parsed.code, 'account_payment_hold');
  assert.equal(parsed.opsStatus, 'payment_hold');
});

test('SEC-Med — requireMutationCapability emits capacity.auth.request_denied on suspended block', () => {
  const captured = captureConsoleLog(() => {
    try {
      requireMutationCapability({
        accountId: 'adult-real-z',
        demo: false,
        opsStatus: 'suspended',
      });
    } catch (error) {
      assert.ok(error);
    }
  });
  const match = captured.find((line) => {
    try {
      const parsed = JSON.parse(line);
      return parsed.event === 'capacity.auth.request_denied' && parsed.code === 'account_suspended';
    } catch {
      return false;
    }
  });
  assert.ok(match, 'expected capacity.auth.request_denied log line for suspended via mutation path');
});

test('SEC-Med — active session does NOT emit a denial log', () => {
  const captured = captureConsoleLog(() => {
    requireActiveAccount({ accountId: 'adult-active', demo: false, opsStatus: 'active' });
    requireMutationCapability({ accountId: 'adult-active', demo: false, opsStatus: 'active' });
  });
  const denials = captured.filter((line) => {
    try {
      return JSON.parse(line).event === 'capacity.auth.request_denied';
    } catch {
      return false;
    }
  });
  assert.equal(denials.length, 0, `expected zero denial logs on happy path; got ${denials.length}`);
});
