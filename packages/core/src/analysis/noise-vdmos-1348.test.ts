import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { InvalidCircuitError } from '../errors.js';
import { simulate } from '../simulate.js';

const deck = readFileSync(new URL('../../../../benchmarks/vdmos-noise/unsupported.cir', import.meta.url), 'utf8');

describe('VDMOS noise support boundary (#1348)', () => {
  it('rejects the identical ngspice-47 reproducer instead of returning resistor-only noise', async () => {
    await expect(simulate(deck)).rejects.toThrow(
      new InvalidCircuitError(".noise does not support VDMOS noise for 'M1'"),
    );
  });

  it.each(['nchan', 'pchan'])('rejects %s with and without self heating', async polarity => {
    for (const thermal of [false, true]) {
      const sign = polarity === 'pchan' ? -1 : 1;
      await expect(simulate(`VDMOS ${polarity} noise boundary
VDD vdd 0 DC ${sign * 10}
Vgate gate 0 DC ${sign * 3} AC 1
Rload vdd out 10
M1 out gate 0 ${thermal ? 'tj tc ' : ''}power ${thermal ? 'thermal' : ''}
${thermal ? 'Vcase tc 0 27' : ''}
.model power VDMOS (${polarity} VTO=${sign} KP=0.1 LAMBDA=0.02 RD=0.1 RS=0.1 RG=1 RB=1 KF=1e-25 AF=1 RTHJC=2 CTHJ=1m)
.noise v(out) Vgate lin 3 100 300
.end
`)).rejects.toThrow(new InvalidCircuitError(".noise does not support VDMOS noise for 'M1'"));
    }
  });

  it('rejects differential VDMOS noise output', async () => {
    await expect(simulate(deck.replace('.noise v(out)', '.noise v(out,vdd)')))
      .rejects.toThrow(new InvalidCircuitError('.noise differential voltage output only supports resistor noise'));
  });

  it('also rejects noise invoked only from .control', async () => {
    const controlDeck = deck.slice(0, deck.indexOf('.noise'))
      + '.control\nnoise v(out) Vgate lin 3 100 300\n.endc\n.end\n';
    await expect(simulate(controlDeck)).rejects.toThrow(
      new InvalidCircuitError(".noise does not support VDMOS noise for 'M1'"),
    );
  });

  it('preserves non-noise VDMOS simulation', async () => {
    const opDeck = deck.slice(0, deck.indexOf('.noise')) + '.op\n.end\n';
    const result = await simulate(opDeck);
    expect(result.dc!.voltage('out')).toBeGreaterThan(0);
    expect(result.noise).toBeUndefined();
  });
});
