/** #737 oracle search, not a scored corpus refresh. Run through spice-heavy.
 * fetch.ts 737, then prepare-737.ts before running.
 * Output path is mandatory and must not exist. Derived short/OP probes are
 * explicitly diagnostic NEW variants; the original pin is never replaced.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { simulate } from '../../../packages/core/dist/index.js';
import { parseNgspiceRaw } from '../../comparison-harness.js';
import { HERE, loadManifest } from './render.js';
import { oracleDiagnostic } from './oracle-diagnostics.js';

const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
async function main(): Promise<void> {
  const output = process.argv[2];
  if (!output || existsSync(output)) throw new Error('Supply a new output receipt path');
  const directory = resolve(HERE, 'fetched/737');
  if (existsSync(join(directory, '.spiceinit'))) throw new Error('Refusing to overwrite existing .spiceinit');
  const entry = (await loadManifest()).tickets.find(item => item.ticket === 737)!;
  if (hash(readFileSync(join(directory, 'Test.zip'))) !== entry.attachments[0].sha256) throw new Error('archive pin mismatch');
  const original = readFileSync(join(directory, entry.uncommittedDecks[0].name), 'utf8');
  if (hash(original) !== entry.uncommittedDecks[0].sha256) throw new Error('original deck pin mismatch');
  // Independent native configuration, no model/device edits or tolerance tuning.
  const probes = [
    { name: 'original', text: original },
    ...['1e-10', '1e-9', '1e-6'].map(stop => ({ name: `NEW-short-${stop}`, text: original.replace('.TRAN 1m 10m', `.TRAN 1m ${stop}`) })),
    { name: 'NEW-op', text: original.replace('.TRAN 1m 10m', '.op') },
  ];
  const rows: unknown[] = [];
  for (const probe of probes) {
    let own: unknown;
    try {
      const result = await simulate(probe.text, { resolveInclude: async name => readFileSync(resolve(directory, name), 'utf8') });
      own = result.transient ? { status: 'success', points: result.transient.time.length, finalTime: result.transient.time.at(-1), initialCurrents: Object.fromEntries(Array.from(result.transient.currents, ([name, values]) => [name, values[0]])) } : { status: 'success', voltages: Object.fromEntries(result.dc!.voltages), currents: Object.fromEntries(result.dc!.currents) };
    } catch (error) { own = { status: 'failed', error: oracleDiagnostic(String(error)) }; }
    const native = [];
    for (const mode of ['native', 'ltps']) {
      const scratch = mkdtempSync(join(tmpdir(), 'oracle-737-'));
      try {
        const deck = join(scratch, 'probe.cir');
        const raw = join(scratch, 'probe.raw');
        writeFileSync(deck, probe.text);
        // CWD remains the include tree, so includes resolve identically for both engines.
        writeFileSync(join(directory, '.spiceinit'), `set filetype=ascii\n${mode === 'ltps' ? 'set ngbehavior=ltps\n' : ''}`);
        const run = spawnSync('ngspice', ['-b', '-r', raw, deck], { cwd: directory, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
        const plots = existsSync(raw) ? parseNgspiceRaw(readFileSync(raw, 'utf8')).map(plot => ({ plotName: plot.plotName, points: plot.grid.length, initialTime: plot.grid[0], finalTime: plot.grid.at(-1), signals: Object.fromEntries(Object.entries(plot.signals).map(([name, values]) => [name, [values[0], values.at(-1)]])) })) : [];
        native.push({ mode, exitCode: run.status, signal: run.signal, diagnostics: oracleDiagnostic((run.stdout ?? '') + (run.stderr ?? '') + (run.error?.message ?? ''), run.status === 0), plots });
      } finally { rmSync(scratch, { recursive: true, force: true }); rmSync(join(directory, '.spiceinit'), { force: true }); }
    }
    rows.push({ name: probe.name, sha256: hash(probe.text), bytes: Buffer.byteLength(probe.text), spiceTs: own, ngspice: native });
    console.log(probe.name, JSON.stringify(own).slice(0, 120), native.map(run => [run.mode, run.exitCode]));
    writeFileSync(output, JSON.stringify({ core: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), ngspiceVersion: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).trim(), rows }, null, 2) + '\n');
  }
}
main().catch(error => { console.error(oracleDiagnostic(String(error))); process.exitCode = 1; });
