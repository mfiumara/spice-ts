// Pin each build and the unchanged MIT M2 decks before measuring.
import { m2Netlist } from '../../performance/scaling-m2-fixture.mjs';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const [directory, mode] = process.argv.slice(2);
if (!['control', 'candidate'].includes(mode)) throw new Error('unknown mode');
const out = resolve(directory);
const target = join(out, mode);
if (existsSync(target)) throw new Error('immutable bundle');
mkdirSync(target, { recursive: true });
writeFileSync(join(target, 'package.json'), '{"type":"module"}\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = {};
for (const name of readdirSync('packages/core/dist').filter(n => n.endsWith('.js'))) {
  const bytes = readFileSync(join('packages/core/dist', name));
  writeFileSync(join(target, name), bytes);
  hashes[name] = hash(bytes);
}
const decks = [];
for (const [circuit, size] of [['cmos-inverter-chain-tran', 1000], ['cmos-inverter-chain-tran', 10000], ['rc-ladder-tran', 10000], ['resistor-mesh-op', 10000]]) {
  const file = `${circuit}-${size}.cir`;
  const bytes = m2Netlist(circuit, size).netlist;
  if (existsSync(join(out, file)) && readFileSync(join(out, file), 'utf8') !== bytes) throw new Error('deck drift');
  writeFileSync(join(out, file), bytes);
  decks.push({ circuit, size, file, deckSha256: hash(bytes) });
}
writeFileSync(join(out, `${mode}-bundle.json`), JSON.stringify({ baseSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), hashes }, null, 2) + '\n');
if (!existsSync(join(out, 'prepared.json'))) writeFileSync(join(out, 'prepared.json'), JSON.stringify({ decks }, null, 2) + '\n');
