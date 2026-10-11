// Run from the repository root after pnpm build. Writes only the requested receipt.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { parse, simulate } from '../../packages/core/dist/index.js';
import { evaluateVectorExpression, parseVectorExpression } from '../../packages/core/src/parser/control/vector-expression.js';
import { runFixture } from '../corpus/corpus-f/outcomes.js';
import type { CorpusFManifest } from '../corpus/corpus-f/ingest.js';

async function main() {
  const root = 'benchmarks/control-language-488';
  const decks = ['probes', 'invalid-probes', 'idempotence'];
  const inputs = Object.fromEntries(decks.map(name => [name, readFileSync(`${root}/${name}.cir`, 'utf8')]));
  const ngspice = Object.fromEntries(decks.map(name => {
    const command = ['-b', `${root}/${name}.cir`];
    const run = spawnSync('ngspice', command, { encoding: 'utf8', timeout: 120_000 });
    return [name, { command: `ngspice ${command.join(' ')}`, exitCode: run.status, stdout: run.stdout, stderr: run.stderr }];
  }));
  const probes = [];
  for (const match of inputs.probes.matchAll(/^let c = (.+)$/gm)) {
    const expression = match[1];
    try {
      const value = evaluateVectorExpression(parseVectorExpression(expression), {
        lookup(name) { throw new Error(`no vector ${name}`); },
        userFunction: () => undefined, degrees: () => false,
      });
      probes.push({ expression, re: [...value.re], im: value.im ? [...value.im] : null });
    } catch (error) { probes.push({ expression, error: String(error) }); }
  }
  let fullScript;
  try { fullScript = (await simulate(inputs.probes)).control?.output; }
  catch (error) { fullScript = { error: String(error) }; }
  const circuit = parse(inputs.idempotence);
  const first = (await simulate(circuit)).control?.output;
  const second = (await simulate(circuit)).control?.output;
  const manifest = JSON.parse(readFileSync('benchmarks/corpus/corpus-f/manifest.json', 'utf8')) as CorpusFManifest;
  const ids = ['examples-control-structs-if-batchmode-cir', 'examples-various-param-sweep-cir', 'tests-regression-misc-bugs-1-cir'];
  const corpus = [];
  for (const id of ids) {
    const fixture = manifest.circuits.find(item => item.id === id);
    if (!fixture) throw new Error(`missing fixture ${id}`);
    corpus.push(await runFixture(fixture));
  }
  const report = {
    head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    trackedDiff: execFileSync('git', ['diff', '--stat'], { encoding: 'utf8' }),
    environment: { node: process.version, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0].model },
    ngspiceVersion: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }),
    hashes: Object.fromEntries(decks.map(name => [name, createHash('sha256').update(inputs[name]).digest('hex')])),
    ngspice, probes, fullScript, idempotence: { first, second, identical: JSON.stringify(first) === JSON.stringify(second) }, corpus,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (process.argv[2]) writeFileSync(process.argv[2], serialized);
  console.log(serialized);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
