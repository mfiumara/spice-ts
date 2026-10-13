// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import { simulate } from '../../packages/core/src/simulate.js';

type Observation = Record<string, number>;
try {
  const result = await simulate(readFileSync(process.argv[2], 'utf8'));
  if (!result.dc) throw new Error('Missing operating point');
  const values: Observation = {};
  for (const [name, value] of result.dc.voltages) {
    if (!Number.isFinite(value)) throw new Error(`Nonfinite ${name}`);
    values[`v(${name.toLowerCase()})`] = value;
  }
  console.log(JSON.stringify({ status: 'success', values }));
} catch (error) {
  console.log(JSON.stringify({ status: 'failure', error: (error as Error).message, values: null }));
  process.exitCode = 1;
}
