import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { simulate } from '../simulate.js';
import { parse, UnsupportedModelFlagError } from './index.js';
import { parseModelCard } from './model-parser.js';

// ngspice-47 inpgmod.c create_model reads `.model` cards with `=` as a plain
// separator: a bare IF_FLAG parameter is set to 1 without consuming a value
// (inpgval.c), `name value` works without `=`, and stray numbers are skipped.
// spice-ts used to keep only `key=value` tokens and silently drop everything
// else, so BSIM1 `xpart` or a BJT `va 50` changed nothing.

function card(line: string) {
  return parseModelCard(line.replace(/[()]/g, ' $& ').trim().split(/\s+/), 7);
}

function failure(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

describe('.model bare tokens', () => {
  it('sets the BSIM1 (LEVEL=4) IF_FLAG xpart to 1 when written bare', () => {
    // ngspice-47: bare `xpart` gives |i(vd)| = 5.104868e-04 at 1 GHz (0/100
    // partitioning) vs 1.228931e-03 without it, so the flag must reach the model.
    const model = card('.model nmos nmos level=4 tox=0.03 vfb=-1 xpart muz=600');
    expect(model.params).toMatchObject({ LEVEL: 4, TOX: 0.03, VFB: -1, XPART: 1, MUZ: 600 });
  });

  it('finds LEVEL written after the flag and without `=`', () => {
    expect(card('.model m nmos (xpart level 4)').params).toEqual({ XPART: 1, LEVEL: 4 });
  });

  it('keeps BSIM3 xpart (IF_REAL) as a name-value pair', () => {
    expect(card('.model m nmos level=8 xpart 0.4').params).toEqual({ LEVEL: 8, XPART: 0.4 });
  });

  it('reads `name value` written without `=` (ngspice treats `=` as a separator)', () => {
    const model = card('.model qnl npn bf=80 rb=100 cjc=2pf va 50');
    expect(model.params).toEqual({ BF: 80, RB: 100, CJC: 2e-12, VA: 50 });
  });

  it('skips stray numbers like ngspice', () => {
    expect(card('.model q pnp (cje=9.54e-11 .00 fc=0.5)').params).toEqual({ CJE: 9.54e-11, FC: 0.5 });
  });

  it('accepts device-type flags that restate the card type without storing them', () => {
    expect(card('.model d1 d d is=1e-14').params).toEqual({ IS: 1e-14 });
    expect(card('.model q1 npn npn bf=50').params).toEqual({ BF: 50 });
    expect(card('.model l1 l l ind=1u').params).toEqual({ IND: 1e-6 });
  });

  it('accepts a bare VERSION string', () => {
    expect(card('.model m nmos level=8 version 3.3.0')).toMatchObject({ version: '3.3.0' });
  });

  it('rejects an unknown bare token with UNSUPPORTED_MODEL_FLAG instead of dropping it', () => {
    const error = failure(() => card('.model dm d (is=1e-14 foo)'));
    expect(error).toBeInstanceOf(UnsupportedModelFlagError);
    expect(error).toBeInstanceOf(ParseError);
    expect(error).toMatchObject({
      name: 'UnsupportedModelFlagError',
      code: 'UNSUPPORTED_MODEL_FLAG',
      modelName: 'dm',
      modelType: 'D',
      flag: 'FOO',
      acceptedFlags: ['D'],
      line: 7,
    });
  });

  it('rejects xpart as a bare flag outside BSIM1', () => {
    expect(failure(() => card('.model m nmos level=1 xpart'))).toMatchObject({
      code: 'UNSUPPORTED_MODEL_FLAG',
      flag: 'XPART',
      acceptedFlags: ['NMOS', 'PMOS'],
    });
  });

  it('rejects a polarity flag that contradicts the card type', () => {
    // ngspice-47 would flip the device to PNP; spice-ts takes polarity from the type.
    const error = failure(() => card('.model q1 npn bf=50 pnp'));
    expect(error).toBeInstanceOf(UnsupportedModelFlagError);
    expect((error as Error).message).toMatch(/contradicts the 'NPN' card polarity/);
  });

  it('reports the netlist line through parse()', () => {
    const error = failure(() => parse('t\nv1 a 0 1\nd1 a 0 dm\n.model dm d (is=1e-14 foo)\n.op\n.end\n'));
    expect(error).toMatchObject({ code: 'UNSUPPORTED_MODEL_FLAG', line: 4 });
  });

  it('matches ngspice-47 for a BJT Early voltage written `va 50`', async () => {
    // ngspice-47 -b: i(vc) = -6.15800e-04 for both `va 50` and `vaf=50`
    // (-5.67035e-04 without an Early voltage).
    const deck = (form: string) => `bjt early
vc c 0 5
vb b 0 0.7
q1 c b 0 qm
.model qm npn (bf=100 is=1e-15 ${form})
.op
.end
`;
    const bare = (await simulate(deck('va 50'))).dc!.current('vc');
    const named = (await simulate(deck('vaf=50'))).dc!.current('vc');
    expect(bare).toBe(named);
    expect(bare / -6.15800e-04).toBeCloseTo(1, 4);
  });
});
