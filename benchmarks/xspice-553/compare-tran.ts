/**
 * Issue #553 slice 2: run the transient fixture through ngspice-47 and
 * spice-ts and print the worst normalised difference per signal, both ways:
 *   st->ng: spice-ts samples against ngspice linearly interpolated (corpus-f metric direction)
 *   ng->st: ngspice samples against spice-ts linearly interpolated
 * Errors are divided by the peak |ngspice| value of the signal.
 *
 *   pnpm exec tsx benchmarks/xspice-553/compare-tran.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { simulate } from '../../packages/core/src/index.js';

const FIXTURE = resolve('benchmarks/xspice-553/fixtures/tran.cir');
const SIGNALS = ['10', '20', '30', '60'];

function interpolate(times: ArrayLike<number>, values: ArrayLike<number>, t: number): number {
  let i = 1;
  while (i < times.length - 1 && times[i] < t) i++;
  const f = (t - times[i - 1]) / (times[i] - times[i - 1]);
  return values[i - 1] + f * (values[i] - values[i - 1]);
}

async function main(): Promise<void> {
  const deck = readFileSync(FIXTURE, 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'xspice-553-'));
  try {
    writeFileSync(join(dir, 'tran.cir'), deck);
    execFileSync('ngspice', ['-b', 'tran.cir'], { cwd: dir, stdio: 'ignore' });
    const rows = readFileSync(join(dir, 'ngspice-tran.txt'), 'utf8').trim().split('\n')
      .map(line => line.trim().split(/\s+/).map(Number));
    const result = await simulate(deck.replace(/\.control[\s\S]*?\.endc\n/, '.tran 0.01ms 2ms\n'));
    const tran = result.transient!;
    console.log(`points: spice-ts ${tran.time.length}, ngspice ${rows.length}`);
    SIGNALS.forEach((node, k) => {
      const ngTime = rows.map(row => row[2 * k]);
      const ngValue = rows.map(row => row[2 * k + 1]);
      const values = tran.voltage(node);
      const peak = Math.max(...ngValue.map(Math.abs));
      let stToNg = 0;
      for (let i = 0; i < tran.time.length; i++) {
        stToNg = Math.max(stToNg, Math.abs(values[i] - interpolate(ngTime, ngValue, tran.time[i])));
      }
      let ngToSt = 0;
      for (let i = 0; i < ngTime.length; i++) {
        ngToSt = Math.max(ngToSt, Math.abs(ngValue[i] - interpolate(tran.time, values, ngTime[i])));
      }
      console.log(`v(${node}) st->ng ${(stToNg / peak).toExponential(2)}  ng->st ${(ngToSt / peak).toExponential(2)}`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
