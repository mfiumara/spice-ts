import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';

const circuit = `noise plot identity
V1 1 0 dc 1 ac 1
R1 1 2 1k
R2 2 0 1k`;

describe('ngspice-47 noise plot identity (#1170)', () => {
  it('keeps single-frequency spectra current and resolves their let vectors and setplot names', async () => {
    const result = await simulate(`${circuit}
.control
op
noise v(1) V1 dec 1 1k 1k
let gold = 7
echo $curplot $&gold
noise v(1) V1 dec 1 1k 1k
let gold = 9
echo $curplot $&gold
setplot noise1
echo $&gold
setplot noise2
echo $&gold
ac dec 1 1k 1k
echo $curplot
.endc`);
    expect(result.control!.runs.map(run => run.plot)).toEqual(['op1', 'noise1', 'noise2', 'ac2']);
    expect(result.control!.output).toEqual(['noise1 7', 'noise2 9', '7', '9', 'ac2']);
  });

  it('retains ngspice’s shared numbering cursor across interleaved analysis types', async () => {
    // Observed with ngspice -b 47 on this block, not independent per-type counters.
    const result = await simulate(`${circuit}
.control
op
op
ac lin 1 1 1
echo $curplot
noise v(2) V1 dec 1 1 1
echo $curplot
noise v(2) V1 dec 1 1 1
echo $curplot
ac lin 1 1 1
echo $curplot
.endc`);
    expect(result.control!.runs.map(run => run.plot)).toEqual(['op1', 'op2', 'ac2', 'noise2', 'noise3', 'ac3']);
    expect(result.control!.output).toEqual(['ac2', 'noise2', 'noise3', 'ac3']);
  });

  it('still makes a multi-frequency integrated noise plot current before a single-frequency run', async () => {
    const result = await simulate(`${circuit}
.control
noise v(2) V1 dec 1 1 10
echo $curplot
let total = onoise_total
noise v(1) V1 dec 1 10 10
echo $curplot
setplot noise2
echo $&total
.endc`);
    expect(result.control!.runs.map(run => run.plot)).toEqual(['noise1', 'noise3']);
    expect(result.control!.output.slice(0, 2)).toEqual(['noise2', 'noise3']);
    expect(Number(result.control!.output[2])).toBeGreaterThan(0);
  });
});
