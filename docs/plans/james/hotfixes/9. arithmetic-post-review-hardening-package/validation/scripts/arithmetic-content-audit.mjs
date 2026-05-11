import { pathToFileURL } from 'node:url';
import path from 'node:path';

const repoRoot = process.env.ARITHMETIC_REPO_ROOT || process.cwd();
const contentModule = await import(pathToFileURL(path.join(repoRoot, 'shared/arithmetic/content.js')).href);
const { ARITHMETIC_TEMPLATES, evaluateArithmeticQuestion, generateArithmeticQuestion } = contentModule;
const findings = [];
let generated = 0;
let correctMarked = 0;
const uniqueStems = new Set();
const templateStats = Object.fromEntries(ARITHMETIC_TEMPLATES.map(t => [t.id, { generated:0, unique:0, failures:0 }]));
for (const template of ARITHMETIC_TEMPLATES) {
  const stems = new Set();
  for (const difficulty of [0,1,2]) {
    for (let seed=1; seed<=200; seed++) {
      generated++;
      const q = generateArithmeticQuestion({templateId: template.id, difficulty, seed});
      templateStats[template.id].generated++;
      if (!q.stem || !q.expected || !Number.isFinite(Number(q.marks))) findings.push({type:'malformed', templateId:template.id, difficulty, seed, q});
      if (q.stem.includes('undefined') || q.stem.includes('NaN') || String(q.visual||'').includes('undefined') || String(q.visual||'').includes('NaN')) findings.push({type:'bad_text', templateId:template.id, difficulty, seed, stem:q.stem, visual:q.visual});
      if (q.expected.kind === 'number' || q.expected.kind === 'digit') {
        if (!Number.isFinite(q.expected.value)) findings.push({type:'nonfinite_expected', templateId:template.id, difficulty, seed, expected:q.expected});
        if (template.id === 'order_of_operations' && difficulty === 2 && !Number.isInteger(q.expected.value)) findings.push({type:'noninteger_order', templateId:template.id, difficulty, seed, expected:q.expected.value, stem:q.stem});
      }
      const answer = q.expected.kind === 'fraction' ? `${q.expected.n}/${q.expected.d}` : String(q.expected.value);
      const result = evaluateArithmeticQuestion(q, {answer});
      if (result.correct) correctMarked++; else findings.push({type:'correct_not_marked', templateId:template.id, difficulty, seed, answer, result, q});
      stems.add(`${difficulty}:${q.stem}:${q.visual||''}`);
      uniqueStems.add(`${template.id}:${difficulty}:${q.stem}:${q.visual||''}`);
    }
  }
  templateStats[template.id].unique = stems.size;
  if (stems.size < 30) findings.push({type:'low_variety', templateId:template.id, unique:stems.size});
}
console.log(JSON.stringify({templateCount: ARITHMETIC_TEMPLATES.length, generated, correctMarked, uniqueStemCount: uniqueStems.size, findingCount: findings.length, findings: findings.slice(0,20), templateStats}, null, 2));
