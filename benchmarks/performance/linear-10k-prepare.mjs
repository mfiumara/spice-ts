// Prepared = {baseSha, counts, hashes, decks}; copies are benchmark-only.
import { targets, instrument } from './rc1k-attribution-prepare.mjs';
import { m2Netlist } from './scaling-m2-fixture.mjs';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
Object.assign(targets, {
  'MNAAssembler.constructor': 'matrixBuild',
  'MNAAssembler.lockTopology': 'matrixBuild',
  'GilbertPeierlsSolver.analyzePattern': 'ordering',
  'DCResult.constructor': 'outputMaterialization',
});
const out = resolve(process.argv[2]);
mkdirSync(out, { recursive: true });
const counts = {}, hashes = {};
for (const mode of ['control', 'instrumented']) {
  mkdirSync(join(out, mode), { recursive: true });
  writeFileSync(join(out, mode, 'package.json'), '{"type":"module"}\n');
  for (const name of readdirSync('packages/core/dist').filter(n => n.endsWith('.js'))) {
    const source = readFileSync(join('packages/core/dist', name), 'utf8');
    const code = mode === 'instrumented' ? instrument(source, name, counts) : source;
    writeFileSync(join(out, mode, name), code);
    hashes[mode + '/' + name] = createHash('sha256').update(code).digest('hex');
  }
}
for (const name of Object.keys(targets)) if (counts[name] !== 1) throw new Error(`expected one ${name}, got ${counts[name]}`);
const previous = JSON.parse(readFileSync('benchmarks/performance/results/scaling-matrix-2026-10-13/decks.json'));
const decks = [];
for (const size of [1000, 10000, 50000]) for (const circuit of ['rc-ladder-tran', 'resistor-mesh-op']) {
  const fixture = m2Netlist(circuit, size);
  const deckSha256 = createHash('sha256').update(fixture.netlist).digest('hex');
  if (deckSha256 !== previous.find(d => d.circuit === circuit && d.size === size).deckSha256) throw new Error('deck drift');
  const file = `${circuit}-${size}.cir`;
  writeFileSync(join(out, file), fixture.netlist);
  decks.push({ circuit, size, file, deckSha256, actualNodes: fixture.actualNodes, probe: fixture.probe });
}
writeFileSync(join(out, '.spiceinit'), 'option klu\n');
writeFileSync(join(out, 'prepared.json'), JSON.stringify({ baseSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), counts, hashes, decks }, null, 2) + '\n');
