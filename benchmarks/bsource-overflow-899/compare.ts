import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { platform, arch, release } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Original project-authored MIT probes. Both engines receive identical bytes.
// Run through spice-heavy; optional module path permits a frozen-source baseline.
async function main(): Promise<void> {
const modulePath = resolve(process.argv[2] ?? 'packages/core/src/simulate.ts');
const output = resolve(process.argv[3] ?? 'benchmarks/bsource-overflow-899/after.json');
const { simulate } = await import(pathToFileURL(modulePath).href);
const probes = [
  ['positive', '400', 'V(in)*1e307', ''],
  ['negative', '-400', 'V(in)*1e307', ''],
  ['finite', '10', 'V(in)*1e307', ''],
  ['bounded', '400', 'tanh(V(in)*1e307)', ''],
  ['conflict', '400', 'V(in)*1e307', 'V2 n2 0 1\n'],
];
const directory = resolve('benchmarks/bsource-overflow-899/generated');
mkdirSync(directory, { recursive: true });
const encode = (value: number) => Number.isFinite(value) ? value : String(value);
const rows = [];
for (const [name, input, expression, extra] of probes) {
  const deck = `overflow\nV1 in 0 ${input}\nB2 n2 0 V = ${expression}\n${extra}R2 n2 0 1k\n.op\n.end\n`;
  const path = resolve(directory, `${name}.cir`);
  writeFileSync(path, deck);
  const startNg = performance.now();
  const ng = spawnSync('ngspice', ['-b', path], { encoding: 'utf8', timeout: 30_000 });
  const ngMs = performance.now() - startNg;
  if (ng.error) throw ng.error;
  writeFileSync(resolve(directory, `${name}.ngspice.log`), ng.stdout + ng.stderr);
  const read = (label: string) => {
    const text = ng.stdout.split('\n').map(line => line.trim().split(/\s+/))
      .find(fields => fields[0] === label)?.[1];
    if (text === undefined) throw new Error(`Missing ngspice ${label} in ${name}`);
    return text === 'inf' ? Infinity : text === '-inf' ? -Infinity : Number(text);
  };
  const ngValues = ng.status === 0 ? [read('in'), read('n2'), read('b2#branch')] : null;
  const start = performance.now();
  let values: number[] | null = null;
  let error: string | null = null;
  try {
    const result = await simulate(deck);
    values = [result.dc.voltage('in'), result.dc.voltage('n2'), result.dc.current('B2')];
  } catch (caught) { error = String(caught); }
  const ms = performance.now() - start;
  const match = ngValues === null ? values === null : values !== null
    && values.every((value, i) => Object.is(value, ngValues[i])
      || (Number.isFinite(value) && Number.isFinite(ngValues[i])
        && Math.abs(value - ngValues[i]) <= 1e-12 * Math.max(1, Math.abs(ngValues[i]))));
  rows.push({ name, deck, sha256: createHash('sha256').update(deck).digest('hex'),
    ngspice: { exit: ng.status, values: ngValues?.map(encode), ms: ngMs },
    spiceTs: { values: values?.map(encode), error, ms }, match });
}
const report = { environment: { platform: platform(), arch: arch(), release: release(), node: process.version },
  modulePath, ngspiceVersion: spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout,
  note: 'Single-run timings include ngspice process startup and spice-ts in-process first-call overhead; not a speed comparison. Infinity is compared by sign, not RMS arithmetic.', rows };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
