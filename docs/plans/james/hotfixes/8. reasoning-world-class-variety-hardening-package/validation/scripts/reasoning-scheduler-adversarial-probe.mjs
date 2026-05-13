import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServerReasoningEngine } from '../../../../../../../worker/src/subjects/reasoning/engine.js';

const outPath = process.argv[2];

function currentBase() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function summarise(refs) {
  return {
    questionCount: refs.length,
    uniqueTemplates: new Set(refs.map((ref) => ref.templateId)).size,
    uniqueItemIds: new Set(refs.map((ref) => ref.itemId)).size,
    templateIds: refs.map((ref) => ref.templateId),
    itemIds: refs.map((ref) => ref.itemId),
    seeds: refs.map((ref) => ref.seed),
  };
}

function start(payload, requestId) {
  const engine = createServerReasoningEngine({ now: () => 70_000, random: () => 0 });
  const result = engine.apply({
    learnerId: `learner-${requestId}`,
    command: 'start-session',
    payload,
    requestId,
  });
  return result.state.session.questionRefs;
}

const output = {
  checkedAt: new Date().toISOString(),
  base: currentBase(),
  random: 'constant-zero',
  smart: summarise(start({ mode: 'smart', roundLength: 12, viewMode: 'one' }, 'smart')),
  skillPvRounding: summarise(start({ mode: 'skill', focusSkillId: 'pv_rounding', roundLength: 12, viewMode: 'one' }, 'skill-pv-rounding')),
  trouble: summarise(start({ mode: 'trouble', roundLength: 12, viewMode: 'one' }, 'trouble')),
  satsset12: summarise(start({ mode: 'satsset', setSize: 12 }, 'satsset12')),
};

const json = `${JSON.stringify(output, null, 2)}\n`;
if (outPath) writeFileSync(outPath, json);
else process.stdout.write(json);

if (
  output.smart.uniqueTemplates !== 12 ||
  output.smart.uniqueItemIds !== 12 ||
  output.skillPvRounding.uniqueTemplates < 7 ||
  output.skillPvRounding.uniqueItemIds !== 12 ||
  output.trouble.uniqueTemplates !== 12 ||
  output.trouble.uniqueItemIds !== 12 ||
  output.satsset12.uniqueTemplates !== 12 ||
  output.satsset12.uniqueItemIds !== 12
) {
  process.exitCode = 1;
}
