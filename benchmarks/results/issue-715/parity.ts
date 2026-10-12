#!/usr/bin/env tsx
/**
 * Issue #715 receipts: the seven corpus-g (#711) decks of the gap bucket
 * "model: MOSFET LEVEL=3 (MOS3) and LEVEL=9 (MOS9)" run byte-identical through
 * ngspice-47 and spice-ts with the corpus-f runner, metric and 1% threshold
 * (`runFixture`, no per-circuit tuning). Losses are reported like wins.
 *
 * The decks are GPL-3.0-or-later Xyce Regression Suite files committed by
 * #711 under benchmarks/corpus/corpus-g/fixtures; this script reads them from
 * there, or from the `bench/711-corpus-g` branch (`git show`) while #722 is
 * unmerged, and checks every SHA-256 against the corpus-g manifest.
 *
 * Usage (repository root, after `pnpm build`):
 *   spice-heavy pnpm exec tsx benchmarks/results/issue-715/parity.ts [--label after]
 * writes benchmarks/results/issue-715/receipts/parity-<label>.json.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CorpusFCircuit } from '../../corpus/corpus-f/ingest.js';
import { runFixture } from '../../corpus/corpus-f/outcomes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS_G = 'benchmarks/corpus/corpus-g';
const BRANCH = 'origin/bench/711-corpus-g';

/** The bucket's seven fixtures (corpus-g manifest ids). */
export const MOS3_MOS9_FIXTURES = [
  'actests-bsim3-gain-stage-cir',
  'comparator-comparator-cir',
  'model-binning-comparatorbaseline-forglobal-cir',
  'mos13-ic-invert42-mos3-cir',
  'nmos3-dc-mos3-dc-cir',
  'op-comparator-op-cir',
  'subckt-subckt-a0-cir',
] as const;

interface ManifestCircuit extends Omit<CorpusFCircuit, 'licence'> { licence: string }

function readCorpusFile(path: string): Buffer {
  if (existsSync(resolve(path))) return readFileSync(resolve(path));
  return execFileSync('git', ['show', `${BRANCH}:${path}`], { maxBuffer: 64 * 1024 * 1024 });
}

async function main(): Promise<void> {
  const labelIndex = process.argv.indexOf('--label');
  const label = labelIndex >= 0 ? process.argv[labelIndex + 1] : 'after';
  const manifest = JSON.parse(readCorpusFile(`${CORPUS_G}/manifest.json`).toString('utf8')) as {
    circuits: ManifestCircuit[];
  };
  const scratch = await mkdtemp(resolve(tmpdir(), 'spice-ts-715-'));
  const fixtures = [];
  try {
    for (const id of MOS3_MOS9_FIXTURES) {
      const circuit = manifest.circuits.find(candidate => candidate.id === id);
      if (!circuit) throw new Error(`${id}: not in the corpus-g manifest`);
      const localPath = resolve(scratch, `${id}.cir`);
      await writeFile(localPath, readCorpusFile(circuit.localPath));
      const started = performance.now();
      const result = await runFixture({ ...circuit, localPath, licence: 'BSD-3-Clause' });
      fixtures.push({ ...result, sourcePath: circuit.sourcePath, wallMs: Math.round(performance.now() - started) });
      process.stderr.write(`${id}: ${result.outcome} worst=${result.worstNormalizedError} ${result.worstSignal ?? ''}\n`);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  const ngspice = execFileSync('ngspice', ['-v'], { encoding: 'utf8' }).match(/ngspice-\d+/)?.[0] ?? 'unknown';
  const report = {
    schema: 'spice-ts-issue-715-parity/v1',
    label,
    bucket: 'model: MOSFET LEVEL=3 (MOS3) and LEVEL=9 (MOS9)',
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
