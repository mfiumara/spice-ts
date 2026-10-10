import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #388: ngspice-47 diode depletion capacitance defaults VJ (and VJSW)
// to 1 V and linearises the capacitance above FC*VJ (FCS*VJSW for the
// sidewall) as C = CJ0/F2 * (F3 + M*Vd/VJ), F2 = (1-FC)^(1+M),
// F3 = 1 - FC*(1+M), with FC = FCS = 0.5 by default (dioload.c/diotemp.c).

const acDeck = (bias: number, model: string, instance = '') => `diode depletion
V1 in 0 DC ${bias} AC 1
R1 in out 1k
D1 out 0 DM ${instance}
.model DM D ${model}
.ac dec 1 1e8 1e8
.end
`;

describe('diode depletion capacitance matches ngspice-47 (#388)', () => {
  it.each([
    // [label, DC bias, .model, instance params, ngspice-47 vm(out), vp(out)] at 100 MHz.
    ['default VJ=1 under reverse bias', -1, 'IS=1e-14 CJO=10p', '',
      2.1958562594229e-1, -1.349406616994],
    ['FC=0.5 linear extension above FC*VJ', 0.8, 'IS=1e-20 CJO=10p VJ=1', '',
      8.6257275393380e-2, -1.483534465820],
    ['default VJ in the forward linear extension', 0.8, 'IS=1e-20 CJO=10p', '',
      8.6257275393380e-2, -1.483534465820],
    ['explicit FC', 0.8, 'IS=1e-20 CJO=10p VJ=1 FC=0.3', '',
      9.7651893726168e-2, -1.471971687384],
    ['VJSW defaulting to 1 independently of VJ', -1, 'IS=1e-14 CJO=1p VJ=0.7 CJSW=10p', 'PJ=1',
      1.8203423737950e-1, -1.387741467371],
    ['sidewall FCS=0.5 linear extension', 0.8, 'IS=1e-20 CJSW=10p', 'PJ=1',
      1.0510534624767e-1, -1.464401157516],
    ['explicit FCS', 0.8, 'IS=1e-20 CJSW=10p FCS=0.2', 'PJ=1',
      1.1769158615533e-1, -1.451603074000],
  ])('%s', async (_label, bias, model, instance, magnitude, phase) => {
    const result = await simulate(acDeck(bias, model, instance));
    const out = result.ac!.voltage('out')[0];

    expect(Math.abs(out.magnitude - magnitude) / magnitude).toBeLessThan(1e-4);
    expect(Math.abs(out.phase * Math.PI / 180 - phase)).toBeLessThan(1e-4);
  });

  it('keeps the capacitance continuous across the FC*VJ boundary', async () => {
    const at = async (bias: number) => (await simulate(
      acDeck(bias, 'IS=1e-30 CJO=10p VJ=1 M=0.5'),
    )).ac!.voltage('out')[0].magnitude;
    const below = await at(0.5 - 1e-6);
    const above = await at(0.5 + 1e-6);

    expect(Math.abs(above - below) / below).toBeLessThan(1e-5);
  });
});
