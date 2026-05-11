import { buildTaskEnvelope } from '../../../../shared/hero/task-envelope.js';

function safeOverview(readModel) {
  const overview = readModel?.stats?.overview || {};
  return {
    totalQuestions: Number(overview.totalQuestions) || 0,
    weak: Number(overview.weak) || 0,
    due: Number(overview.due) || 0,
    securedSkills: Number(overview.securedSkills) || 0,
    securedRewardUnits: Number(overview.securedRewardUnits) || 0,
    accuracy: Number(overview.accuracy) || 0,
  };
}

function safeSkills(readModel) {
  const rows = readModel?.analytics?.skills || readModel?.stats?.skills || [];
  return Array.isArray(rows) ? rows : [];
}

export function arithmeticProvider(readModel) {
  const subjectId = 'arithmetic';
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
    megaLike: overview.securedRewardUnits >= Math.max(60, Math.floor((readModel.content.rewardUnitCount || 78) * 0.75)),
    postMegaAvailable: overview.securedRewardUnits >= Math.max(60, Math.floor((readModel.content.rewardUnitCount || 78) * 0.75)),
    retentionDueCount: dueSkills.length,
  };

  const envelopes = [];
  if (signals.weakCount > 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'weak-repair',
      launcher: 'trouble-practice',
      effortTarget: Math.min(signals.weakCount * 3, 12),
      reasonTags: ['weak-arithmetic-procedure', 'exact-fluency-repair'],
      debugReason: `Arithmetic has ${signals.weakCount} weak skill(s) needing repair.`,
    }));
  }
  if (signals.dueCount > 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'due-review',
      launcher: 'smart-practice',
      effortTarget: Math.min(signals.dueCount * 2, 10),
      reasonTags: ['due-arithmetic-review', 'spaced-retrieval'],
      debugReason: `Arithmetic has ${signals.dueCount} due review signal(s).`,
    }));
  }
  if (signals.secureCount >= 4) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'retention-after-secure',
      launcher: 'guardian-check',
      effortTarget: 6,
      reasonTags: ['secure-arithmetic-maintenance'],
      debugReason: `Arithmetic has ${signals.secureCount} secured skills; maintenance check eligible.`,
    }));
  }
  if (overview.totalQuestions >= 20) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'breadth-maintenance',
      launcher: 'mini-test',
      effortTarget: 8,
      reasonTags: ['arithmetic-breadth', 'sats-style-mini-paper'],
      debugReason: 'Arithmetic has enough history for a mixed SATs-style mini paper.',
    }));
  }
  if (envelopes.length === 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'starter-growth',
      launcher: 'smart-practice',
      effortTarget: 6,
      reasonTags: ['arithmetic-baseline'],
      debugReason: 'Arithmetic needs an initial baseline across KS2 arithmetic strands.',
    }));
  }

  return { subjectId, available: true, unavailableReason: null, signals, envelopes };
}
