import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from '../parser/index.js';

// ngspice-47, identical deck, `op; print v(tj) i(v1)` at numdgt=15.
const deck = `Self heating diode reference
V1 in 0 0.7
D1 in 0 tj DM thermal
.model DM D (RS=0.2 RTH0=100 TNOM=25)
.options reltol=1e-10 abstol=1e-14 vntol=1e-12
.op
.end`;

describe('diode self-heating (#1261)', () => {
  it.each(['1N4148', '2N_model'])('accepts digit-prefixed thermal model %s at top level and in subcircuits', async model => {
    const namedDeck = deck.replaceAll('DM', model);
    const topLevel = await simulate(namedDeck);
    const nested = await simulate(namedDeck.replace(`D1 in 0 tj ${model} thermal`, `X1 in tj cell
.subckt cell a t
D1 a 0 t ${model} thermal
.ends`));
    for (const result of [topLevel, nested]) {
      expect(Math.abs(result.dc!.voltage('tj') / 0.5266979962662843 - 1)).toBeLessThan(1e-6);
      expect(Math.abs(result.dc!.current('V1') / -0.00752425708951854 - 1)).toBeLessThan(1e-6);
    }
  });

  it('matches ngspice-47 OP temperature rise and current within 1 ppm', async () => {
    const result = await simulate(deck);
    expect(Math.abs(result.dc!.voltage('tj') / 0.5266979962662843 - 1)).toBeLessThan(1e-6);
    expect(Math.abs(result.dc!.current('V1') / -0.00752425708951854 - 1)).toBeLessThan(1e-6);
  });

  it('maps the third node inside a subcircuit and survives netlist serialization', async () => {
    const circuit = parse(deck.replace('D1 in 0 tj DM thermal', `X1 in tj cell
.subckt cell a t
D1 a 0 t DM thermal
.ends`));
    const result = await simulate(circuit);
    expect(Math.abs(result.dc!.voltage('tj') / 0.5266979962662843 - 1)).toBeLessThan(1e-6);
    const roundtrip = await simulate(parse(deck).toNetlist());
    expect(roundtrip.dc!.voltage('tj')).toBeCloseTo(result.dc!.voltage('tj'), 9);
  });

  it('integrates CTH0 with the thermal RC time constant', async () => {
    const result = await simulate(`thermal RC
V1 in 0 0
Iheat 0 tj PULSE(0 1 1m 1u 1u 1 2)
D1 in 0 tj DM thermal
.model DM D (RTH0=100 CTH0=1m)
.tran 100u 0.201 0 100u
.end`);
    const final = result.transient!.voltage('tj').at(-1)!;
    expect(Math.abs(final / (100 * (1 - Math.exp(-2))) - 1)).toBeLessThan(0.001);
  });

  it('rejects unimplemented thermal small-signal and junction-charge paths', async () => {
    await expect(simulate(deck.replace('.op', '.ac lin 1 1 1'))).rejects.toThrow('AC/noise');
    await expect(simulate(deck.replace('RTH0=100', 'RTH0=100 CJO=1p'))).rejects.toThrow('junction charge');
  });
});
