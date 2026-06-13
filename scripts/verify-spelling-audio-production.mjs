#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  EXIT_OK,
  EXIT_TRANSPORT,
  EXIT_USAGE,
  EXIT_VALIDATION,
  parseArgs as parseSmokeArgs,
  runSpellingAudioSmoke,
} from './spelling-audio-production-smoke.mjs';

const HELP_BANNER = [
  'Usage: node ./scripts/verify-spelling-audio-production.mjs [options]',
  '',
  'Runs the spelling audio production smoke and writes a proof-ready evidence',
  'envelope for Content Operations release history.',
  '',
  'Options:',
  '  --origin <url>, --url <url>       Origin to probe.',
  '  --word-sample <csv>               Comma-separated word slugs.',
  '  --sentence-sample <csv>           Comma-separated sentence slugs.',
  '  --require-word-hit                Fail when a word probe misses cache.',
  '  --require-legacy-hit              Fail when a sentence probe falls back to primary.',
  '  --out <path>, --output <path>      Persist evidence JSON.',
  '  --json                            Emit machine-readable JSON only.',
  '  --timeout-ms <ms>                 Per-request timeout.',
  '  --help, -h                        Show this banner.',
].join('\n');

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (value == null || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function addEqualsArg(argv, index, prefix, target) {
  const value = argv[index].slice(prefix.length);
  if (!value) throw new Error(`${target} requires a value.`);
  return value;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const smokeArgv = [];
  const options = {
    outPath: '',
    json: false,
    help: false,
  };
  const assigned = new Set();
  const assignOnce = (flag) => {
    if (assigned.has(flag)) {
      throw new Error(`${flag} specified more than once; refusing to let later value silently override the earlier one.`);
    }
    assigned.add(flag);
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' || arg === '--output') {
      assignOnce('--out');
      options.outPath = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--out=')) {
      assignOnce('--out');
      options.outPath = addEqualsArg(argv, index, '--out=', '--out');
    } else if (arg.startsWith('--output=')) {
      assignOnce('--out');
      options.outPath = addEqualsArg(argv, index, '--output=', '--output');
    } else {
      smokeArgv.push(arg);
      if ([
        '--origin',
        '--url',
        '--word-sample',
        '--sentence-sample',
        '--timeout-ms',
      ].includes(arg)) {
        const value = readOptionValue(argv, index, arg);
        smokeArgv.push(value);
        index += 1;
      }
    }
  }

  const smokeOptions = parseSmokeArgs(smokeArgv);
  options.json = smokeOptions.json;
  options.help = smokeOptions.help;
  return {
    ...smokeOptions,
    ...options,
  };
}

function probeCounts(report = {}) {
  const probes = Array.isArray(report.probes) ? report.probes : [];
  return {
    total: probes.length,
    failed: probes.filter((probe) => probe.ok === false).length,
    word: probes.filter((probe) => probe.kind === 'word').length,
    sentence: probes.filter((probe) => probe.kind === 'sentence').length,
    crossAccount: probes.filter((probe) => probe.kind === 'cross-account').length,
  };
}

function worstProbeExitCode(report = {}) {
  const probes = Array.isArray(report.probes) ? report.probes : [];
  let worst = EXIT_OK;
  for (const probe of probes) {
    if (probe.ok !== false) continue;
    const kind = probe.error?.kind || 'validation';
    if (kind === 'validation') return EXIT_VALIDATION;
    if (kind === 'transport' && worst !== EXIT_VALIDATION) worst = EXIT_TRANSPORT;
    if (kind === 'usage' && worst === EXIT_OK) worst = EXIT_USAGE;
  }
  return worst;
}

function proofEvidenceFromReport(report = {}, options = {}, { evidencePath = '' } = {}) {
  const counts = probeCounts(report);
  const crossAccountProbe = Array.isArray(report.probes)
    ? report.probes.find((probe) => probe.kind === 'cross-account')
    : null;
  return {
    proofType: 'spelling-audio-production',
    proofSurface: 'wordBank',
    origin: report.origin || options.origin || '',
    checkedAt: report.finishedAt || new Date().toISOString(),
    ok: Boolean(report.ok),
    evidencePath: evidencePath || null,
    requireWordHit: Boolean(options.requireWordHit),
    requireLegacyHit: Boolean(options.requireLegacyHit),
    probes: counts,
    crossAccount: {
      ok: Boolean(crossAccountProbe && crossAccountProbe.ok !== false),
      fixtureWord: crossAccountProbe?.fixtureWord || null,
      distinctWord: crossAccountProbe?.distinctWord || null,
      voice: crossAccountProbe?.voice || null,
    },
  };
}

export function buildAudioProductionProofEvidence(report = {}, options = {}, { evidencePath = '' } = {}) {
  const proofSurface = proofEvidenceFromReport(report, options, { evidencePath });
  return {
    ok: Boolean(report.ok),
    proofType: 'spelling-audio-production',
    source: 'verify-spelling-audio-production',
    generatedAt: new Date().toISOString(),
    origin: report.origin || options.origin || '',
    evidencePath: evidencePath || null,
    productionProof: {
      source: 'verify-spelling-audio-production',
      notes: 'Spelling word and sentence TTS cache proof captured by the production verification wrapper.',
      surfaces: {
        wordBank: proofSurface,
      },
    },
    report,
  };
}

async function writeEvidence(outPath, evidence) {
  if (!outPath) return '';
  const absolute = resolve(outPath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return absolute;
}

export async function runSpellingAudioProductionVerification(options = {}) {
  const report = await runSpellingAudioSmoke(options);
  const evidencePath = options.outPath ? resolve(options.outPath) : '';
  const evidence = buildAudioProductionProofEvidence(report, options, { evidencePath });
  const outputPath = await writeEvidence(options.outPath, evidence);
  return {
    exitCode: report.ok ? EXIT_OK : worstProbeExitCode(report),
    outputPath,
    evidence,
  };
}

function renderHumanReadableResult(result) {
  const evidence = result.evidence || {};
  const counts = evidence.productionProof?.surfaces?.wordBank?.probes || {};
  return [
    `verify-spelling-audio-production @ ${evidence.origin || '(unknown origin)'}`,
    `  ok=${Boolean(evidence.ok)}`,
    `  probes=${counts.total || 0} failed=${counts.failed || 0} word=${counts.word || 0} sentence=${counts.sentence || 0} crossAccount=${counts.crossAccount || 0}`,
    result.outputPath ? `  evidence=${result.outputPath}` : '  evidence=(not written)',
  ].join('\n');
}

export async function runCli(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, exit_code: EXIT_USAGE, error: error?.message || String(error) }, null, 2));
    return EXIT_USAGE;
  }
  if (options.help) {
    console.log(HELP_BANNER);
    return EXIT_OK;
  }

  let result;
  try {
    result = await runSpellingAudioProductionVerification(options);
  } catch (error) {
    const code = error?.kind === 'usage'
      ? EXIT_USAGE
      : (error?.kind === 'validation' || error?.name === 'AssertionError' ? EXIT_VALIDATION : EXIT_TRANSPORT);
    console.error(JSON.stringify({ ok: false, exit_code: code, error: error?.message || String(error) }, null, 2));
    return code;
  }

  if (options.json) {
    console.log(JSON.stringify(result.evidence, null, 2));
  } else {
    console.log(renderHumanReadableResult(result));
  }
  return result.exitCode;
}

export async function main() {
  const code = await runCli();
  process.exitCode = code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[verify-spelling-audio-production] ' + (error?.stack || error?.message || error));
    process.exit(EXIT_TRANSPORT);
  });
}
