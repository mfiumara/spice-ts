import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { sanitizeDiagnostics } from './diagnostics.js';

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function checkDiagnostics(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'diagnostics') {
      assert.equal(typeof child, 'string');
      assert.equal(child, sanitizeDiagnostics(child as string));
    } else checkDiagnostics(child);
  }
}

test('generated #1049 receipt contains no fetch-only model-source echoes or continuation lines', () => {
  const receipt: unknown = JSON.parse(readFileSync('benchmarks/results/issue-1049/receipt.json', 'utf8'));
  for (const text of strings(receipt)) {
    assert.doesNotMatch(text, /^\s*(?:\.model\b|\+)/im);
  }
  // Also reject inline or wrapped echoes, not just recognizable SPICE line prefixes.
  checkDiagnostics(receipt);
});

test('ngspice diagnostics retain status and failure times, never arbitrary model source', () => {
  // Original synthetic cards only. No fetched vendor text belongs in test fixtures.
  const output = ['Warning: Model issue on line 42 :',
    '  .model SYNTHETIC D (is=1e-15)', ' + n=1',
    'N=1 IS=1e-15', 'Warning: .MODEL SYNTHETIC D (is=1e-15)',
    'unrecognized parameter (synthetic_parameter) - ignored',
    'No. of Data Rows : 6',
    'doAnalyses: TRAN:  Timestep too small; time = 1e-13, timestep = 2.5e-23: trouble with synthetic_device',
    'run simulation(s) aborted'].join('\r\n');
  const safe = sanitizeDiagnostics(output);
  assert.equal(safe, ['Warning: Model issue on line 42 :',
    'unrecognized model parameter ignored [source omitted]',
    'No. of Data Rows : 6',
    'doAnalyses: TRAN:  Timestep too small; time = 1e-13, timestep = 2.5e-23',
    'run simulation(s) aborted',
    '[source-bearing or unrecognized diagnostic lines omitted]', ''].join('\n'));
  assert.equal(sanitizeDiagnostics(safe), safe);
  assert.doesNotMatch(safe, /synthetic|is=|n=/i);
});
