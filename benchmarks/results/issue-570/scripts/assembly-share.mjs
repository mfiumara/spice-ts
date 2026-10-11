// node assembly-share.mjs <dir> <cell...>: self-time share of MNA assembly frames
import { readFileSync } from 'node:fs';
const [dir, ...cells] = process.argv.slice(2);
const FRAMES = ['buildCompanionSystem', 'stampG', 'stampC', 'stampB', 'stamp', 'stampDynamic',
  'stampStaticDevices', 'stampDynamicDevices', 'stampPrevB', 'acceptTransientStep', 'slotOf', 'recordSlot'];
for (const cell of cells) {
  const p = JSON.parse(readFileSync(`${dir}/${cell}.cpuprofile`, 'utf8'));
  const hits = new Map();
  for (const id of p.samples) hits.set(id, (hits.get(id) ?? 0) + 1);
  let total = 0; const by = {};
  for (const n of p.nodes) {
    const h = hits.get(n.id) ?? 0; total += h;
    const f = n.callFrame.functionName;
    // Only spice-ts frames (dist chunk), not node internals named "stamp".
    if (FRAMES.includes(f) && n.callFrame.url.includes('packages/core/dist')) by[f] = (by[f] ?? 0) + h;
  }
  const sum = Object.values(by).reduce((a, b) => a + b, 0);
  const parts = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([f, h]) => `${f} ${(100 * h / total).toFixed(1)}%`);
  console.log(`${cell}: assembly ${(100 * sum / total).toFixed(1)}% (${parts.join(', ')})`);
}
