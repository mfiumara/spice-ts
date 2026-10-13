import { describe, expect, it } from 'vitest';
import { UnsupportedModelParameterError } from '../errors.js';
import { parse } from '../parser/index.js';
import { parseModelCard } from '../parser/model-parser.js';
import { simulate } from '../simulate.js';

/**
 * PSpice `T_ABS`, `T_REL_GLOBAL` and `T_MEASURED` on `.model` cards (#846).
 * ngspice-47's PSpice compatibility mode (frontend/inpcompat.c pspice_compat)
 * renames, on every `.model` line, the first `t_abs` to `temp`, or else the
 * first `t_rel_global` to `dtemp`, or else the first `t_measured` to `tnom`.
 * A resistor model has no `temp`/`dtemp` model parameter, so inpgmod.c stores
 * them as instance defaults: an instance without its own TEMP runs at the
 * model's absolute temperature (ignoring DTEMP, restemp.c), which sets both its
 * TC1/TC2 resistance and its thermal noise. PSpice libraries use
 * `.model R_NOISELESS RES(T_ABS=-273.15)` for noiseless (0 K) resistors.
 *
 * Every expected value is `ngspice -b` (ngspice-47) output on the same deck,
 * run with `set ngbehavior=psa` in .spiceinit.
 */
function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

