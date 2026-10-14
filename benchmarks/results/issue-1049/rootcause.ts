/** #1049 weak-node diagnostic. Vendor inputs stay fetch-only; receipts contain numbers/hashes only. */
import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { simulate } from '../../../packages/core/dist/index.js';
import { parseNgspiceRaw } from '../../comparison-harness.js';
import { sanitizeDiagnostics } from './diagnostics.js';

type Point = Record<string, number>;
type Trial = { name: string; sha256: string; own: Point; native: Point; exitCode: number | null; diagnostics: string };
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
async function main(): Promise<void> {
  const output = process.argv[2];
  assert(output && !existsSync(output), 'Supply a new receipt path');
  const source = resolve('benchmarks/corpus/ngspice-bugs/fetched/737');
  const manifest = JSON.parse(readFileSync('benchmarks/corpus/ngspice-bugs/manifest.json', 'utf8'));
  const entry = manifest.tickets.find((item: { ticket: number }) => item.ticket === 737);
  assert.equal(hash(readFileSync(join(source, 'Test.zip'))), entry.attachments[0].sha256);
  const scratch = mkdtempSync(join(tmpdir(), '1049-rootcause-'));
  const trials: Trial[] = [];
  try {
    cpSync(join(source, 'spice_lib'), join(scratch, 'spice_lib'), { recursive: true });
    writeFileSync(join(scratch, '.spiceinit'), 'set filetype=ascii\nset ngbehavior=ltps\n');
    const original = readFileSync(join(source, 'OPA890Test.local.cir'), 'utf8');
    assert.equal(hash(original), 'b58eda0bc033ac63358e66f275efeff0af13534ffe7cb3efbe391f13b1c15965');
    const full = original.replace('.TRAN 1m 10m', '.op');
    const reduced = ['XQ37 diagnostic', ...original.split('\n').filter(line => /^\.include|^XQ37 /.test(line)), '.options rshunt=1T', 'VG Net-_Q37-G_ 0 5.773723910677543', '.op', '.end', ''].join('\n');
    async function run(name: string, deck: string): Promise<void> {
      writeFileSync(join(scratch, 'probe.cir'), deck);
      const raw = join(scratch, 'probe.raw');
      rmSync(raw, { force: true });
      const native = spawnSync('ngspice', ['-b', '-r', raw, 'probe.cir'], { cwd: scratch, env: { ...process.env, HOME: scratch, SPICE_USERINIT_DIR: scratch }, encoding: 'utf8', timeout: 120_000 });
      assert.equal(native.status, 0, `${name} native failed`);
      const point: Point = {};
      for (const plot of parseNgspiceRaw(readFileSync(raw, 'utf8'))) for (const [signal, values] of Object.entries(plot.signals)) point[signal.toLowerCase()] = values[0].re;
      const result = await simulate(deck, { resolveInclude: async file => readFileSync(resolve(scratch, file), 'utf8') });
      const own: Point = {};
      for (const [node, value] of result.dc!.voltages) own[`v(${node.toLowerCase()})`] = value;
      for (const [branch, value] of result.dc!.currents) own[`i(${branch.toLowerCase()})`] = value;
      trials.push({ name, sha256: hash(deck), own, native: point, exitCode: native.status, diagnostics: sanitizeDiagnostics(native.stdout + native.stderr) });
      writeFileSync(output, JSON.stringify({ trials }, null, 2) + '\n');
      assert(Object.values(own).every(Number.isFinite) && Object.values(point).every(Number.isFinite));
      console.log(name, own['v(net-_q37-s_)'] ?? own['v(weak)'] ?? own['i(vbias)'], point['v(net-_q37-s_)'] ?? point['v(weak)'] ?? point['i(vbias)']);
    }
    const authored = readFileSync('benchmarks/results/issue-1049/weak-diode.cir', 'utf8');
    await run('linear-control', readFileSync('benchmarks/results/issue-1049/shunt-control.cir', 'utf8'));
    for (const resistance of ['1G', '2147483647', '2147483648', '3G', '1T', '1000000000000.5']) {
      await run(`linear-${resistance}`, readFileSync('benchmarks/results/issue-1049/shunt-control.cir', 'utf8').replace('rshunt=1T', `rshunt=${resistance}`));
      await run(`authored-${resistance}`, authored.replace('rshunt=1T', `rshunt=${resistance}`));
      if (['2147483647', '1T', '1000000000000.5'].includes(resistance)) {
        await run(`XQ37-${resistance}`, reduced.replace('rshunt=1T', `rshunt=${resistance}`));
        await run(`full-${resistance}`, full.replace('rshunt=1T', `rshunt=${resistance}`));
      }
    }
    await run('linear-explicit-resistor', readFileSync('benchmarks/results/issue-1049/shunt-control.cir', 'utf8').replace('.options rshunt=1T', 'Rshunt high 0 1T'));
    writeFileSync(output, JSON.stringify({ core: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), machine: `${platform()} ${arch()}`, node: process.version, ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).trim(), originalSha256: hash(original), trials }, null, 2) + '\n');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
