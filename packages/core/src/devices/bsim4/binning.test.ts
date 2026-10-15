import { describe, expect, it } from 'vitest';
import { parse } from '../../parser/index.js';
import { UnsupportedModelVersionError } from '../../errors.js';
import { BSIM4 } from './device.js';

const first = '.model dut.1 nmos level=54 version=4.8 vth0=0.7 lmin=1u lmax=2u wmin=1u wmax=2u';
const second = '.model dut.2 nmos level=54 version=4.8 vth0=0.9 lmin=2u lmax=3u wmin=1u wmax=2u';
function device(cards: string, geometry = 'l=2u w=1u', name = 'dut'): BSIM4 {
  return parse(`Binning\n${cards}\nM1 d g 0 0 ${name} ${geometry}\nVd d 0 1\nVg g 0 1\n.op\n.end`).compile().devices.find(d => d.name === 'M1') as BSIM4;
}
function current(cards: string, geometry?: string, name?: string): number {
  return device(cards, geometry, name).evaluate({ vgs: 1, vds: 1, vbs: 0 }).ids;
}

describe('ngspice-47 BSIM4 model-bin selection (inpgmod.c)', () => {
  it.each(['l=1u w=1u', 'l=2u w=2u', 'l=2.0005u w=2.0005u'])('includes both endpoints with the native 1nm absolute allowance: %s', geometry => {
    expect(current(first, geometry)).toBe(current(first, geometry, 'dut.1'));
  });
  it('chooses the last declared matching bin at a shared boundary, not the lowest suffix', () => {
    expect(current(`${first}\n${second}`)).toBe(current(second, undefined, 'dut.2'));
    expect(current(`${second}\n${first}`)).toBe(current(first, undefined, 'dut.1'));
  });
  it.each(['l=1.5u w=1.5u', 'l=2.5u w=1.5u'])('selects by drawn SI geometry: %s', geometry => {
    const selected = geometry.startsWith('l=1') ? 'dut.1' : 'dut.2';
    expect(current(`${first}\n${second}`, geometry)).toBe(current(`${first}\n${second}`, geometry, selected));
  });
  it.each(['l=3.002u w=1u', 'l=2u w=2.002u', 'w=1u', 'l=2u'])('fails closed for no matching bin: %s', geometry => {
    expect(() => device(`${first}\n${second}`, geometry)).toThrow(/no matching BSIM4 model bin/i);
  });
  it('does not supply missing range limits from model setup defaults', () => {
    expect(() => device('.model dut.1 nmos level=54 version=4.8')).toThrow(/no matching BSIM4 model bin/i);
  });
  it('ignores NF for default native wnflag=0 bin lookup', () => {
    expect(current(first, 'l=1.5u w=1.5u nf=2')).toBe(current(first, 'l=1.5u w=1.5u nf=2', 'dut.1'));
  });
  it('matches a mixed-case family and preserves PMOS polarity', () => {
    expect(device(first.replace('dut.1 nmos', 'DuT.1 pmos'), 'l=1.5u w=1.5u', 'DUT')).toBeInstanceOf(BSIM4);
  });
  it.each(['4.7', '4.7.0'])('rejects selected VERSION=%s with a structured error naming the version', version => {
    try {
      device(first.replace('version=4.8', `version=${version}`));
      expect.fail('expected unsupported version');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedModelVersionError);
      expect(error).toMatchObject({ code: 'UNSUPPORTED_MODEL_VERSION', version });
    }
  });
  it.each(['4.8', '4.8.2', '4.8.3'])('accepts VERSION=%s in the ported 4.8 family', version => {
    expect(device(first.replace('version=4.8', `version=${version}`))).toBeInstanceOf(BSIM4);
  });
});
