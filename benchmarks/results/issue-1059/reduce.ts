import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paired } from './diagnose.js';
const here = dirname(fileURLToPath(import.meta.url));
const source = execFileSync('git', ['show', '66d67caf:benchmarks/corpus/corpus-l/fixtures/xyce/Netlists/CircuitSim90/MOS3/gm2.cir'], { encoding: 'utf8' });
const models = source.slice(source.indexOf('.model'), source.indexOf('* seq.'));
const circuits = {
  inverter: 'mp1 3 2 1 1 pn4a w=56u l=3u as=504p ad=504p\nmn1 3 2 0 0 nn4a w=23u l=3u as=207p ad=207p\nc3 3 0 .084p',
  pair: 'mp1 3 2 1 1 pn4a w=56u l=3u as=504p ad=504p\nmn1 3 2 0 0 nn4a w=23u l=3u as=207p ad=207p\nc3 3 0 .084p\nmp2 4 3 1 1 pn4a w=56u l=3u as=504p ad=504p\nmn2 4 3 0 0 nn4a w=23u l=3u as=207p ad=207p\nc4 4 0 .084p',
};
async function main() {
const rows = [];
for (const [name, circuit] of Object.entries(circuits)) {
  const deck = `Reduced gm2 ${name}, GPL-3.0-or-later Xyce-derived\n${models}\nvdd 1 0 10\nvp 2 0 pulse(0 10 10n 1n 1n 30n 100n)\n${circuit}\n.tran 1n 200n\n.end\n`;
  writeFileSync(resolve(here, `${name}.cir`), deck);
  const base = await paired(`reduced-${name}`, deck, 'tran');
  const fine = await paired(`reduced-${name}-fine`, deck.replace('.tran 1n 200n', '.tran 1n 200n 0 50p'), 'tran');
  const op = await paired(`reduced-${name}-op`, deck.replace('.tran 1n 200n', '.op'), 'op');
  const strip = ({ ts: _ts, reference: _reference, ...rest }: Awaited<ReturnType<typeof paired>>) => rest;
  rows.push({ name, base: strip(base), fine: strip(fine), op: strip(op) });
  console.log(name, base.errors.slice(0, 3), fine.errors.slice(0, 1));
}
writeFileSync(resolve(here, 'reduction.json'), JSON.stringify(rows, null, 2) + '\n');
}
void main();
