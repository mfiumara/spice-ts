#!/usr/bin/env tsx
/**
 * Issue #530 receipt: MOS level-1 body effect (GAMMA/PHI), signed VTO, LD and
 * the rejection of unimplemented MOS levels, against ngspice-47.
 *
 * Every committed corpus fixture that the base revision ran through its
 * level-1 MOSFET class (any NMOS/PMOS model whose LEVEL is not 6/8/49), plus the
 * project-authored fixtures in `fixtures/`, is fed byte-for-byte to native
 * ngspice and spice-ts. Per-signal max/RMS absolute and relative errors use the
 * shared `alignAndMeasure` harness (segment-aware for nested `.DC` sweeps since
 * #384). Nothing here changes tolerances or fixtures.
 *
 * Usage:
 *   pnpm -C packages/core build
 *   pnpm exec tsx benchmarks/results/issue-530/compare.ts --label before|after
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { alignAndMeasure } from '../../comparison-harness.js';
import {
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicAnalysisType,
  type ClassicCircuit,
} from '../../corpus/classic/report.js';

const directory = dirname(fileURLToPath(import.meta.url));
const CORPORA = ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e'] as const;
const MOS_MODEL = /^\s*\.model\s+\S+\s+\(?\s*[np]mos\b(.*)$/gim;

function usesLevel1Class(text: string): boolean {
  const joined = text.replace(/\n\s*\+/g, ' ');
  for (const match of joined.matchAll(MOS_MODEL)) {
    const level = /\blevel\s*=\s*([0-9.]+)/i.exec(match[1] ?? '');
    const value = level ? Number(level[1]) : 1;
    if (value !== 6 && value !== 8 && value !== 49) return true;
  }
  return false;
}

function hasMosfetInstance(text: string): boolean {
  return /^\s*m\S*\s/im.test(text);
}

function analysesOf(text: string): ClassicAnalysisType[] {
  const found: ClassicAnalysisType[] = [];
  for (const [card, type] of [['.op', 'op'], ['.dc', 'dc'], ['.ac', 'ac'], ['.tran', 'tran']] as const) {
    if (new RegExp(`^\\s*\\${card}\\b`, 'im').test(text)) found.push(type);
  }
  return found;
}

async function corpusCircuits(): Promise<Array<{ key: string; circuit: ClassicCircuit }>> {
  const result = [];
  for (const corpus of CORPORA) {
    const manifest = JSON.parse(await readFile(`benchmarks/corpus/${corpus}/manifest.json`, 'utf8')) as {
      circuits: ClassicCircuit[];
    };
    for (const circuit of manifest.circuits) {
      const text = await readFile(resolve(circuit.localPath), 'utf8').catch(() => '');
      if (hasMosfetInstance(text) && usesLevel1Class(text)) result.push({ key: `${corpus}/${circuit.id}`, circuit });
    }
  }
  return result;
}

async function issueCircuits(): Promise<Array<{ key: string; circuit: ClassicCircuit }>> {
  const files = (await readdir(resolve(directory, 'fixtures'))).filter(name => name.endsWith('.cir')).sort();
  const result = [];
  for (const file of files) {
    const localPath = relative(process.cwd(), resolve(directory, 'fixtures', file));
    const bytes = await readFile(localPath);
    result.push({
      key: `issue-530/${file.replace(/\.cir$/, '')}`,
      circuit: {
        id: file.replace(/\.cir$/, ''),
        category: 'mosfet-level1-body-effect',
        analyses: analysesOf(bytes.toString('utf8')),
        sourcePath: localPath,
        sourceUrl: 'project-authored (MIT)',
        localPath,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        ngspice: { expectedStatus: 'pass' },
        spiceTs: { expectedStatus: 'pass' },
      } as ClassicCircuit,
    });
  }
  return result;
}

async function main(): Promise<void> {
  const labelIndex = process.argv.indexOf('--label');
  const label = labelIndex >= 0 ? process.argv[labelIndex + 1] : undefined;
  if (label !== 'before' && label !== 'after') throw new Error('usage: compare.ts --label before|after');
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'packages/core/src', ':(exclude)*.test.ts'], { encoding: 'utf8' }).trim();
  const ngspiceVersion = execFileSync('ngspice', ['-v'], { encoding: 'utf8' })
    .split('\n').find(line => line.includes('ngspice-'))?.replace(/\*/g, '').trim();

  const fixtures = [];
  for (const { key, circuit } of [...await corpusCircuits(), ...await issueCircuits()]) {
    const input = await readFile(resolve(circuit.localPath));
    const sha256 = createHash('sha256').update(input).digest('hex');
    if (sha256 !== circuit.sha256) throw new Error(`${key}: hash ${sha256} differs from manifest`);
    const [spiceTs, ngspice] = await Promise.all([runNativeSpiceTs(input, circuit), runNativeNgspice(input, circuit)]);
    const comparisons = [];
    for (const analysis of spiceTs.analyses) {
      const reference = ngspice.analyses.find(candidate => candidate.type === analysis.type);
      if (!reference) continue;
      const signals = Object.keys(analysis.series.signals)
        .filter(name => name in reference.series.signals).sort();
      comparisons.push({ analysis: analysis.type, metrics: alignAndMeasure(analysis.series, reference.series, signals) });
    }
    fixtures.push({
      key,
      localPath: circuit.localPath,
      sha256,
      engines: {
        spiceTs: { status: spiceTs.status, convergence: spiceTs.convergence, error: spiceTs.error },
        ngspice: { status: ngspice.status, convergence: ngspice.convergence, error: ngspice.error },
      },
      comparisons,
    });
    process.stdout.write(`${key}\tspice-ts=${spiceTs.status}\tngspice=${ngspice.status}\n`);
  }

  await writeFile(resolve(directory, `${label}.json`), `${JSON.stringify({
    issue: 'https://github.com/mfiumara/spice-ts/issues/530',
    label,
    measuredRevision: revision,
    coreSourceDirty: dirty.length > 0,
    ngspice: ngspiceVersion,
    metricsOrder: 'abs max / abs RMS / rel max / rel RMS',
    fixtures,
  }, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
