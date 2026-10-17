import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, parseTitleless, parseTitlelessAsync } from '../index.js';
import { simulate } from '../../simulate.js';

const deck = `Parameters
.param base = 1k
.param twice = {2*base}
V1 in 0 1
R1 in 0 {twice}
.subckt load a b resistance = 4k
.param local = 8k
Ra a b {resistance}
Rb a b {local}
.ends
V2 out 0 1
X1 out 0 load
X2 out 0 load resistance=2k
`;

async function currents(commands: string): Promise<number[]> {
  const result = await simulate(`${deck}.control\n${commands}\n.endc\n.end`);
  return result.control!.runs.map(run => run.result.dc!.current('V1'));
}

describe('alterparam and reset (#1180)', () => {
  it('runs the unchanged alterparam.sp fixture with ngspice-47 branch currents', async () => {
    const text = readFileSync(resolve('../../benchmarks/corpus/corpus-f/fixtures/examples/various/alterparam.sp'), 'utf8');
    const result = await simulate(text);
    const source = result.control!.runs.map(run => run.result.dc!.current('v1'));
    for (const [index, value] of [-1 / 3, -1 / 4, -1 / 4].entries()) expect(source[index]).toBeCloseTo(value, 14);
    const current = result.control!.runs.map(run => run.result.dc!.current('v2'));
    expect(current[0]).toBeCloseTo(-(1 / 7 + 1 / 9 + 1 / 8), 14);
    expect(current[1]).toBeCloseTo(current[0], 14);
    expect(current[2]).toBeCloseTo(-(1 / 13 + 1 / 15 + 1 / 17), 14);
  });

  it('runs all 19 operating points of unchanged loop-param.cir', async () => {
    const text = readFileSync(resolve('../../benchmarks/corpus/corpus-f/fixtures/examples/loops/loop-param.cir'), 'utf8');
    const runs = (await simulate(text)).control!.runs;
    expect(runs).toHaveLength(19);
    for (const [index, run] of runs.entries()) {
      expect(run.result.dc!.voltage('n1')).toBeCloseTo(1000 / (2000 - 50 * index), 14);
    }
  });

  it('defers parameter changes until reset and reevaluates dependencies', async () => {
    expect(await currents('op\nalterparam BASE = 2k\nop\nreset\nop')).toEqual([-0.0005, -0.0005, -0.00025]);
  });

  it('changes subcircuit defaults, body parameters and matching instance actuals like ngspice-47', async () => {
    const result = await simulate(`${deck}.control
op
alterparam LOAD resistance = 8k
alterparam load local = 16k
op
reset
op
.endc
.end`);
    const values = result.control!.runs.map(run => run.result.dc!.current('V2'));
    expect(values[0]).toBeCloseTo(-0.001, 14);
    expect(values[1]).toBeCloseTo(-0.001, 14);
    expect(values[2]).toBeCloseTo(-0.000375, 14);
  });

  it('restores alter, altermod and options state, preserves old plots and refreshes csparam', async () => {
    const result = await simulate(`Reset state
.param r=1k
.csparam val={r}
V1 in 0 1
R1 in 0 {r}
R2 in 0 rm
.model rm R (rsh=1k)
.control
op
alter R1 2k
altermod rm rsh=2k
option reltol=0.01
op
let val=9
reset
op
let saved=op1.i(V1)
echo $&saved $&val
.endc
.end`);
    expect(result.control!.runs.map(run => run.result.dc!.current('V1'))).toEqual([-0.002, -0.001, -0.002]);
    expect(result.control!.output).toEqual(['-0.002 1000']);
  });

  it('expands $& loop variables without discarding the user plot', async () => {
    expect(await currents('let value=1k\nrepeat 3\nalterparam base=$&value\nreset\nop\nsetplot const\nlet value=value+1k\nend'))
      .toEqual([-0.0005, -0.00025, -1 / 6000]);
  });

  it.each(['alterparam missing=2', 'alterparam nope r=2', 'alterparam load missing=2'])('reports structured unknown-name errors: %s', async command => {
    await expect(simulate(`${deck}.control\n${command}\n.endc\n.end`)).rejects.toMatchObject({
      code: 'CONTROL_SCRIPT_ERROR', context: command,
    });
  });

  it('supports included parameters and repeat simulations of a parsed circuit', async () => {
    const circuit = await parseTitlelessAsync(`.include values.inc
V1 in 0 1
R1 in 0 {r}
.control
alterparam r=2k
reset
op
.endc`, async () => '.param r=1k');
    for (let i = 0; i < 2; i++) expect((await simulate(circuit)).dc!.current('V1')).toBe(-0.0005);
  });

  it.each([parse, (text: string) => parseTitleless(text.slice(text.indexOf('\n') + 1))])('supports synchronous parser re-elaboration', async parser => {
    const circuit = parser(`${deck}.control\nalterparam base=2k\nreset\nop\n.endc\n.end`);
    expect((await simulate(circuit)).dc!.current('V1')).toBe(-0.00025);
    expect((await simulate(circuit)).dc!.current('V1')).toBe(-0.00025);
  });
});
