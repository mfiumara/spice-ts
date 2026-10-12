#!/usr/bin/env tsx
/**
 * Issue #747 receipts: every corpus-g (#711) deck with a `.model` LEVEL above 99 on a model type
 * whose ngspice-47 dispatch goes through INPfindLev (nmos/pmos/npn/pnp/...), run byte-identical
 * through ngspice-47 and spice-ts with the corpus-f runner, metric and 1% threshold (`runFixture`,
 * no per-circuit tuning). Losses are reported like wins. The diode decks with level=200/2002
 * (JUNCAP200, DIODE_CMC) are not on this list: ngspice-47 does not call INPfindLev for `d` models.
 *
 * Usage (repository root, after `pnpm build`):
 *   spice-heavy pnpm exec tsx benchmarks/results/issue-747/parity.ts [--label after]
 * writes benchmarks/results/issue-747/receipts/parity-<label>.json.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CorpusFCircuit } from '../../corpus/corpus-f/ingest.js';
import { runFixture } from '../../corpus/corpus-f/outcomes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = resolve(HERE, '../../corpus/corpus-g/manifest.json');

/** corpus-g manifest ids of the decks with an INPfindLev model LEVEL above 99. */
export const LEVEL_ABOVE_99_FIXTURES = [
  'ekv26-inverter-transient-ekv26-cir',
  'psp102-idvg0-id-t27-pmos-cir',
  'psp103-invert-psp-testdta0-cir',
  'mextram-acfreq-gbb-noflip-p-cir',
  'vanoise-commonemitterbjt-mextram-cir',
] as const;

interface ManifestCircuit extends Omit<CorpusFCircuit, 'licence'> { licence: string }

async function main(): Promise<void> {
  const labelIndex = process.argv.indexOf('--label');
  const label = labelIndex >= 0 ? process.argv[labelIndex + 1] : 'after';
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { circuits: ManifestCircuit[] };
  const fixtures = [];
  for (const id of LEVEL_ABOVE_99_FIXTURES) {
    const circuit = manifest.circuits.find(candidate => candidate.id === id);
    if (!circuit) throw new Error(`${id}: not in the corpus-g manifest`);
    const started = performance.now();
    const result = await runFixture({ ...circuit, licence: 'BSD-3-Clause' } as CorpusFCircuit);
    fixtures.push({ ...result, sourcePath: circuit.sourcePath, wallMs: Math.round(performance.now() - started) });
    process.stderr.write(`${id}: ${result.outcome} worst=${result.worstNormalizedError} ${result.worstSignal ?? ''}\n`);
  }
  const ngspice = execFileSync('ngspice', ['-v'], { encoding: 'utf8' }).match(/ngspice-\d+/)?.[0] ?? 'unknown';
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'packages'], { encoding: 'utf8' }).trim() !== '';
  const report = {
    schema: 'spice-ts-issue-747-parity/v1',
    label,
    git: { commit, packagesDirty: dirty },
    rule: 'ngspice-47 inpfindl.c: model level rounded, < 0 or > 99 replaced by 1',
    tools: { ngspice, node: process.version },
    policy: { input: 'byte-identical corpus-g fixture for both engines', metric: 'corpus-f runFixture worst |error| / ngspice signal peak', matchThreshold: 0.01, perCircuitTuning: false },
    fixtures,
  };
  const out = resolve(HERE, 'receipts', `parity-${label}.json`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  process.stderr.write(`wrote ${out}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
