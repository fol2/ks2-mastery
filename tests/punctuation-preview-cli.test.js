import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../scripts/preview-punctuation-templates.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function run(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('preview-punctuation-templates: --family gen_dash_clause_combine --variants 4 outputs 4 items', () => {
  const result = run(['--family', 'gen_dash_clause_combine', '--variants', '4']);
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
  const output = result.stdout;

  // Should contain 4 item blocks (count separator lines)
  const separators = output.split('\n').filter((line) => line.startsWith('═══'));
  assert.equal(separators.length, 4, `Expected 4 item blocks, got ${separators.length}`);

  // Each item should have required fields
  assert.ok(output.includes('Item ID:'), 'Missing Item ID');
  assert.ok(output.includes('Family ID:'), 'Missing Family ID');
  assert.ok(output.includes('Template ID:'), 'Missing Template ID');
  assert.ok(output.includes('Variant Signature:'), 'Missing Variant Signature');
  assert.ok(output.includes('Mode:'), 'Missing Mode');
  assert.ok(output.includes('Skill IDs:'), 'Missing Skill IDs');
  assert.ok(output.includes('Cluster ID:'), 'Missing Cluster ID');
  assert.ok(output.includes('Prompt:'), 'Missing Prompt');
  assert.ok(output.includes('Stem:'), 'Missing Stem');
  assert.ok(output.includes('Model Answer:'), 'Missing Model Answer');
  assert.ok(output.includes('Validator Type:'), 'Missing Validator Type');
  assert.ok(output.includes('Rubric Type:'), 'Missing Rubric Type');
  assert.ok(output.includes('Misconception Tags:'), 'Missing Misconception Tags');
  assert.ok(output.includes('Readiness Tags:'), 'Missing Readiness Tags');
  assert.ok(output.includes('Golden Tests:'), 'Missing Golden Tests');

  // Should reference the correct family
  assert.ok(output.includes('gen_dash_clause_combine'), 'Missing family ID in output');
});

test('preview-punctuation-templates: --json produces valid JSON', () => {
  const result = run(['--family', 'gen_dash_clause_combine', '--variants', '4', '--json']);
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);

  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(result.stdout);
  }, 'Output is not valid JSON');

  assert.ok(Array.isArray(parsed), 'JSON output should be an array');
  assert.equal(parsed.length, 4, `Expected 4 items, got ${parsed.length}`);

  // Each item should have required fields
  for (const item of parsed) {
    assert.ok(typeof item.id === 'string' && item.id, 'Missing id');
    assert.ok(typeof item.generatorFamilyId === 'string', 'Missing generatorFamilyId');
    assert.ok(typeof item.templateId === 'string', 'Missing templateId');
    assert.ok(typeof item.variantSignature === 'string', 'Missing variantSignature');
    assert.ok(typeof item.mode === 'string', 'Missing mode');
    assert.ok(Array.isArray(item.skillIds), 'Missing skillIds');
    assert.ok(typeof item.clusterId === 'string', 'Missing clusterId');
    assert.ok(typeof item.prompt === 'string', 'Missing prompt');
    assert.ok(typeof item.stem === 'string', 'Missing stem');
    assert.ok(typeof item.model === 'string', 'Missing model');
    assert.ok(Array.isArray(item.misconceptionTags), 'Missing misconceptionTags');
    assert.ok(Array.isArray(item.readiness), 'Missing readiness');
    assert.ok('validatorType' in item, 'Missing validatorType');
    assert.ok('rubricType' in item, 'Missing rubricType');
    assert.ok('goldenTests' in item, 'Missing goldenTests');
  }
});

test('preview-punctuation-templates: --all --variants 8 renders all families', () => {
  const result = run(['--all', '--variants', '8']);
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);

  const output = result.stdout;
  // Should have many items (at least one per published family)
  const separators = output.split('\n').filter((line) => line.startsWith('═══'));
  assert.ok(separators.length > 8, `Expected many items, got ${separators.length}`);
});

test('preview-punctuation-templates: unknown family prints error and exits 1', () => {
  const result = run(['--family', 'gen_nonexistent_family']);
  assert.equal(result.status, 1, `Expected exit 1, got ${result.status}`);

  const combined = result.stderr + result.stdout;
  assert.ok(combined.includes('Unknown family ID'), 'Should mention unknown family');
  assert.ok(combined.includes('gen_nonexistent_family'), 'Should echo the bad family ID');
  assert.ok(combined.includes('Valid family IDs'), 'Should list valid family IDs');
});

test('preview-punctuation-templates: --variants 0 produces empty output, exit 0', () => {
  const result = run(['--family', 'gen_dash_clause_combine', '--variants', '0']);
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);

  // No item blocks
  const separators = result.stdout.split('\n').filter((line) => line.startsWith('═══'));
  assert.equal(separators.length, 0, 'Expected no item blocks');
});

test('preview-punctuation-templates: --variants 0 --json produces empty array', () => {
  const result = run(['--family', 'gen_dash_clause_combine', '--variants', '0', '--json']);
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);

  const parsed = JSON.parse(result.stdout);
  assert.ok(Array.isArray(parsed), 'JSON output should be an array');
  assert.equal(parsed.length, 0, 'Expected empty array');
});

test('preview-punctuation-templates: golden test results included for DSL families', () => {
  const result = run(['--family', 'gen_dash_clause_combine', '--variants', '4', '--json']);
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);

  const parsed = JSON.parse(result.stdout);
  // DSL-backed families have golden tests on templates
  const withGolden = parsed.filter((item) => item.goldenTests !== null);
  assert.ok(withGolden.length > 0, 'Expected at least one item with golden tests');

  for (const item of withGolden) {
    assert.ok(typeof item.goldenTests.allPassed === 'boolean', 'goldenTests.allPassed should be boolean');
    assert.ok(Array.isArray(item.goldenTests.accept), 'goldenTests.accept should be array');
    assert.ok(Array.isArray(item.goldenTests.reject), 'goldenTests.reject should be array');
    for (const c of item.goldenTests.accept) {
      assert.ok(typeof c.input === 'string', 'accept case should have input');
      assert.ok(typeof c.passed === 'boolean', 'accept case should have passed');
    }
    for (const c of item.goldenTests.reject) {
      assert.ok(typeof c.input === 'string', 'reject case should have input');
      assert.ok(typeof c.passed === 'boolean', 'reject case should have passed');
    }
  }
});

test('preview-punctuation-templates: no args prints error and exits 1', () => {
  const result = run([]);
  assert.equal(result.status, 1, `Expected exit 1, got ${result.status}`);
  assert.ok(result.stderr.includes('--family') || result.stderr.includes('--all'),
    'Error message should mention --family or --all');
});
