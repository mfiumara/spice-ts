import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Original synthetic MIT-licensed MOS2 probes. Both engines consume the same deck.
const directory = resolve('benchmarks/results/issue-995');
const references = [];
for (const polarity of ['nmos', 'pmos']) {
  for (const series of ['', 'RD=40 RS=25', 'RSH=20']) {
    for (const temperature of [27, 50, 125]) {
      const sign = polarity === 'nmos' ? 1 : -1;
      const deck = `MOS2 temperature law #995
VD supply 0 ${sign * 3}
RD supply d 1k
VG g 0 SIN(${sign * 1.8} ${sign * 0.1} 10meg)
VB b 0 ${sign * -0.3}
M1 d g s b MOD W=10u L=3u AD=20p AS=15p PD=14u PS=12u NRD=2 NRS=3
RS s 0 100
.MODEL MOD ${polarity} LEVEL=2 TNOM=50 VTO=${sign * 0.7} KP=50u GAMMA=0.4 PHI=0.7 TOX=25n NSUB=1e16 UO=500 UCRIT=2e4 UEXP=0.15 XJ=0.2u LAMBDA=0.03 JS=1e-4 CJ=4e-4 CJSW=3e-10 CBD=10f CBS=12f CGSO=2e-10 CGDO=2e-10 ${series}
.OPTIONS TEMP=${temperature} RELTOL=1e-8 VNTOL=1e-12 ABSTOL=1e-16
.OP
.TRAN 1n 100n 0 0.1n
.END`;
      const id = `${polarity}-${series.startsWith('RD') ? 'direct' : series ? 'sheet' : 'none'}-${temperature}`;
      const path = resolve(directory, 'probe.cir');
      writeFileSync(path, deck.replace('.END', `.control\nset numdgt=15\nset wr_singlescale\nset wr_vecnames\nop\nwrdata ${directory}/op.txt v(d) v(s) i(VD)\ntran 1n 100n 0 0.1n\nlinearize v(d) v(s) i(VD)\nwrdata ${directory}/tran.txt v(d) v(s) i(VD)\nquit\n.endc\n.END`));
      const result = spawnSync('ngspice', ['-b', path], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stdout + result.stderr);
      const rows = (file: string) => readFileSync(resolve(directory, file), 'utf8').trim().split('\n').slice(1).map(line => line.trim().split(/\s+/).map(Number));
      // Keep eleven evenly spaced points over one complete sinusoidal cycle.
      references.push({ id, deck, op: rows('op.txt')[0].slice(1), tran: rows('tran.txt').filter((_, index) => index % 10 === 0) });
      console.log(id, references.at(-1)!.op, references.at(-1)!.tran.length);
    }
  }
}
writeFileSync(resolve(directory, 'reference.json'), JSON.stringify({ engine: 'ngspice-47', command: 'pnpm exec tsx benchmarks/results/issue-995/reference.ts', references }, null, 2) + '\n');
for (const name of ['probe.cir', 'op.txt', 'tran.txt']) rmSync(resolve(directory, name));
