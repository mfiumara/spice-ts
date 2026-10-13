import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from './parser/index.js';
import { simulate } from './simulate.js';

const shared = `shared resistor model
V1 supply 0 1
R1 supply a shared
R2 supply b shared
RA a 0 1k
RB b 0 1k
.model shared R (r=1k)`;

const script = (commands: string) => `${shared}\n.control\n${commands}\n.endc\n.end`;

describe('altermod instance-to-model aliases', () => {
  it('executes the identical ngspice-47 minimal reproduction', async () => {
    const deck = readFileSync(new URL('../../../benchmarks/altermod-alias-930/minimal.cir', import.meta.url), 'utf8');
    const result = await simulate(deck);
    expect(result.dc!.voltage('a')).toBeCloseTo(1 / 3, 12);
    expect(result.dc!.voltage('b')).toBeCloseTo(1 / 3, 12);
  });

  it.each(['shared', 'SHARED', 'r1', 'R2'])('alters the shared model through %s, not just one instance', async target => {
    const result = await simulate(script(`altermod ${target} r=2k\nop`));
    expect(result.dc!.voltage('a')).toBeCloseTo(1 / 3, 12);
    expect(result.dc!.voltage('b')).toBeCloseTo(1 / 3, 12);
  });

  it('supports semiconductor aliases using the same model resolution', async () => {
    const deck = `diode alias
V1 a 0 0.5
D1 a 0 dm
.model dm D (is=1e-12)
.control
altermod d1 is=2e-12
op
.endc`;
    const result = await simulate(deck);
    const edited = await simulate(deck.replace('is=1e-12', 'is=2e-12').replace(/\.control[\s\S]*/, '.op'));
    expect(result.dc!.current('V1')).toBe(edited.dc!.current('V1'));
  });

  it('prefers the instance alias when a model has the same name, as ngspice-47 does', async () => {
    const deck = readFileSync(new URL('../../../benchmarks/altermod-alias-930/targets.cir', import.meta.url), 'utf8');
    const result = await simulate(deck.replace(/altermod missing[\s\S]*/, '.endc\n.end'));
    const runs = result.control!.runs;
    expect(runs[0].result.dc!.voltage('a')).toBeCloseTo(1 / 3, 12);
    expect(runs[0].result.dc!.voltage('b')).toBeCloseTo(0.25, 12);
    expect(runs[1].result.dc!.voltage('a')).toBeCloseTo(0.2, 12);
    expect(runs[1].result.dc!.voltage('b')).toBeCloseTo(0.25, 12);
  });

  it.each(['missing', 'RA', 'V1'])('keeps unknown/model-less target errors for %s', async target => {
    await expect(simulate(script(`altermod ${target} r=2k\nop`))).rejects.toThrow('no top-level .model named');
  });

  it('does not confuse subcircuit names with device models', async () => {
    const circuit = parse(`subcircuit alias
.subckt cell p
R1 p 0 1k
.ends cell
X1 a cell
V1 a 0 1
.model cell R (r=1k)`);
    expect(circuit.alterModel('X1', 'r', 2000)).toBeDefined();
    expect(circuit.parameterVector('cell', 'r')).toEqual([1000]);
  });

  it.each(['op', 'altermod absent r=3k\nop', 'let bad=1/0', 'quit 1'])('restores the caller model after %s', async ending => {
    const circuit = parse(script(`altermod R1 r=2k\n${ending}`));
    if (ending === 'op') {
      const first = await simulate(circuit);
      const second = await simulate(circuit);
      expect(second.dc!.voltage('a')).toBe(first.dc!.voltage('a'));
    } else {
      await expect(simulate(circuit)).rejects.toThrow();
    }
    expect(circuit.parameterVector('shared', 'r')).toEqual([1000]);
  });

  it('retains csparam scalars while switching plots and repeatedly altering aliases', async () => {
    const result = await simulate(`${shared}
.csparam resistance=1k
.control
set curplot=new
set savedplot=$curplot
let step=0
while step < 3
altermod r1 r=$&resistance
op
setplot $savedplot
let resistance=resistance+1k
let step=step+1
end
.endc`);
    expect(result.control!.runs.map(run => run.result.dc!.voltage('a'))).toEqual([
      0.5, 1 / 3, 0.25,
    ]);
  });
});
