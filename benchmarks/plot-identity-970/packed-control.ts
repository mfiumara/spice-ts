import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { analysisType } from '../corpus/classic/report.js';
import { controlWrapperDeck, noReferenceNote } from '../corpus/corpus-f/control-vectors.js';
import { corpusFPlotType, firstNgspiceErrorLine, scoredPlotTypes, scrub } from '../corpus/corpus-f/lib.js';
import { readNgspiceRawFilePacked } from '../corpus/corpus-f/raw-stream.js';
import type { PackedExecution } from '../corpus/corpus-f/packed.js';
import type { CorpusFCircuit } from '../corpus/corpus-f/ingest.js';
import { declaredSecondaryGrid } from '../sweep-coordinates.js';

/** Same source/write wrapper and retained-plot order; only sample storage differs. */
export async function packedControlReference(input: Buffer, circuit: Pick<CorpusFCircuit, 'analyses' | 'unmappedAnalyses'>, keep?: (plotName: string, signal: string) => boolean): Promise<PackedExecution> {
  const types = scoredPlotTypes(circuit);
  const directory = await mkdtemp(resolve(tmpdir(), 'plot-970-packed-control-'));
  try {
    await writeFile(resolve(directory, 'fixture.cir'), input);
    await writeFile(resolve(directory, '.spiceinit'), 'set filetype=ascii\n');
    await writeFile(resolve(directory, 'wrapper.cir'), controlWrapperDeck(types));
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: directory };
    delete env.DISPLAY;
    const run = spawnSync('ngspice', ['-b', 'wrapper.cir'], { cwd: directory, env, encoding: 'utf8', timeout: 600_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 });
    const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    const error = firstNgspiceErrorLine(output, directory);
    if (run.error || run.status !== 0) return { status: 'failed', convergence: 'failed', analyses: [], error: scrub(run.error?.message ?? error ?? `ngspice exited ${run.status ?? run.signal}`, directory) };
    const analyses: PackedExecution['analyses'] = [];
    const files = (await readdir(directory)).filter(name => /^(?:op|dc|ac|tran|noise|pz|disto|sp|sens)\d+\.raw$/.test(name))
      .sort((a, b) => types.indexOf(a.replace(/\d+\.raw$/, '') as typeof types[number]) - types.indexOf(b.replace(/\d+\.raw$/, '') as typeof types[number]) || Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    for (const file of files) {
      const type = file.replace(/\d+\.raw$/, '') as typeof types[number];
      if (!types.includes(type)) continue;
      for (const plot of await readNgspiceRawFilePacked(resolve(directory, file), keep)) {
        if (corpusFPlotType(plot.plotName, analysisType) !== type) continue;
        const plotId = file.replace(/\.raw$/, '');
        const secondary = declaredSecondaryGrid(input.toString('utf8'), plotId, plot.grid);
        analyses.push({ type: type as PackedExecution['analyses'][number]['type'], plotId, plotName: plot.plotName, grid: Float64Array.from(plot.grid), signals: plot.signals, ...(secondary ? { secondaryGrid: Float64Array.from(secondary) } : {}) });
      }
    }
    if (!analyses.length && error) return { status: 'failed', convergence: 'failed', analyses: [], error };
    return { status: 'success', convergence: 'converged', analyses, ...(!analyses.length ? { error: noReferenceNote(circuit) } : {}) };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
