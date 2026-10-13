import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

const root = resolve(import.meta.dirname, '../../../..');
const matrix = JSON.parse(readFileSync(resolve(root, 'benchmarks/comma-numparam-797/matrix.json'), 'utf8')) as { id: string; path: string }[];
const reference = JSON.parse(readFileSync(resolve(root, 'benchmarks/comma-numparam-797/receipt.json'), 'utf8')) as {
  rows: { id: string; referenceValues: Record<string, number> | null }[];
};

describe('#797 source-derived X-card assignment boundaries', () => {
  for (const entry of matrix.filter(entry => entry.id !== 'unbraced-missing-value')) {
    it(entry.id, async () => {
      const deck = readFileSync(resolve(root, entry.path), 'utf8');
      const values = reference.rows.find(row => row.id === entry.id)!.referenceValues;
      if (values === null) {
        await expect(simulate(deck)).rejects.toThrow();
      } else {
        const dc = (await simulate(deck)).dc!;
        for (const [name, value] of Object.entries(values)) {
          expect(dc.voltage(name.slice(2, -1))).toBeCloseTo(value, 6);
        }
      }
    });
  }

  it('uses arbitrary names and caller expressions in a nested call', async () => {
    const result = await simulate(`nested assignments
.subckt encode o params: alpha=1 beta=1 gamma=1
I1 0 o {alpha*100+beta*10+gamma}
R0 o 0 1
.ends
.subckt caller o params: v=7
Xchild o encode gamma={v},beta={99},alpha={99}
.ends
Xouter o caller v=4
.op
.end`);
    expect(result.dc!.voltage('o')).toBeCloseTo(114, 12);
  });

  it('does not evaluate comma-prefixed ignored expressions', async () => {
    const result = await simulate(`ignored override
.subckt cell o params: alpha=1 beta=1
I1 0 o {alpha*10+beta}
R0 o 0 1
.ends
X1 o cell alpha={2},beta={undefined_name}
.op
.end`);
    expect(result.dc!.voltage('o')).toBeCloseTo(21, 12);
  });
});
