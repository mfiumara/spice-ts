import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from '../../packages/core/src/parser/index.js';
import { simulate } from '../../packages/core/src/simulate.js';
import { BSIM4 } from '../../packages/core/src/devices/bsim4/device.js';

interface ReferenceCase {
  name: string; deck: string;
  native: { '@m1[gbs]': number; '@m1[gbd]': number; 'i(vb)': number };
}
const reference = JSON.parse(readFileSync(new URL('./paramchk-reference.json', import.meta.url), 'utf8')) as { cases: ReferenceCase[] };
const rows = [];
for (const row of reference.cases) {
  try {
    const device = parse(row.deck).compile().devices.find(d => d.name === 'M1') as BSIM4;
    const op = device.evaluate({ vgs: 1, vds: 0.5, vbs: 0.02 }, 1e-12);
    const result = await simulate(row.deck);
    const actual = { '@m1[gbs]': op.gbs, '@m1[gbd]': op.gbd, 'i(vb)': result.dc!.current('Vb') };
    const errors = Object.fromEntries(Object.entries(row.native).map(([key, value]) => {
      const delta = actual[key as keyof typeof actual] - value;
      return [key, { absolute: Math.abs(delta), relative: Math.abs(delta) / Math.max(Math.abs(value), 1e-18) }];
    }));
    rows.push({ name: row.name, outcome: 'compared', native: row.native, actual, errors });
  } catch (error) {
    rows.push({ name: row.name, outcome: error instanceof Error ? error.name : String(error), native: row.native, actual: null, errors: null });
  }
}
writeFileSync(new URL(`./paramchk-${process.argv[2] ?? 'after'}.json`, import.meta.url), JSON.stringify(rows, null, 2) + '\n');
console.log(JSON.stringify(rows));
