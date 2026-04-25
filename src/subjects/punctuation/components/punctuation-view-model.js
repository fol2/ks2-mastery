import { resolveMonsterVisual } from '../../../platform/game/monster-visual-config.js';

const BELLSTORM_BASE = '/assets/regions/bellstorm-coast';

const SETUP_SCENES = Object.freeze(['bellstorm-coast-cover', 'bellstorm-coast-a1', 'bellstorm-coast-b1', 'bellstorm-coast-c1']);
const SUMMARY_SCENES = Object.freeze(['bellstorm-coast-d1', 'bellstorm-coast-d2', 'bellstorm-coast-e1', 'bellstorm-coast-e2']);
const FALLBACK_MONSTER = 'pealark';

function sceneUrl(name, size = 1280) {
  return `${BELLSTORM_BASE}/${name}.${size}.webp`;
}

export function bellstormSceneForPhase(phase = 'setup') {
  const scenes = phase === 'summary' || phase === 'feedback' ? SUMMARY_SCENES : SETUP_SCENES;
  const index = phase === 'active-item' ? 2 : phase === 'feedback' ? 1 : phase === 'summary' ? 3 : 0;
  const name = scenes[index] || scenes[0];
  return {
    name,
    src: sceneUrl(name, 1280),
    srcSet: `${sceneUrl(name, 640)} 640w, ${sceneUrl(name, 1280)} 1280w`,
  };
}

export function punctuationMonsterAsset(monsterId = FALLBACK_MONSTER, stage = 0, branch = 'b1', visualConfig = null) {
  const safeMonster = typeof monsterId === 'string' && monsterId ? monsterId : FALLBACK_MONSTER;
  const safeStage = Math.max(0, Math.min(4, Number(stage) || 0));
  const visual = resolveMonsterVisual({
    monsterId: safeMonster,
    branch,
    stage: safeStage,
    context: 'codexCard',
    config: visualConfig,
    preferredSize: 640,
  });
  return {
    id: safeMonster,
    stage: safeStage,
    src: visual.src,
    srcSet: visual.srcSet,
  };
}

export function punctuationPhaseLabel(phase = 'setup') {
  if (phase === 'active-item') return 'Practice';
  if (phase === 'feedback') return 'Feedback';
  if (phase === 'summary') return 'Summary';
  if (phase === 'unavailable') return 'Unavailable';
  return 'Setup';
}

export function currentItemInstruction(item = {}) {
  if (item.inputKind === 'choice') return 'Choose the best sentence.';
  if (item.mode === 'transfer') return 'Write one accurate sentence.';
  if (item.mode === 'combine') return 'Combine the parts into one punctuated sentence.';
  if (item.mode === 'fix') return 'Correct the sentence.';
  return 'Type the sentence with punctuation.';
}
