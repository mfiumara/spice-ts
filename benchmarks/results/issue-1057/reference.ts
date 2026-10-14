import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { parseNgspiceRaw } from '../../comparison-harness.js';

// Original synthetic probes, MIT (repository licence). No deck edits between engines.
const engine = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout;
if (!/ngspice-47\b/.test(engine)) throw new Error('requires ngspice-47');
const directory = resolve('benchmarks/results/issue-1057');
const home = mkdtempSync(resolve(tmpdir(), 'mos3-1057-'));
const references = [];
try {
  writeFileSync(resolve(home, '.spiceinit'), 'set filetype=ascii\n');
  for (const polarity of ['nmos', 'pmos']) {
    for (const series of ['', 'RD=40 RS=25', 'RSH=20']) {
      for (const temperature of [100, -40]) {
        const sign = polarity === 'nmos' ? 1 : -1;
        const deck = `MOS3 temperature law #1057
VD supply 0 ${sign * 3}
RD supply d 1k
VG g 0 SIN(${sign * 1.8} ${sign * 0.1} 10meg)
VB b 0 ${sign * -0.3}
M1 d g s b MOD W=10u L=3u M=2 AD=20p AS=15p PD=14u PS=12u NRD=2 NRS=3
RS s 0 100
.MODEL MOD ${polarity} LEVEL=3 TNOM=50 VTO=${sign * 0.7} KP=50u GAMMA=0.4 PHI=0.7 TOX=25n NSUB=1e16 UO=500 XJ=0.2u VMAX=1e5 NFS=1e11 THETA=0.05 ETA=0.02 KAPPA=0.3 DELTA=0.2 JS=1e-4 CJ=4e-4 CJSW=3e-10 CGSO=2e-10 CGDO=2e-10 ${series}
.OPTIONS TEMP=${temperature} RELTOL=1e-8 VNTOL=1e-12 ABSTOL=1e-16
.OP
.TRAN 1n 100n 0 0.1n
.END\n`;
        writeFileSync(resolve(home, 'probe.cir'), deck);
        const run = spawnSync('ngspice', ['-b', '-r', 'probe.raw', 'probe.cir'], {
          cwd: home, env: { ...process.env, HOME: home }, encoding: 'utf8',
        });
        if (run.status !== 0) throw new Error(run.stdout + run.stderr);
        const plots = parseNgspiceRaw(readFileSync(resolve(home, 'probe.raw'), 'utf8'));
        const op = plots.find(plot => /operating point/i.test(plot.plotName))!;
        const tran = plots.find(plot => /transient/i.test(plot.plotName))!;
        const names = ['v(d)', 'v(s)', 'i(vd)'];
        const sample = (name: string, time: number) => {
          let i = 1;
          while (i < tran.grid.length - 1 && tran.grid[i] < time) i++;
          const f = (time - tran.grid[i - 1]) / (tran.grid[i] - tran.grid[i - 1]);
          return tran.signals[name][i - 1].re + f * (tran.signals[name][i].re - tran.signals[name][i - 1].re);
        };
        const id = `${polarity}-${series.startsWith('RD') ? 'direct' : series ? 'sheet' : 'none'}-${temperature}`;
        references.push({ id, deck, sha256: createHash('sha256').update(deck).digest('hex'),
          op: names.map(name => op.signals[name][0].re),
          tran: Array.from({ length: 11 }, (_, i) => [i * 1e-8, ...names.map(name => sample(name, i * 1e-8))]),
        });
        console.log(id, references.at(-1)!.op);
      }
    }
  }
  writeFileSync(resolve(directory, 'reference.json'), JSON.stringify({ engine: 'ngspice-47',
    command: 'spice-heavy pnpm exec tsx benchmarks/results/issue-1057/reference.ts',
    invocation: 'ngspice -b -r probe.raw probe.cir; isolated HOME .spiceinit sets filetype=ascii; identical deck bytes',
    references }, null, 2) + '\n');
} finally {
  rmSync(home, { recursive: true, force: true });
}
