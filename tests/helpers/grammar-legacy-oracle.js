import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturePath = path.join(rootDir, 'tests/fixtures/grammar-legacy-oracle/legacy-baseline.json');

export function readGrammarLegacyOracle() {
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

export function oracleTemplateById(templateId) {
  return readGrammarLegacyOracle().templates.find((template) => template.id === templateId) || null;
}

export function oracleCorrectResponse(templateId) {
  return oracleTemplateById(templateId)?.correctResponse || {};
}
