#!/usr/bin/env tsx
/**
 * Issue #384 receipt: two-source nested `.DC` sweeps against ngspice.
 *
 * Every corpus fixture whose committed aggregate compares a nested DC sweep is
 * fed byte-for-byte to native ngspice and spice-ts. Per-signal max/RMS absolute
 * and relative errors come from the shared `alignAndMeasure` harness ("after").
 * "before" is copied from the committed `benchmarks/aggregate-report.json`
 * (whole-grid interpolation, produced before this fix). A separately labelled
 * diagnostic reruns ngspice with tightened Newton tolerances on a copy of
 * nmos-level1-dc; it is never used as the benchmark reference.
 *
 * Usage: pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-384/compare.ts
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignAndMeasure, type ComparisonMetrics } from '../../comparison-harness.js';
import { runNativeNgspice, runNativeSpiceTs, type ClassicCircuit } from '../../corpus/classic/report.js';

const directory = dirname(fileURLToPath(import.meta.url));
const NESTED_FIXTURES = [
  ['ngspice', 'jfet-vds-vgs'],
  ['xyce', 'njfet-2109-dc'],
  ['xyce', 'nmos-level1-dc'],
  ['xyce', 'pnp-dc'],
] as const;
const TIGHT_OPTIONS = '.OPTIONS RELTOL=1e-9 VNTOL=1e-12 ABSTOL=1e-15';

interface CommittedFixture {
  key: string;
  comparisons: Array<{ analysis: string; metrics: ComparisonMetrics }>;
}

async function main(): Promise<void> {
  const committed = JSON.parse(await readFile('benchmarks/aggregate-report.json', 'utf8')) as {
    fixtures: CommittedFixture[];
  };
  const fixtures = [];
  for (const [corpus, id] of NESTED_FIXTURES) {
    const manifest = JSON.parse(await readFile(`benchmarks/corpus/${corpus}/manifest.json`, 'utf8')) as {
      circuits: ClassicCircuit[];
    };
    const circuit = manifest.circuits.find(candidate => candidate.id === id);
    if (!circuit) throw new Error(`missing ${corpus}/${id}`);
    const input = await readFile(resolve(circuit.localPath));
    const sha256 = createHash('sha256').update(input).digest('hex');
    if (sha256 !== circuit.sha256) throw new Error(`${corpus}/${id} hash ${sha256} differs from manifest`);

    const [spiceTs, ngspice] = await Promise.all([runNativeSpiceTs(input, circuit), runNativeNgspice(input, circuit)]);
    const spiceDc = spiceTs.analyses.find(analysis => analysis.type === 'dc');
    const ngspiceDc = ngspice.analyses.find(analysis => analysis.type === 'dc');
    if (!spiceDc || !ngspiceDc) throw new Error(`${corpus}/${id}: missing DC result`);
    const signals = Object.keys(spiceDc.series.signals).filter(name => name in ngspiceDc.series.signals).sort();
    const after = alignAndMeasure(spiceDc.series, ngspiceDc.series, signals);
    const before = committed.fixtures.find(fixture => fixture.key === `${corpus}/${id}`)
      ?.comparisons.find(comparison => comparison.analysis === 'dc')?.metrics ?? null;

    let diagnosticTightNgspice: ComparisonMetrics | null = null;
    if (id === 'nmos-level1-dc') {
      const tightened = Buffer.from(input.toString('utf8').replace(/^\.END\s*$/im, `${TIGHT_OPTIONS}\n.END`));
      const tight = (await runNativeNgspice(tightened, circuit)).analyses.find(analysis => analysis.type === 'dc');
      if (tight) diagnosticTightNgspice = alignAndMeasure(spiceDc.series, tight.series, signals);
    }
    fixtures.push({
      fixture: `${corpus}/${id}`,
      localPath: circuit.localPath,
      sha256,
      engines: { spiceTs: spiceTs.status, ngspice: ngspice.status },
      before,
      after,
      ...(diagnosticTightNgspice ? { diagnosticTightNgspice: { options: TIGHT_OPTIONS, metrics: diagnosticTightNgspice } } : {}),
    });

    for (const signal of signals) {
      const now = after.signals[signal];
      const old = before?.signals[signal];
      if (now?.status !== 'compared') continue;
      const oldText = old?.status === 'compared'
        ? `${old.absoluteError.max}/${old.absoluteError.rms}/${old.relativeError.max}/${old.relativeError.rms}`
        : 'n/a';
      process.stdout.write(`${corpus}/${id}\t${signal}\tbefore=${oldText}\tafter=${now.absoluteError.max}/${now.absoluteError.rms}/${now.relativeError.max}/${now.relativeError.rms}\n`);
    }
    process.stdout.write(`${corpus}/${id}\tgrid ${JSON.stringify(after.grid)}\n`);
  }
  await writeFile(resolve(directory, 'report.json'), `${JSON.stringify({
    issue: 'https://github.com/mfiumara/spice-ts/issues/384',
    metricsOrder: 'abs max / abs RMS / rel max / rel RMS',
    fixtures,
  }, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
