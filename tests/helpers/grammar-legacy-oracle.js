import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturePath = path.join(rootDir, 'tests/fixtures/grammar-legacy-oracle/legacy-baseline.json');
const qgP1FixturePath = path.join(rootDir, 'tests/fixtures/grammar-legacy-oracle/grammar-qg-p1-baseline.json');
const qgP2FixturePath = path.join(rootDir, 'tests/fixtures/grammar-legacy-oracle/grammar-qg-p2-baseline.json');
const qgP3FixturePath = path.join(rootDir, 'tests/fixtures/grammar-legacy-oracle/grammar-qg-p3-baseline.json');
const qgP4FixturePath = path.join(rootDir, 'tests/fixtures/grammar-legacy-oracle/grammar-qg-p4-baseline.json');
const qgP5FixturePath = path.join(rootDir, 'tests/fixtures/grammar-legacy-oracle/grammar-qg-p5-baseline.json');

export function readGrammarLegacyOracle() {
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

export function readGrammarQuestionGeneratorBaseline() {
  return JSON.parse(fs.readFileSync(qgP1FixturePath, 'utf8'));
}

export function readGrammarQuestionGeneratorP2Baseline() {
  return JSON.parse(fs.readFileSync(qgP2FixturePath, 'utf8'));
}

export function readGrammarQuestionGeneratorP3Baseline() {
  return JSON.parse(fs.readFileSync(qgP3FixturePath, 'utf8'));
}

export function readGrammarQuestionGeneratorP4Baseline() {
  return JSON.parse(fs.readFileSync(qgP4FixturePath, 'utf8'));
}

export function readGrammarQuestionGeneratorP5Baseline() {
  return JSON.parse(fs.readFileSync(qgP5FixturePath, 'utf8'));
}

export function oracleTemplateById(templateId) {
  return readGrammarLegacyOracle().templates.find((template) => template.id === templateId) || null;
}

export function oracleCorrectResponse(templateId) {
  return oracleTemplateById(templateId)?.correctResponse || {};
}
