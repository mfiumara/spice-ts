/** #812 solver-hint evidence. Identical pinned bytes, existing adapters and metrics.
 * Run only via spice-heavy pnpm exec tsx benchmarks/solver-selection/run.ts <output.jsonl>.
 * Fetch-only inputs must be prepared first; no corpus files or pins are modified.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runNativeNgspice, runNativeSpiceTs, type ClassicCircuit } from '../corpus/classic/report.js';
import { compareExecutions } from '../aggregate-report.js';

const ids = [645, 690, 691, 718, 720, 725, 852];
const corpus = resolve('benchmarks/corpus/ngspice-bugs');
const hash = (input: Buffer) => createHash('sha256').update(input).digest('hex');

async function main(): Promise<void> {
  if (process.argv[2] === '--child') {
    const path = process.argv[3];
    const input = readFileSync(path);
    const text = input.toString('utf8');
    if (!Buffer.from(text).equals(input)) throw new Error('not lossless UTF-8');
    const analyses = (['ac', 'tran', 'noise', 'pz', 'dc', 'op'] as const).filter(type => new RegExp(`^\\s*\\.${type}\\b`, 'im').test(text));
    const circuit: ClassicCircuit = { id: 'solver-selection', localPath: path, category: 'solver-selection', analyses: [...analyses], sourcePath: path, sourceUrl: '', sha256: hash(input), ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } };
    const own = await runNativeSpiceTs(input, circuit, { parseFirst: false });
    writeFileSync(process.argv[4], JSON.stringify({ status: 'running-ngspice', spiceTs: own }));
    const reference = await runNativeNgspice(input, circuit);
    const comparisons = own.status === 'success' && reference.status === 'success' ? compareExecutions(own, reference) : [];
    writeFileSync(process.argv[4], JSON.stringify({ netlistSha256: hash(input), spiceTs: own, ngspice: reference, comparisons }));
    return;
  }
  const output = resolve(process.argv[2]);
  if (existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
  const manifest = JSON.parse(readFileSync(resolve(corpus, 'manifest.json'), 'utf8'));
  appendFileSync(output, JSON.stringify({ core: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), generatedAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).trim() }) + '\n');
  let count = 0;
  for (const ticket of ids) {
    const entry = manifest.tickets.find((item: { ticket: number }) => item.ticket === ticket);
    for (const solver of ['klu', 'sparse']) {
      const deck = entry.uncommittedDecks.find((item: { name: string }) => item.name === `${solver}.cir`) ?? entry.committedDecks.find((item: { path: string }) => item.path.endsWith(`/${solver}.cir`));
      const path = deck.path ? resolve(corpus, deck.path) : resolve(corpus, 'fetched', String(ticket), deck.name);
      const actual = existsSync(path) ? hash(readFileSync(path)) : null;
      let receipt: unknown;
      if (actual !== deck.sha256) receipt = { status: 'provenance-gap', expectedSha256: deck.sha256, actualSha256: actual };
      else {
        const childOutput = `${output}.child.json`;
        if (existsSync(childOutput)) writeFileSync(childOutput, '{}');
        const completed = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--child', path, childOutput], { encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
        receipt = completed.status === 0 ? JSON.parse(readFileSync(childOutput, 'utf8')) : { status: 'child-failed', exitCode: completed.status, signal: completed.signal, error: completed.error?.message ?? completed.stderr, phase: existsSync(childOutput) ? JSON.parse(readFileSync(childOutput, 'utf8')) : null };
      }
      appendFileSync(output, JSON.stringify({ ticket, solver, receipt }) + '\n');
      count++;
      console.log(ticket, solver, JSON.stringify(receipt).slice(0, 220));
    }
  }
  if (count !== 14) throw new Error(`Expected 14 variants, got ${count}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
