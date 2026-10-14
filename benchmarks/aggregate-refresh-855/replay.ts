import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import { compareExecutions, runBoundedSpiceTs, type AggregateReport } from '../aggregate-report.js';
import { runNativeNgspice, type ClassicCircuit, type EngineExecution } from '../corpus/classic/report.js';

async function main(): Promise<void> {
  const [root, snapshot, output, commit] = process.argv.slice(2);
  const report = JSON.parse(await readFile(resolve(root, 'benchmarks/aggregate-report.json'), 'utf8')) as AggregateReport;
  const corpora = ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e'];
  type Circuit = ClassicCircuit & { spiceTs: ClassicCircuit['spiceTs'] & { failureKind?: string } };
  const circuits = new Map<string, Circuit>();
  for (const corpus of corpora) {
    const manifest = JSON.parse(await readFile(resolve(root, `benchmarks/corpus/${corpus}/manifest.json`), 'utf8')) as { circuits: Circuit[] };
    for (const circuit of manifest.circuits) circuits.set(`${corpus}/${circuit.id}`, circuit);
  }
  const rows = [];
  for (const fixture of report.fixtures) {
    const circuit = circuits.get(fixture.key)!;
    const input = await readFile(resolve(root, fixture.localPath));
    if (createHash('sha256').update(input).digest('hex') !== fixture.input.sha256) {
      throw new Error(`${fixture.key}: input bytes differ from the generated report`);
    }
    const cache = resolve(snapshot, '..', `${fixture.key.replace('/', '-')}.v8`);
    let ngspice: EngineExecution;
    try { ngspice = deserialize(await readFile(cache)); }
    catch {
      ngspice = await runNativeNgspice(input, circuit);
      await writeFile(cache, serialize(ngspice));
    }
    process.chdir(snapshot);
    const { execution } = await runBoundedSpiceTs(input, circuit, 120_000);
    process.chdir(root);
    const comparisons = compareExecutions(execution, ngspice);
    rows.push({
      key: fixture.key,
      status: execution.status === 'success' ? 'success' : execution.status === 'unsupported' || circuit.spiceTs.failureKind === 'unsupported' ? 'unsupported' : 'failed',
      convergence: execution.convergence,
      analyses: execution.analyses.map(analysis => ({
        type: analysis.type,
        points: analysis.series.grid.length,
        signals: Object.keys(analysis.series.signals).sort(),
      })).sort((a, b) => a.type.localeCompare(b.type)),
      comparisons,
    });
  }
  await appendFile(output, `${JSON.stringify({ commit, rows, sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') })}\n`);
  console.log(`${commit}: ${rows.length} fixtures`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
