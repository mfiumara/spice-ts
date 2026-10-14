import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paired } from './diagnose.js';
async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const input = execFileSync('git', ['show', '66d67caf:benchmarks/corpus/corpus-l/fixtures/xyce/Netlists/CircuitSim90/MOS3/gm17.cir'], { encoding: 'utf8' });
  const rows = [];
  for (const [name, options] of [['bypass-off', 'bypass=0'], ['moderate', 'reltol=1e-5 abstol=1e-13 vntol=1e-7'], ['tight', 'reltol=1e-6 abstol=1e-15 vntol=1e-9'], ['tight-bypass-off', 'reltol=1e-6 abstol=1e-15 vntol=1e-9 bypass=0']]) {
    try {
    const { ts: _ts, reference: _reference, ...receipt } = await paired(`gm17-${name}`, input.replace(/^\.end\s*$/mi, `.options ${options}\n.end`), 'tran');
    rows.push({ name, options, ...receipt });
    console.log(name, receipt.errors.slice(0, 3));
    } catch (error) {
      rows.push({ name, options, failure: String(error) });
      console.log(name, 'FAILED (recorded)');
    }
  }
  writeFileSync(resolve(here, 'startup.json'), JSON.stringify(rows, null, 2) + '\n');
}
void main();
