// Prepared = source bundle hashes + deck hashes + exclusive instrumentation targets.
import { instrument, residualTargets } from '../../performance/rc1k-attribution-prepare.mjs';
import { m2Netlist } from '../../performance/scaling-m2-fixture.mjs';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const out = resolve(process.argv[2]);
if (existsSync(join(out, 'prepared.json'))) throw new Error('immutable preparation');
mkdirSync(out, { recursive: true });
const targets = { ...residualTargets, '_MOSFET.batchStamp': 'mosLoadStamp', '_MOSFET.stamp': 'mosLoadStamp', '_MOSFET.batchNewtonStepScale': 'mosLimit', '_MOSFET.convergenceTest': 'mosConvergence' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = {}, counts = {};
for (const mode of ['control', 'instrumented']) {
  mkdirSync(join(out, mode), { recursive: true });
  writeFileSync(join(out, mode, 'package.json'), '{"type":"module"}\n');
  for (const name of readdirSync('packages/core/dist').filter(n => n.endsWith('.js'))) {
    const source = readFileSync(join('packages/core/dist', name), 'utf8');
    const code = mode === 'instrumented' ? instrument(source, name, counts, targets) : source;
    writeFileSync(join(out, mode, name), code);
    hashes[mode + '/' + name] = hash(code);
  }
}
for (const key of Object.keys(targets)) if (counts[key] !== 1) throw new Error('instrumentation drift: ' + key + ' ' + counts[key]);
const decks = [];
for (const [circuit, size] of [['cmos-inverter-chain-tran', 1000], ['cmos-inverter-chain-tran', 10000], ['rc-ladder-tran', 10000], ['resistor-mesh-op', 10000]]) {
  const fixture = m2Netlist(circuit, size), file = `${circuit}-${size}.cir`;
  writeFileSync(join(out, file), fixture.netlist);
  decks.push({ circuit, size, file, deckSha256: hash(fixture.netlist) });
}
writeFileSync(join(out, '.spiceinit'), 'option klu\n');
writeFileSync(join(out, 'prepared.json'), JSON.stringify({ baseSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), hashes, counts, targets, decks }, null, 2) + '\n');