describe('PSpice T_ABS / T_REL_GLOBAL / T_MEASURED on .model cards (#846)', () => {
  it('runs resistors at the model T_ABS, circuit TEMP + T_REL_GLOBAL, and around T_MEASURED', async () => {
    const result = await simulate(`model temps at options temp
V1 in 0 DC 1
R1 in out RTC 1k
R2 out 0 RNL 1k
R3 in o3 RREL 1k
R4 o3 0 1k
R5 in o5 RMEAS 1k
R6 o5 0 1k
.model RTC RES(TC1=0.01 TC2=1e-4 T_ABS=77)
.model RNL RES(T_ABS=-273.15)
.model RREL RES(TC1=0.01 T_REL_GLOBAL=10)
.model RMEAS RES(TC1=0.01 T_MEASURED=50)
.options temp=40
.op
.end
`);
    // ngspice-47: v(out) = 3.636364e-01, v(o3) = 4.484305e-01, v(o5) = 5.263158e-01.
    expect(relativeError(result.dc!.voltage('out'), 3.636364e-1)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.voltage('o3'), 4.484305e-1)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.voltage('o5'), 5.263158e-1)).toBeLessThan(1e-6);
  });

  it('lets instance TEMP/DTEMP override the model defaults, and a TEMP ignore DTEMP', async () => {
    const result = await simulate(`instance temp overrides model defaults
V1 in 0 DC 1
R1 in o1 RTC 1k temp=50
R2 o1 0 1k
R3 in o3 RREL 1k temp=50
R4 o3 0 1k
R5 in o5 RREL 1k dtemp=-20
R6 o5 0 1k
R7 in o7 RTC 1k dtemp=5
R8 o7 0 1k
.model RTC RES(TC1=0.01 TC2=1e-4 T_ABS=77)
.model RREL RES(TC1=0.01 T_REL_GLOBAL=10)
.op
.end
`);
    // ngspice-47: v(o1) = 4.380393e-01, v(o3) = 4.484305e-01, v(o5) = 5.555556e-01, v(o7) = 3.636364e-01.
    expect(relativeError(result.dc!.voltage('o1'), 4.380393e-1)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.voltage('o3'), 4.484305e-1)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.voltage('o5'), 5.555556e-1)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.voltage('o7'), 3.636364e-1)).toBeLessThan(1e-6);
  });

  it('makes a T_ABS=-273.15 resistor noiseless in .noise', async () => {
    const result = await simulate(`noise temps
V1 in 0 DC 0 AC 1
R1 in out RNL 1k
R2 out 0 1k
.model RNL RES(T_ABS=-273.15)
.noise v(out) V1 dec 1 1k 1k
.end
`);
    // ngspice-47 .print noise onoise_spectrum: 2.035686e-09 (R2 alone at 27 C).
    expect(relativeError(result.noise!.outputNoiseDensity[0], 2.035686e-9)).toBeLessThan(1e-6);
  });

  it('evaluates resistor thermal noise at the T_ABS / T_REL_GLOBAL instance temperature', async () => {
    const result = await simulate(`noise temps 2
V1 in 0 DC 0 AC 1
R1 in out RH 1k
R2 out 0 RREL 2k
.model RH RES(T_ABS=100 TC1=0.01)
.model RREL RES(T_REL_GLOBAL=-50)
.noise v(out) V1 dec 1 1k 1k
.end
`);
    // ngspice-47 .print noise onoise_spectrum: 4.024099e-09.
    expect(relativeError(result.noise!.outputNoiseDensity[0], 4.024099e-9)).toBeLessThan(1e-6);
  });

  it('translates T_ABS on a .model inside a .subckt', async () => {
    const result = await simulate(`subckt noiseless
V1 in 0 DC 1 AC 1
X1 in out DIV
.subckt DIV a b
R1 a b RNL 1k
R2 b 0 RHOT 3k
.model RNL RES(T_ABS=-273.15)
.model RHOT RES(TC1=2e-3 T_ABS=127)
.ends
.op
.noise v(out) V1 dec 1 1k 1k
.end
`);
    // ngspice-47: v(out) = 7.826087e-01, onoise_spectrum = 1.938994e-09.
    expect(relativeError(result.dc!.voltage('out'), 7.826087e-1)).toBeLessThan(1e-6);
    expect(relativeError(result.noise!.outputNoiseDensity[0], 1.938994e-9)).toBeLessThan(1e-6);
  });

  it('translates only the first key per card and drops the rest with ngspice-47\'s warning', async () => {
    const result = await simulate(`both keys
V1 in 0 DC 1
R1 in out RB 1k
R2 out 0 1k
R3 in o3 RC 1k
R4 o3 0 1k
.model RB RES(TC1=0.01 T_ABS=50 T_MEASURED=40)
.model RC RES(TC1=0.01 T_MEASURED=40 T_ABS=60 T_ABS=70)
.op
.end
`);
    // ngspice-47: v(out) = 4.484305e-01 (T = 50, TNOM = 27), v(o3) = 4.291845e-01 (T = 60),
    // with "unrecognized parameter (t_measured) - ignored" for RB and RC and
    // "unrecognized parameter (t_abs) - ignored" for RC.
    expect(relativeError(result.dc!.voltage('out'), 4.484305e-1)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.voltage('o3'), 4.291845e-1)).toBeLessThan(1e-6);
    const messages = result.warnings.map(warning => warning.message);
    expect(messages.filter(message => message.includes('unrecognized parameter (t_measured) - ignored')))
      .toHaveLength(2);
    expect(messages.filter(message => message.includes('unrecognized parameter (t_abs) - ignored')))
      .toHaveLength(1);
  });

  it('rejects T_ABS / T_REL_GLOBAL on non-resistor models instead of ignoring the temperature', () => {
    for (const card of ['.model DM D(IS=1e-14 T_ABS=100)', '.model DM D(IS=1e-14 T_REL_GLOBAL=10)']) {
      expect(() => parse(`t
V1 a 0 1
R1 a b 1k
D1 b 0 DM
${card}
.op
.end
`)).toThrow(/model 'DM' uses unsupported model parameter 'T_(ABS|REL_GLOBAL)'/);
    }
  });

  it('rejects T_ABS on a non-resistor model inside a .subckt when it is compiled', async () => {
    await expect(simulate(`t
V1 a 0 1
X1 a 0 SUB
.subckt SUB p n
R1 p b 1k
D1 b n DM
.model DM D(IS=1e-14 T_ABS=100)
.ends
.op
.end
`)).rejects.toBeInstanceOf(UnsupportedModelParameterError);
  });

  it('maps T_MEASURED to TNOM on any model card', () => {
    const model = parseModelCard(['.model', 'DM', 'D', '(', 'IS=1e-14', 'T_MEASURED=50', ')'], 5);
    expect(model.params).toEqual({ IS: 1e-14, TNOM: 50 });
  });
});
