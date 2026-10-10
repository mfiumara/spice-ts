import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from '../parser/index.js';
import { InvalidCircuitError } from '../errors.js';

// Issue #365: ngspice treats the diode model fields CJO (letter O) and CJ0
// (digit zero) as the same zero-bias junction capacitance.

const acDeck = (model: string, analysis = '.ac dec 1 1e8 1e8') => `cjo alias
V1 in 0 DC -1 AC 1
R1 in out 1k
D1 out 0 DM
.model DM D ${model}
${analysis}
.end
`;

describe('diode CJO alias of CJ0 (#365)', () => {
  it.each([
    // ngspice-47 `print vm(out)` at 100 MHz on the identical deck.
    ['IS=1e-14 CJO=10p VJ=1', 2.195856259423e-1],
    ['IS=1e-14 cjo=10p vj=1', 2.195856259423e-1],
    // RS splits the junction onto an internal node only when charge exists.
    ['IS=1e-14 CJO=10p VJ=1 RS=200', 2.466152278764e-1],
  ])('applies .model DM D %s in AC like ngspice-47', async (model, ngspice47) => {
    const result = await simulate(acDeck(model));

    const magnitude = result.ac!.voltage('out')[0].magnitude;
    expect(Math.abs(magnitude - ngspice47) / ngspice47).toBeLessThan(1e-4);
  });

  it('produces the same transient waveform for CJO and CJ0', async () => {
    const tran = '.tran 0.1n 50n';
    const pulse = (model: string) => acDeck(model, tran)
      .replace('DC -1 AC 1', 'PULSE(-1 1 0 1n 1n 20n 50n)');
    const withCJO = (await simulate(pulse('IS=1e-14 CJO=10p'))).transient!;
    const withCJ0 = (await simulate(pulse('IS=1e-14 CJ0=10p'))).transient!;

    expect(Array.from(withCJO.time)).toEqual(Array.from(withCJ0.time));
    expect(Array.from(withCJO.voltage('out'))).toEqual(Array.from(withCJ0.voltage('out')));
  });

  it('produces the same noise spectrum for CJO and CJ0', async () => {
    const noise = '.noise v(out) V1 dec 2 1e7 1e9';
    const withCJO = (await simulate(acDeck('IS=1e-14 CJO=10p', noise))).noise!;
    const withCJ0 = (await simulate(acDeck('IS=1e-14 CJ0=10p', noise))).noise!;

    expect(withCJO.outputNoiseDensity).toEqual(withCJ0.outputNoiseDensity);
    expect(withCJO.outputNoiseDensity[withCJO.outputNoiseDensity.length - 1])
      .toBeLessThan(withCJO.outputNoiseDensity[0] / 2);
  });

  it('accepts CJO and CJ0 supplied together with the same value', async () => {
    const both = await simulate(acDeck('IS=1e-14 CJO=10p CJ0=10p VJ=1'));
    const single = await simulate(acDeck('IS=1e-14 CJ0=10p VJ=1'));

    expect(both.ac!.voltage('out')[0].magnitude)
      .toBe(single.ac!.voltage('out')[0].magnitude);
  });

  it('rejects conflicting CJO and CJ0 values with a structured error', () => {
    expect(() => parse(acDeck('IS=1e-14 CJO=10p CJ0=2p')).compile()).toThrow(
      new InvalidCircuitError(
        "Diode 'D1' sets both CJO=1e-11 and CJ0=2e-12; they are aliases of the same "
          + 'zero-bias junction capacitance, so supply only one',
      ),
    );
  });
});
