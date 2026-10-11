// node table.mjs <prof-before-dir> <prof-after-dir> -> markdown top-5 self time per deck
import { readFileSync } from 'node:fs';
const [bdir, adir] = process.argv.slice(2);
const cells = ['rc-ladder-tran-1000', 'rc-ladder-tran-10000', 'rc-ladder-tran-50000',
  'resistor-mesh-op-1000', 'resistor-mesh-op-10000', 'resistor-mesh-op-50000',
  'cmos-inverter-chain-tran-1000', 'cmos-inverter-chain-tran-10000'];
function top(dir, cell) {
  const text = readFileSync(`${dir}/${cell}.summary.txt`, 'utf8');
  const sampled = text.match(/samples, ([\d.]+) ms sampled/)[1];
  const section = text.split('Top self time')[1].split('Top inclusive time')[0];
  const rows = section.trim().split('\n').map(line => {
    const m = line.trim().match(/^([\d.]+) ms\s+([\d.]+)%\s+(.+?)(?:\s+\S+:\d+)?$/);
    return m ? `${m[3]} ${m[2]}%` : null;
  }).filter(Boolean).slice(0, 5);
  return { sampled: (Number(sampled) / 1000).toFixed(2), rows };
}
console.log('| deck | build | sampled s | #1 | #2 | #3 | #4 | #5 |');
console.log('|---|---|---:|---|---|---|---|---|');
for (const cell of cells) {
  for (const [label, dir] of [['before', bdir], ['after', adir]]) {
    const t = top(dir, cell);
    console.log(`| ${cell} | ${label} | ${t.sampled} | ${t.rows.join(' | ')} |`);
  }
}
