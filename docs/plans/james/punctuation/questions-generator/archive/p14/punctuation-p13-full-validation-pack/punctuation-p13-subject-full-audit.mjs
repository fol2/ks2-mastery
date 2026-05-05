#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { PUNCTUATION_CONTENT_MANIFEST, PUNCTUATION_ITEMS, PUNCTUATION_MANIFEST_VALIDATION } from './ks2-punctuation-p13-full-review-work/shared/punctuation/content.js';
import { createPunctuationRuntimeManifest, GENERATED_TEMPLATE_BANK, PRODUCTION_DEPTH } from './ks2-punctuation-p13-full-review-work/shared/punctuation/generators.js';
import { markPunctuationAnswer } from './ks2-punctuation-p13-full-review-work/shared/punctuation/marking.js';
import { createPunctuationService } from './ks2-punctuation-p13-full-review-work/shared/punctuation/service.js';

const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out')+1] : '/mnt/data/punctuation-p13-subject-full-audit.json';
const runtime = createPunctuationRuntimeManifest({ generatedPerFamily: PRODUCTION_DEPTH });
const items = runtime.items;
const generated = items.filter(i => i.source === 'generated');
const fixed = items.filter(i => i.source !== 'generated');

function norm(value) { return String(value ?? '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase(); }
function countBy(values, keyFn) { const m = new Map(); for (const v of values) { const k = keyFn(v) || 'unknown'; m.set(k, (m.get(k)||0)+1); } return Object.fromEntries([...m].sort(([a],[b])=>String(a).localeCompare(String(b)))); }
function words(s) { return String(s ?? '').match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []; }
function answerFor(item) { return (item.mode === 'choose' || item.inputKind === 'choice') ? { choiceIndex: Number(item.correctIndex) } : { typed: item.model || item.accepted?.[0] || '' }; }
function typedAnswerFor(item) { return item.model || item.accepted?.[0] || ''; }
function title(s) { return String(s).slice(0,1).toUpperCase()+String(s).slice(1); }
function replaceLexical(model) {
  const tokens = words(model);
  const banned = new Set(['the','a','an','and','or','but','for','to','of','in','on','at','by','with','we','i','you','he','she','it','they','our','my','your','his','her','their','was','were','is','are','am','be','do','did','does','had','has','have','can','could','would','should']);
  const candidate = tokens.find(t => t.length >= 4 && !banned.has(t.toLowerCase())) || tokens.find(t=>t.length>=3) || tokens[0];
  if (!candidate) return model + ' banana';
  const replacement = /^[A-Z]/.test(candidate) ? 'Banana' : 'banana';
  return model.replace(new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`), replacement);
}
function removeLikelyPunctuation(model) { return String(model || '').replace(/[,:;!?—–-]/g, '').replace(/\./g, '').replace(/["“”]/g, '').replace(/\s+/g,' ').trim(); }
function dupStats(values) { const seen = new Map(); for (const v of values.map(norm).filter(Boolean)) seen.set(v,(seen.get(v)||0)+1); const dups=[...seen].filter(([,c])=>c>1).sort((a,b)=>b[1]-a[1]); return { unique: seen.size, duplicateValues: dups.length, duplicateInstances: dups.reduce((s,[,c])=>s+c-1,0), top: dups.slice(0,20).map(([value,count])=>({value,count}))}; }
function lengthStats(values) { const ns=values.map(v=>words(v).length).sort((a,b)=>a-b); const pick=p=>ns.length?ns[Math.min(ns.length-1,Math.floor((ns.length-1)*p))]:0; return {min:ns[0]||0,p50:pick(.5),p90:pick(.9),p95:pick(.95),max:ns.at(-1)||0}; }
function createMemoryRepository() { const store = new Map(); return { readData(id){return store.get(id)||null}, writeData(id,data){store.set(id, JSON.parse(JSON.stringify(data))); return store.get(id)}, appendEvent(){}, upsertSession(){} }; }
function simulate({ learnerId='audit-learner', mode='smart', roundLength='6', seed=1, sessions=1, answers='model' }={}) {
  let n=seed+1; const random=()=>{n=(n*48271)%2147483647; return (n%100000)/100000};
  let now=1760000000000 + seed*100000; const repo=createMemoryRepository(); const service=createPunctuationService({ repository: repo, random, now:()=>now });
  let state=null; const rows=[];
  for (let sessionNo=0; sessionNo<sessions; sessionNo++) {
    state=service.startSession(learnerId,{mode,roundLength}).state;
    const sessionItems=[];
    while (state?.session?.currentItem && state.session.answeredCount < state.session.length) {
      const item=state.session.currentItem; sessionItems.push({id:item.id, source:item.source||'fixed', mode:item.mode, skillIds:item.skillIds, variantSignature:item.variantSignature||null});
      const answer=answers==='wrong' ? ((item.mode==='choose'||item.inputKind==='choice')?{choiceIndex:(Number(item.correctIndex)+1)%Math.max(1,item.options?.length||4)}:{typed:'banana'}) : answerFor(item);
      state=service.submitAnswer(learnerId, state, answer, { expectedSessionId: state.session.id, expectedItemId: state.session.currentItemId, expectedAnsweredCount: state.session.answeredCount, expectedReleaseId: state.session.releaseId }).state;
      if (state.phase === 'feedback') state=service.continueSession(learnerId, state).state;
      now += 60_000;
    }
    rows.push(sessionItems);
    now += 5 * 60_000;
  }
  return rows;
}

const modelFailures=[];
const feedbackFailures=[];
const answerSurfaceFailures=[];
const preservationFalseAccepts=[];
const extraTailFalseAccepts=[];
const punctuationRemovalFalseAccepts=[];
const choiceIndexCounts={};
const explanationTooShort=[];
const promptTooLong=[];
const stemTooLong=[];

for (const item of items) {
  const isChoice = item.mode === 'choose' || item.inputKind === 'choice';
  const modelResult = markPunctuationAnswer({ item, answer: answerFor(item) });
  if (!modelResult.correct) modelFailures.push({ id:item.id, mode:item.mode, source:item.source||'fixed', model:item.model, note:modelResult.note });
  if (!item.prompt || String(item.prompt).trim().length < 8) answerSurfaceFailures.push({ id:item.id, issue:'missing_or_too_short_prompt' });
  if (!isChoice && !typedAnswerFor(item)) answerSurfaceFailures.push({ id:item.id, issue:'missing_typed_model_answer' });
  if (isChoice) {
    if (!Array.isArray(item.options) || item.options.length < 2) answerSurfaceFailures.push({ id:item.id, issue:'choice_options_missing' });
    if (!Number.isInteger(Number(item.correctIndex)) || Number(item.correctIndex) < 0 || Number(item.correctIndex) >= (item.options?.length||0)) answerSurfaceFailures.push({ id:item.id, issue:'correctIndex_invalid' });
    choiceIndexCounts[item.correctIndex] = (choiceIndexCounts[item.correctIndex]||0)+1;
  }
  const badAnswer = isChoice ? { choiceIndex: (Number(item.correctIndex)+1) % Math.max(1,item.options?.length||4) } : { typed:'banana' };
  const badResult = markPunctuationAnswer({ item, answer: badAnswer });
  if (!badResult.note && !badResult.expected) feedbackFailures.push({ id:item.id, issue:'bad_answer_lacks_feedback' });
  if (String(item.explanation||'').length < 35) explanationTooShort.push({id:item.id, explanation:item.explanation||''});
  if (words(item.prompt).length > 30) promptTooLong.push({id:item.id, mode:item.mode, prompt:item.prompt});
  if (words(item.stem).length > 65) stemTooLong.push({id:item.id, mode:item.mode, stem:item.stem.slice(0,240)});
  if (!isChoice && !['transfer'].includes(item.mode)) {
    const model = typedAnswerFor(item);
    const replaced = replaceLexical(model);
    if (replaced !== model) {
      const r = markPunctuationAnswer({ item, answer:{typed: replaced} });
      if (r.correct) preservationFalseAccepts.push({ id:item.id, mode:item.mode, source:item.source||'fixed', model, attack:replaced });
    }
    const tail = `${model} today`;
    const t = markPunctuationAnswer({ item, answer:{typed: tail} });
    if (t.correct) extraTailFalseAccepts.push({ id:item.id, mode:item.mode, source:item.source||'fixed', model, attack:tail });
    const removed = removeLikelyPunctuation(model);
    if (removed && removed !== model) {
      const m = markPunctuationAnswer({ item, answer:{typed: removed} });
      if (m.correct) punctuationRemovalFalseAccepts.push({ id:item.id, mode:item.mode, source:item.source||'fixed', model, attack:removed });
    }
  }
}

const sessions=[];
for (let seed=0; seed<80; seed++) {
  const mode = seed % 7 === 0 ? 'guided' : seed % 11 === 0 ? 'speech' : 'smart';
  const len = seed % 3 === 0 ? '6' : seed % 3 === 1 ? '8' : '12';
  const rows = simulate({learnerId:`learner-${seed}`, mode, roundLength:len, seed, sessions:1})[0];
  sessions.push(rows);
}
const multiSession = simulate({learnerId:'one-learner-across-20', mode:'smart', roundLength:'6', seed:42, sessions:20});
function sessionMetrics(samples) {
  const flat=samples.flat();
  const immediate = samples.reduce((sum, rows)=>sum + rows.reduce((s,row,i)=>s+(i>0&&rows[i-1].id===row.id?1:0),0),0);
  const modeCounts=countBy(flat, r=>r.mode); const skillCounts=countBy(flat.flatMap(r=>(r.skillIds||[]).map(skillId=>({skillId}))), r=>r.skillId); const sourceCounts=countBy(flat, r=>r.source);
  return { sessions:samples.length, totalSurfaced:flat.length, uniqueItems:new Set(flat.map(r=>r.id)).size, immediateRepeats:immediate, sourceCounts, modeCounts, skillCounts, minUniqueModes:Math.min(...samples.map(rows=>new Set(rows.map(r=>r.mode)).size)), maxUniqueModes:Math.max(...samples.map(rows=>new Set(rows.map(r=>r.mode)).size)) };
}

const summary={
  auditedAt:new Date().toISOString(),
  node:process.version,
  manifest:{ releaseId:PUNCTUATION_CONTENT_MANIFEST.releaseId, validation:PUNCTUATION_MANIFEST_VALIDATION, productionDepth:PRODUCTION_DEPTH },
  counts:{ fixed:fixed.length, generated:generated.length, total:items.length, generatedFamilies:Object.keys(GENERATED_TEMPLATE_BANK).length },
  byMode:countBy(items, i=>i.mode),
  bySkillAllMemberships:countBy(items.flatMap(i=>(i.skillIds||[]).map(skillId=>({skillId}))), e=>e.skillId),
  byPrimarySkill:countBy(items, i=>i.skillIds?.[0]),
  bySource:countBy(items, i=>i.source||'fixed'),
  generatedByFamily:countBy(generated, i=>i.generatorFamilyId),
  templateCounts:Object.fromEntries(Object.entries(GENERATED_TEMPLATE_BANK).map(([k,v])=>[k,v.length]).sort(([a],[b])=>a.localeCompare(b))),
  duplicates:{ stems:dupStats(items.map(i=>i.stem || i.prompt || '')), models:dupStats(items.map(i=>i.model||'')), generatedStems:dupStats(generated.map(i=>i.stem || '')), generatedModels:dupStats(generated.map(i=>i.model || '')) },
  lengths:{ promptWords:lengthStats(items.map(i=>i.prompt||'')), stemWords:lengthStats(items.map(i=>i.stem||'')), modelWords:lengthStats(items.map(i=>i.model||'')) },
  choiceIndexCounts,
  failures:{ modelFailures:modelFailures.slice(0,50), modelFailureCount:modelFailures.length, answerSurfaceFailures:answerSurfaceFailures.slice(0,50), answerSurfaceFailureCount:answerSurfaceFailures.length, feedbackFailures:feedbackFailures.slice(0,50), feedbackFailureCount:feedbackFailures.length, preservationFalseAccepts:preservationFalseAccepts.slice(0,50), preservationFalseAcceptCount:preservationFalseAccepts.length, extraTailFalseAccepts:extraTailFalseAccepts.slice(0,50), extraTailFalseAcceptCount:extraTailFalseAccepts.length, punctuationRemovalFalseAccepts:punctuationRemovalFalseAccepts.slice(0,50), punctuationRemovalFalseAcceptCount:punctuationRemovalFalseAccepts.length, explanationTooShort:explanationTooShort.slice(0,50), explanationTooShortCount:explanationTooShort.length, promptTooLong:promptTooLong.slice(0,20), promptTooLongCount:promptTooLong.length, stemTooLong:stemTooLong.slice(0,20), stemTooLongCount:stemTooLong.length },
  sessions:{ mixedSeeded:sessionMetrics(sessions), oneLearnerTwentySmartSix:sessionMetrics(multiSession), oneLearnerTwentySmartSixItems:multiSession },
  riskFlags:[]
};
if (summary.byMode.transfer < 100) summary.riskFlags.push({severity:'high', code:'transfer_underrepresented', message:`Only ${summary.byMode.transfer} transfer/open-production items in a ${items.length}-item pool.`});
if (summary.byMode.paragraph < 250) summary.riskFlags.push({severity:'medium', code:'paragraph_depth_watch', message:`Paragraph mode count is ${summary.byMode.paragraph}; adequate but monitor relative to 3312 pool.`});
if (preservationFalseAccepts.length) summary.riskFlags.push({severity:'blocker', code:'closed_preservation_false_accept', message:`${preservationFalseAccepts.length} closed items accepted lexical replacement.`});
if (extraTailFalseAccepts.length) summary.riskFlags.push({severity:'blocker', code:'closed_extra_tail_false_accept', message:`${extraTailFalseAccepts.length} closed items accepted extra tail words.`});
if (modelFailures.length) summary.riskFlags.push({severity:'blocker', code:'model_answers_fail_marking', message:`${modelFailures.length} model answers fail marking.`});
if (answerSurfaceFailures.length) summary.riskFlags.push({severity:'blocker', code:'answer_surface_invalid', message:`${answerSurfaceFailures.length} items have answer-surface shape failures.`});
if (summary.sessions.mixedSeeded.immediateRepeats || summary.sessions.oneLearnerTwentySmartSix.immediateRepeats) summary.riskFlags.push({severity:'high', code:'immediate_session_repeat', message:'Immediate item repeat detected in simulated sessions.'});
writeFileSync(OUT, JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({status:'DONE', out:OUT, counts:summary.counts, failures:summary.failures, sessions:summary.sessions.mixedSeeded, risks:summary.riskFlags}, null, 2));
