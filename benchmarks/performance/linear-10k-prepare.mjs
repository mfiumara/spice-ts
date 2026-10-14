// Prepared = {baseSha, counts, hashes, decks}; copies are benchmark-only.
import { targets, instrument } from './rc1k-attribution-prepare.mjs';
import { parseTargets } from './parse-1000-targets.mjs';
import { m2Netlist } from './scaling-m2-fixture.mjs';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
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
const beforeIndex = process.argv.indexOf('--before');
const before = beforeIndex < 0 ? undefined : resolve(process.argv[beforeIndex + 1]);
const beforeHashes = before ? JSON.parse(readFileSync(join(before, 'prepared.json'), 'utf8')).hashes : undefined;
const selectedTargets = process.argv.includes('--parse') ? parseTargets : targets;
mkdirSync(out, { recursive: true });
const counts = {}, hashes = {};
for (const mode of before ? ['control', 'candidate'] : ['control', 'instrumented']) {
  mkdirSync(join(out, mode), { recursive: true });
  writeFileSync(join(out, mode, 'package.json'), '{"type":"module"}\n');
  const sourceDirectory = before && mode === 'control' ? join(before, 'control') : 'packages/core/dist';
  for (const name of new Set(readdirSync(sourceDirectory).map(n => n.replace(/\.gz$/, '')).filter(n => n.endsWith('.js')))) {
    const sourcePath = join(sourceDirectory, name);
    const source = existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : gunzipSync(readFileSync(sourcePath + '.gz')).toString('utf8');
    const code = mode === 'instrumented' ? instrument(source, name, counts, selectedTargets) : source;
    writeFileSync(join(out, mode, name), code);
    hashes[mode + '/' + name] = createHash('sha256').update(code).digest('hex');
    if (before && mode === 'control' && hashes[mode + '/' + name] !== beforeHashes[mode + '/' + name]) throw new Error('before bundle drift');
  }
}
if (!before) for (const name of Object.keys(selectedTargets)) if (counts[name] !== 1) throw new Error(`expected one ${name}, got ${counts[name]}`);
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
writeFileSync(join(out, 'prepared.json'), JSON.stringify({ baseSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), counts, hashes, decks, targets: selectedTargets, attribution: process.argv.includes('--parse') ? 'parse' : 'solver', ...(before ? { comparison: true, before, runSizes: [1000, 10000, 50000] } : {}) }, null, 2) + '\n');
