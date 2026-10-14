// Prepared = immutable bundle/deck pins. Candidate changes only LU buffer growth.
import { instrument } from './rc1k-attribution-prepare.mjs';
import { M2_CIRCUITS, m2Netlist } from './scaling-m2-fixture.mjs';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const out = resolve(process.argv[2]);
if (existsSync(join(out, 'prepared.json'))) throw new Error('immutable preparation');
mkdirSync(out, { recursive: true });
const targets = { 'GilbertPeierlsSolver.factorize': 'factor', 'GilbertPeierlsSolver.growLFactors': 'growth', 'GilbertPeierlsSolver.growUFactors': 'growth' };
const hashes = {}, sourceHashes = {}, counts = {}, replacements = {};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const mode of ['control', 'candidate']) {
  mkdirSync(join(out, mode));
  writeFileSync(join(out, mode, 'package.json'), '{"type":"module"}\n');
  const modeCounts = {};
  for (const name of readdirSync('packages/core/dist').filter(n => n.endsWith('.js'))) {
    let source = readFileSync(join('packages/core/dist', name), 'utf8');
    sourceHashes[name] = hash(source);
    if (mode === 'candidate') for (const field of ['lValues', 'uValues']) {
      const before = `Math.max(4, this.${field}.length * 2)`;
      const matches = source.split(before).length - 1;
      replacements[field] = (replacements[field] ?? 0) + matches;
      source = source.replace(before, `Math.max(4, this.${field}.length * 4)`);
    }
    const code = instrument(source, name, modeCounts, targets);
    writeFileSync(join(out, mode, name), code);
    hashes[mode + '/' + name] = hash(code);
  }
  for (const key of Object.keys(targets)) if (modeCounts[key] !== 1) throw new Error('instrumentation drift: ' + key);
  counts[mode] = modeCounts;
}
if (Object.values(replacements).some(n => n !== 1)) throw new Error('candidate replacement drift');
const historical = JSON.parse(readFileSync('benchmarks/performance/results/scaling-matrix-2026-10-13/decks.json'));
const decks = [];
for (const size of [1000, 10000, 50000]) for (const circuit of M2_CIRCUITS) {
  const fixture = m2Netlist(circuit, size), deckSha256 = hash(fixture.netlist);
  if (historical.find(d => d.circuit === circuit && d.size === size)?.deckSha256 !== deckSha256) throw new Error('deck drift');
  const file = `${circuit}-${size}.cir`;
  writeFileSync(join(out, file), fixture.netlist);
  decks.push({ circuit, size, file, deckSha256, actualNodes: fixture.actualNodes });
}
writeFileSync(join(out, '.spiceinit'), 'option klu\n');
const provenance = Object.fromEntries(['benchmarks/performance/solver-growth-991.py', 'benchmarks/performance/solver-growth-991-prepare.mjs', 'benchmarks/performance/linear-10k-worker.mjs', 'benchmarks/performance/scaling-m2-fixture.mjs', 'benchmarks/performance/results/elapsed-controls-951/controls.py', 'packages/core/src/solver/gilbert-peierls.ts'].map(name => [name, hash(readFileSync(name))]));
writeFileSync(join(out, 'prepared.json'), JSON.stringify({ baseSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), factorComparison: true, sourceHashes, provenance, hashes, counts, replacements, decks, targets }, null, 2) + '\n');
