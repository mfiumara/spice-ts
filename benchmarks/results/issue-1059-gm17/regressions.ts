import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { original, pair } from './probe.js';

// Data shape: two independent unchanged-production passes, retaining failures as failures.
async function main() {
  const rows: unknown[] = [];
  const here = dirname(fileURLToPath(import.meta.url));
  for (const name of ['gm17', 'gm19', 'gm2', 'mike2', 'gm1', 'gm3', 'todd3', 'arom']) {
    const input = original(name);
    const passes = [];
    for (const pass of ['before', 'after']) {
      try {
        const { name: _name, input: _input, actual, reference, ...receipt } = await pair(`${name}-${pass}`, input);
        passes.push({ pass, ...receipt, tsPoints: actual.grid.length, ngPoints: reference.grid.length });
      } catch (error) { passes.push({ pass, failure: String(error) }); }
    }
    rows.push({ name, passes });
    writeFileSync(resolve(here, 'regressions.json'), JSON.stringify(rows, null, 2) + '\n');
    console.log(name, passes.map(p => 'errors' in p ? p.errors[0] : p));
  }
}
void main();
