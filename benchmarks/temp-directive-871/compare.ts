import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { platform, arch, release } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseNgspiceRaw } from '../comparison-harness.js';

async function main() {
  const root = resolve('benchmarks/temp-directive-871');
  const { simulate } = await import(pathToFileURL(resolve(process.argv[3] ?? 'packages/core/src/simulate.ts')).href);
  const rows = [];
  const names = ['single', 'before-options', 'after-options', 'repeated', 'multiple', 'empty', 'invalid', 'suffix', 'equals', 'spaced-equals', 'expression', 'quote', 'device'];
  const paths = names.map(name => [name, resolve(root, 'controls', `${name}.cir`)]);
  paths.push(['temper_capture_cards', resolve('benchmarks/corpus/ngspice-bugs/tickets/871/temper_capture_cards.cir')]);
  paths.push(['temper_capture_original', resolve('benchmarks/corpus/ngspice-bugs/fetched/871/temper_capture.cir')]);
  paths.push(['vbic99_dc', resolve('benchmarks/corpus/corpus-f/fixtures/examples/vbic/vbic99_dc.sp')]);
  mkdirSync(resolve(root, 'logs'), { recursive: true });
  for (const [name, path] of paths) {
    const deck = readFileSync(path, 'utf8');
    const startNg = performance.now();
    const rawPath = resolve(root, 'logs', `${name}.raw`);
    const ng = spawnSync('ngspice', ['-n', '-D', 'filetype=ascii', '-b', '-r', rawPath, path], { encoding: 'utf8', timeout: 30_000 });
    if (ng.error) throw ng.error;
    const ngMs = performance.now() - startNg;
    const log = ng.stdout + ng.stderr;
    writeFileSync(resolve(root, 'logs', `${name}.log`), log);
    const field = (key: string) => {
      const token = log.split('\n').map(line => line.trim().split(/\s+/)).find(parts => parts[0] === key)?.[1];
      return token !== undefined && Number.isFinite(Number(token)) ? Number(token) : null;
    };
    const rawSignals = existsSync(rawPath) ? parseNgspiceRaw(readFileSync(rawPath, 'utf8'))[0]?.signals : undefined;
    const rawCurrent = rawSignals?.['i(v1)']?.[0]?.re;
    const reference = rawCurrent ?? (name === 'temper_capture_original'
      ? Number(/-i\(v1\)\s*=\s*(\S+)/i.exec(log)?.[1] ?? NaN) * -1
      : field('v1#branch'));
    const start = performance.now();
    let values = null;
    let error = null;
    try {
      const result = await simulate(deck);
      values = result.dc ? { current: result.dc.current('V1'), temperature: names.includes(name) ? result.dc.voltage('b') : null,
        instanceVoltage: name === 'device' ? result.dc.voltage('c') : null }
        : { current: null, temperature: null, instanceVoltage: null };
    } catch (caught) { error = String(caught); }
    const pairs = [[values?.current, reference], [values?.temperature, rawSignals?.['v(b)']?.[0]?.re],
      [values?.instanceVoltage, rawSignals?.['v(c)']?.[0]?.re]];
    const errors = pairs.flatMap(([actual, expected]) => actual != null && expected != null && Number.isFinite(expected)
      ? [Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-30)] : []);
    const relative = errors.length ? Math.max(...errors) : null;
    const rms = errors.length ? Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length) : null;
    rows.push({ name, path: path.replace(process.cwd() + '/', ''), sha256: createHash('sha256').update(deck).digest('hex'),
      ngspice: { exit: ng.status, current: Number.isFinite(reference) ? reference : null,
        temperature: rawSignals?.['v(b)']?.[0]?.re ?? null, instanceVoltage: rawSignals?.['v(c)']?.[0]?.re ?? null, ms: ngMs },
      spiceTs: { values, error, ms: performance.now() - start }, comparedSignals: errors.length, maxRelativeError: relative, rmsRelativeError: rms,
      note: name === 'vbic99_dc' ? 'Unchanged control-block deck: ngspice exports no aligned vectors; plot errors retained in log, metrics null.'
        : name.startsWith('temper_capture') ? 'Formal-k shadowing differs deliberately: spice-ts 1/6 A vs ngspice47 1/56 A; not fixed by .temp.'
        : name === 'multiple' ? 'Native ngspice warns/falls back27; spice-ts explicitly rejects unsupported multi-temperature cards.' : 'OP scalar metric; full-precision ASCII raw reference.' });
  }
  const report = { baseline: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
    environment: { platform: platform(), arch: arch(), release: release(), node: process.version },
    ngspiceVersion: spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout,
    timingPolicy: 'Single-run wall times; ngspice includes process startup, spice-ts in-process. Not a speed claim.', rows };
  writeFileSync(resolve(root, process.argv[2] ?? 'after.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(rows.map(row => ({ name: row.name, error: row.spiceTs.error, relative: row.maxRelativeError })));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
