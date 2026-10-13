// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import { simulate } from '../../packages/core/src/simulate.js';

type Observation = Record<string, number>;
const [deckPath, observations] = process.argv.slice(2);
try {
  const result = await simulate(readFileSync(deckPath, 'utf8'));
  if (!result.dc) throw new Error('Missing DC operating point');
  const values: Observation = {};
  for (const name of JSON.parse(observations) as string[]) {
    const match = /^([vi])\(([^)]+)\)$/.exec(name);
    if (!match) throw new Error(`Invalid observation ${name}`);
    values[name] = match[1] === 'v' ? result.dc.voltage(match[2]) : result.dc.current(match[2]);
    if (!Number.isFinite(values[name])) throw new Error(`Nonfinite ${name}`);
  }
  console.log(JSON.stringify({ status: 'success', values }));
} catch (error) {
  console.log(JSON.stringify({ status: 'failure', error: (error as Error).message, values: null }));
  process.exitCode = 1;
}
