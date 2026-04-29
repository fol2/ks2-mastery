// Hero Mode P6 U2 — Camp command idempotency payload hash tests.
//
// Validates that the mutationPayloadHash includes command-specific identity
// (monsterId, branch, targetStage for camp commands; questId, taskId for
// claim-task). Without the payload field, two different Camp actions sharing
// a requestId would produce the same hash and replay the wrong response.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mutationPayloadHash } from '../worker/src/repository-helpers.js';

describe('Hero command idempotency payload hash', () => {
  describe('camp commands (unlock-monster / evolve-monster)', () => {
    const baseCommand = {
      command: 'unlock-monster',
      learnerId: 'learner-abc',
      payload: { monsterId: 'fire-drake', branch: 'b1', targetStage: 'stage-2' },
    };

    function hashFor(commandOverrides = {}, payloadOverrides = {}) {
      const cmd = { ...baseCommand, ...commandOverrides };
      if (Object.keys(payloadOverrides).length > 0) {
        cmd.payload = { ...baseCommand.payload, ...payloadOverrides };
      }
      const kind = `hero_command.${cmd.command}`;
      const payload = { command: cmd.command, learnerId: cmd.learnerId, payload: cmd.payload };
      return mutationPayloadHash(kind, payload);
    }

    it('produces a deterministic hash for the same payload', () => {
      const h1 = hashFor();
      const h2 = hashFor();
      assert.equal(h1, h2);
    });

    it('hash changes when monsterId changes', () => {
      const h1 = hashFor();
      const h2 = hashFor({}, { monsterId: 'ice-serpent' });
      assert.notEqual(h1, h2, 'Hash must differ when monsterId differs');
    });

    it('hash changes when branch changes', () => {
      const h1 = hashFor();
      const h2 = hashFor({}, { branch: 'b2' });
      assert.notEqual(h1, h2, 'Hash must differ when branch differs');
    });

    it('hash changes when targetStage changes', () => {
      const h1 = hashFor();
      const h2 = hashFor({}, { targetStage: 'stage-3' });
      assert.notEqual(h1, h2, 'Hash must differ when targetStage differs');
    });

    it('hash differs from a payload-less command (the old bug)', () => {
      const withPayload = hashFor();
      const kind = `hero_command.${baseCommand.command}`;
      const withoutPayload = mutationPayloadHash(kind, {
        command: baseCommand.command,
        learnerId: baseCommand.learnerId,
        payload: undefined,
      });
      assert.notEqual(withPayload, withoutPayload,
        'Including a payload field must produce a different hash from undefined payload');
    });
  });

  describe('claim-task command', () => {
    const baseCommand = {
      command: 'claim-task',
      learnerId: 'learner-xyz',
      payload: { questId: 'quest-101', questFingerprint: 'fp-aaa', taskId: 'task-7' },
    };

    function hashFor(payloadOverrides = {}) {
      const cmd = { ...baseCommand };
      if (Object.keys(payloadOverrides).length > 0) {
        cmd.payload = { ...baseCommand.payload, ...payloadOverrides };
      }
      const kind = `hero_command.${cmd.command}`;
      const payload = { command: cmd.command, learnerId: cmd.learnerId, payload: cmd.payload };
      return mutationPayloadHash(kind, payload);
    }

    it('hash includes questId — changes when questId changes', () => {
      const h1 = hashFor();
      const h2 = hashFor({ questId: 'quest-202' });
      assert.notEqual(h1, h2, 'Hash must differ when questId differs');
    });

    it('hash includes taskId — changes when taskId changes', () => {
      const h1 = hashFor();
      const h2 = hashFor({ taskId: 'task-99' });
      assert.notEqual(h1, h2, 'Hash must differ when taskId differs');
    });

    it('same claim-task payload produces same hash (deterministic)', () => {
      const h1 = hashFor();
      const h2 = hashFor();
      assert.equal(h1, h2);
    });
  });
});
