import { buildTaskEnvelope } from '../../../../shared/hero/task-envelope.js';

function safeOverview(readModel) {
  const overview = readModel?.stats?.overview || {};
  return {
    totalQuestions: Number(overview.totalQuestions) || 0,
    weak: Number(overview.weak) || 0,
    due: Number(overview.due) || 0,
    securedSkills: Number(overview.securedSkills) || 0,
    accuracy: Number(overview.accuracy) || 0,
  };
}

function safeSkills(readModel) {
  const rows = readModel?.analytics?.skills || readModel?.stats?.skills || [];
  return Array.isArray(rows) ? rows : [];
}

export function reasoningProvider(readModel) {
  const subjectId = 'reasoning';
  const overview = safeOverview(readModel);
  const skills = safeSkills(readModel);
  const weakSkills = skills.filter((row) => row.status === 'weak');
  const dueSkills = skills.filter((row) => row.status === 'due');
  const securedSkills = skills.filter((row) => row.status === 'secured');

  if (!readModel || !readModel.content) {
    return {
      subjectId,
      available: false,
      unavailableReason: 'missing-hero-readable-signals',
      signals: { dueCount: 0, weakCount: 0, secureCount: 0, megaLike: false, postMegaAvailable: false, retentionDueCount: 0 },
      envelopes: [],
    };
  }

  const signals = {
    dueCount: dueSkills.length || overview.due,
    weakCount: weakSkills.length || overview.weak,
    secureCount: securedSkills.length || overview.securedSkills,
    megaLike: overview.securedSkills >= 17,
    postMegaAvailable: overview.securedSkills >= 17,
    retentionDueCount: dueSkills.length,
  };

  const envelopes = [];
  if (signals.weakCount > 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'weak-repair',
      launcher: 'trouble-practice',
      effortTarget: Math.min(signals.weakCount * 3, 12),
      reasonTags: ['weak-reasoning-skill', 'evidence-repair'],
      debugReason: `Reasoning has ${signals.weakCount} weak skill(s) needing repair.`,
    }));
  }
  if (signals.dueCount > 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'due-review',
      launcher: 'smart-practice',
      effortTarget: Math.min(signals.dueCount * 2, 10),
      reasonTags: ['due-reasoning-review'],
      debugReason: `Reasoning has ${signals.dueCount} due review signal(s).`,
    }));
  }
  if (signals.secureCount >= 5) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'retention-after-secure',
      launcher: 'guardian-check',
      effortTarget: 6,
      reasonTags: ['secure-reasoning-maintenance'],
      debugReason: `Reasoning has ${signals.secureCount} secured skill(s); maintenance check eligible.`,
    }));
  }
  if (overview.totalQuestions >= 12) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'breadth-maintenance',
      launcher: 'mini-test',
      effortTarget: 8,
      reasonTags: ['reasoning-breadth', 'mixed-sats-reasoning'],
      debugReason: 'Reasoning has enough history for a mixed SATs-style mini set.',
    }));
  }
  if (envelopes.length === 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'starter-growth',
      launcher: 'smart-practice',
      effortTarget: 6,
      reasonTags: ['reasoning-baseline'],
      debugReason: 'Reasoning needs an initial baseline across KS2 maths reasoning structures.',
    }));
  }

  return {
    subjectId,
    available: true,
    unavailableReason: null,
    signals,
    envelopes,
  };
}
