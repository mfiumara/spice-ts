import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';

const deck = `* public linearize plot record
V1 in 0 PWL(0 0 1u 1 2u 0)
R1 in 0 1k
.tran 0.5u 2u`;

async function run(commands: string) {
  return simulate(`${deck}\n.control\n${commands}\nquit\n.endc\n.end`);
}

describe('linearize public plot identity (#1010)', () => {
  it('exports the new plot without replacing or mutating the solved plot', async () => {
    // ngspice-47: tran1 retains the adaptive record; tran2 has five uniform
    // points, v(in)=[0,.5,1,.5,0] and i(v1)=-v(in)/1000.
    const result = await run('run\nlinearize\necho $curplot');
    const runs = result.control!.runs;
    expect(runs.map(({ plot, analysis }) => [plot, analysis])).toEqual([
      ['tran1', 'tran'], ['tran2', 'tran'],
    ]);
    expect(result.control!.output).toEqual(['tran2']);
    const original = runs[0].result.transient!;
    const linearized = runs[1].result.transient!;
    expect(original.time.length).toBeGreaterThan(5);
    expect(original.time).not.toBe(linearized.time);
    expect(linearized.time).toEqual([0, 0.5e-6, 1e-6, 1.5e-6, 2e-6]);
    expect(linearized.voltage('in')).toHaveLength(5);
    [0, 0.5, 1, 0.5, 0].forEach((value, index) => {
      expect(linearized.voltage('in')[index]).toBeCloseTo(value, 13);
    });
    linearized.current('v1').forEach((value, index) => {
      expect(value).toBeCloseTo(-linearized.voltage('in')[index] / 1000, 15);
    });
    expect(result.transient).toBe(linearized);
    expect(runs[1].result.convergence).toBeUndefined(); // no new solver execution
  });

  it('exports only selected circuit vectors and keeps earlier plots across repeated transforms', async () => {
    const result = await run('run\nlinearize np=4 v(in)\nlinearize np=3 v(in)\nsetplot tran1\necho $curplot');
    const runs = result.control!.runs;
    expect(runs.map(({ plot }) => plot)).toEqual(['tran1', 'tran2', 'tran3']);
    expect(runs.map(({ result }) => result.transient!.time.length).slice(1)).toEqual([4, 3]);
    expect([...runs[1].result.transient!.voltages.keys()]).toEqual(['in']);
    expect([...runs[1].result.transient!.currents.keys()]).toEqual([]);
    expect(runs[2].result.transient!.voltage('in')).toHaveLength(3);
    [0, 0.5, 1].forEach((value, index) => {
      expect(runs[2].result.transient!.voltage('in')[index]).toBeCloseTo(value, 13);
    });
    expect(result.control!.output).toEqual(['tran1']);
  });

  it('exports a selected branch current using its device name, not as a voltage', async () => {
    const result = await run('run\nlinearize i(v1)');
    expect(result.control!.runs.map(({ plot }) => plot)).toEqual(['tran1', 'tran2']);
    const transformed = result.control!.runs[1].result.transient!;
    expect([...transformed.voltages.keys()]).toEqual([]);
    expect([...transformed.currents.keys()]).toEqual(['V1']);
    expect(transformed.current('V1')[2]).toBeCloseTo(-0.001, 15);
  });

  it('does not mislabel user vectors as circuit voltages or change the post-control deck run', async () => {
    const result = await simulate(`${deck}\n.control\nrun\nlet custom = 2*v(in)\nlinearize\n.endc\n.end`);
    const runs = result.control!.runs;
    expect(runs.map(({ plot }) => plot)).toEqual(['tran1', 'tran2']);
    expect([...runs[1].result.transient!.voltages.keys()]).not.toContain('custom');
    expect(result.transient!.time.length).toBeGreaterThan(5);
    expect(result.transient).not.toBe(runs[1].result.transient);
  });

  it('uses the latest record when destroy allows a plot name to be reused', async () => {
    const result = await run('run\nlinearize v(in)\ndestroy tran2\nsetplot tran1\nlinearize i(v1)\nlinearize i(v1)');
    const runs = result.control!.runs;
    expect(runs.map(({ plot }) => plot)).toEqual(['tran1', 'tran2', 'tran2', 'tran3']);
    expect([...runs[1].result.transient!.currents.keys()]).toEqual([]);
    expect(runs[3].result.transient!.current('v1')[2]).toBeCloseTo(-0.001, 15);
  });
});

describe('new-check-3 DC plot (#1010)', () => {
  it('keeps the three solved samples despite longer user-created vectors in the same plot', async () => {
    // ngspice-47 write-all raw header has No.Points=8 due to foo/vec8,
    // but explicitly dims=3 for v(v-sweep), v(1), and i(vin). Rows 3..7
    // are export padding, not additional DC solutions or sweep groups.
    const fixture = readFileSync(new URL(
      '../../../../../benchmarks/corpus/corpus-f/fixtures/examples/control_structs/new-check-3.sp', import.meta.url,
    ), 'utf8');
    const result = await simulate(fixture);
    expect(result.control!.output).toEqual(['INFO: ok']);
    expect(result.control!.runs.map(({ plot }) => plot)).toEqual(['dc1']);
    const dc = result.control!.runs[0].result.dcSweep!;
    expect(Array.from(dc.sweepValues)).toEqual([0, 5, 10]);
    expect(Array.from(dc.voltage('1'))).toEqual([0, 5, 10]);
    expect(Array.from(dc.current('vin'))).toEqual([0, 0, 0]);
  });
});
