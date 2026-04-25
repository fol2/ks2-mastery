import {
  createPunctuationContentIndexes,
  PUNCTUATION_CONTENT_MANIFEST,
} from './content.js';
import { PUNCTUATION_MODES } from '../../src/subjects/punctuation/service-contract.js';

export const PUNCTUATION_LEGACY_PARITY_STATUSES = Object.freeze([
  'ported',
  'planned',
  'rejected',
  'replaced',
]);

const ROW_SECTIONS = Object.freeze([
  'sessionModes',
  'itemModes',
  'settingsSurface',
  'analyticsConcepts',
  'aiContextPackConstraints',
  'authorityRows',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sortStrings(values) {
  return [...values].filter((value) => typeof value === 'string' && value).sort();
}

function rowsFromBaseline(legacyBaseline = {}) {
  return ROW_SECTIONS.flatMap((section) => asArray(legacyBaseline[section]).map((row) => ({
    ...row,
    section,
  })));
}

function rowPresence(row, { itemModes, sessionModes, skillIds }) {
  if (row.section === 'itemModes') return itemModes.includes(row.id);
  if (row.section === 'sessionModes') return sessionModes.includes(row.id);
  if (row.section === 'authorityRows' && row.id === 'worker_command_runtime') return sessionModes.includes('smart');
  if (row.section === 'authorityRows' && row.id === 'skill_map') return skillIds.length === 14;
  return null;
}

export function createPunctuationLegacyParityReport({
  legacyBaseline,
  manifest = PUNCTUATION_CONTENT_MANIFEST,
  productionSessionModes = PUNCTUATION_MODES,
} = {}) {
  const baseline = legacyBaseline && typeof legacyBaseline === 'object' ? legacyBaseline : {};
  const indexes = createPunctuationContentIndexes(manifest);
  const skillIds = sortStrings(indexes.skills.map((skill) => skill.id));
  const legacySkillIds = sortStrings(asArray(baseline.legacySkillIds));
  const itemModes = sortStrings([...indexes.itemsByMode.keys()]);
  const sessionModes = sortStrings(productionSessionModes);
  const validStatuses = new Set(PUNCTUATION_LEGACY_PARITY_STATUSES);

  const rows = rowsFromBaseline(baseline).map((row) => {
    const present = rowPresence(row, { itemModes, sessionModes, skillIds });
    return {
      ...row,
      status: typeof row.status === 'string' ? row.status : '',
      ownerUnit: typeof row.ownerUnit === 'string' ? row.ownerUnit : '',
      present,
      needsImplementation: row.status === 'planned',
      intentionallyRejected: row.status === 'rejected',
    };
  });

  return {
    version: baseline.version || 1,
    source: baseline.source || '',
    legacySkillIds,
    productionSkillIds: skillIds,
    missingSkillIds: legacySkillIds.filter((skillId) => !skillIds.includes(skillId)),
    extraProductionSkillIds: skillIds.filter((skillId) => !legacySkillIds.includes(skillId)),
    legacyItemModes: sortStrings(asArray(baseline.itemModes).map((row) => row.id)),
    productionItemModes: itemModes,
    legacySessionModes: sortStrings(asArray(baseline.sessionModes).map((row) => row.id)),
    productionSessionModes: sessionModes,
    rows,
    invalidStatusRows: rows.filter((row) => !validStatuses.has(row.status)),
    missingOwnerRows: rows.filter((row) => !row.ownerUnit),
    missingAssertedRows: rows.filter((row) => row.assertPresent === true && row.present === false),
    plannedRows: rows.filter((row) => row.status === 'planned'),
    rejectedRows: rows.filter((row) => row.status === 'rejected'),
    replacedRows: rows.filter((row) => row.status === 'replaced'),
    portedRows: rows.filter((row) => row.status === 'ported'),
  };
}

export function parityRowsByStatus(report, status) {
  return asArray(report?.rows).filter((row) => row.status === status);
}
