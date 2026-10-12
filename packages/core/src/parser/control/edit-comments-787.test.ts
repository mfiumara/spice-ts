import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';
import { parse } from '../index.js';
import { UnsupportedControlCommandError } from './errors.js';
import { extractControlBlocks } from './source.js';

// ngspice-47 batch mode (-b), measured on the WRspice example decks of #787:
//  - a `.control` line whose first character is `#` is a comment (`#edit`,
//    `# Print the total ...`); a `#` later on the line is not (`echo hello#world`
//    prints `hello#world`, `echo foo # bar` prints `foo # bar`);
//  - `edit` prints "Warning: `edit' is disabled because 'interactive' has not
//    been set." and the script continues.
const EDIT_DISABLED = "`edit' is disabled because 'interactive' has not been set";

// xictools/wrspice/examples/resnoise.cir (XicTools, Apache-2.0), byte-identical.
const RESNOISE = `* simple resistor circuit

iin 1 0 1m AC
rl 1 0 1k

.noise v(1) iin dec 10 10 100k 1
.print noise "onoise-spectrum"

.control
run
plot onoise_rl
edit
.endc
`;

// xictools/wrspice/examples/bjtnoise.cir (XicTools, Apache-2.0), byte-identical.
const BJTNOISE = `* BJT Noise Test

vcc 4 0 50
vin 1 0 ac 1

ccouple 1 2 1

ibias 0 2 100uA

rload 4 3 1k

q1 3 2 0 0 test

.model test npn kf=1e-20 af=1 bf=100 rb=10
.noise v(3) vin dec 10 10 100k 1

.control
run
plot n3:dens

# Print the total integrated noise, from the previous plot (two plots
# are created during the analysis).
print -1.n3:tot

edit
.endc
`;

function relative(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

describe('#787 .control edit command and # comment lines (ngspice-47 batch parity)', () => {
  it('drops whole-line # comments from a .control block but keeps a # inside a command', () => {
    const { blocks } = extractControlBlocks(
      'R1 1 0 1k\n.control\n# a comment\n   #edit\nop\necho hello#world\necho foo # bar\n.endc',
      false,
    );
    expect(blocks[0].lines.map(line => line.text)).toEqual(['op', 'echo hello#world', 'echo foo # bar']);
  });

  it('echoes text containing # unchanged, as ngspice-47 does', async () => {
    // `let` keeps the script on the interpreter path, which captures echo output.
    const result = await simulate('t\nV1 1 0 1\nR1 1 0 1k\n.control\n#edit\nop\nlet x = 1\necho hello#world\necho foo # bar\n.endc\n.end');
    expect(result.control?.output).toEqual(['hello#world', 'foo # bar']);
  });

  it('runs resnoise.cir and matches ngspice-47 noise totals, warning on edit', async () => {
    const result = await simulate(RESNOISE);
    // ngspice-47 -b: onoise_total = 1.287416e-06, inoise_total = 1.287416e-09,
    // onoise_spectrum[0] = 4.071372e-09.
    expect(relative(result.noise!.integratedOutputNoise!, 1.287416e-06)).toBeLessThan(1e-5);
    expect(relative(result.noise!.integratedInputNoise!, 1.287416e-09)).toBeLessThan(1e-5);
    expect(relative(result.noise!.outputNoiseDensity[0], 4.071372e-09)).toBeLessThan(1e-5);
    expect(result.warnings).toContainEqual({ type: 'control', message: EDIT_DISABLED });
  });

  it('runs bjtnoise.cir (# comment lines then edit) and matches ngspice-47 noise totals', async () => {
    const result = await simulate(BJTNOISE);
    // ngspice-47 -b: onoise_total = 5.160388e-05, inoise_total = 1.386333e-07.
    expect(relative(result.noise!.integratedOutputNoise!, 5.160388e-05)).toBeLessThan(1e-5);
    expect(relative(result.noise!.integratedInputNoise!, 1.386333e-07)).toBeLessThan(1e-5);
    expect(result.warnings).toContainEqual({ type: 'control', message: EDIT_DISABLED });
  });

  it('accepts #edit (simplepz.cir shape) as a comment with no warning', async () => {
    const result = await simulate('t\nV1 1 0 1\nR1 1 2 1k\nR2 2 0 1k\n.control\nop\nprint all\n#edit\n.endc\n.end');
    expect(result.dc!.voltage('2')).toBeCloseTo(0.5, 12);
    expect(result.warnings.some(warning => warning.message.includes('edit'))).toBe(false);
  });

  it('warns only when edit actually executes', async () => {
    const result = await simulate('t\nV1 1 0 1\nR1 1 0 1k\n.control\nop\nif 0\nedit\nend\n.endc\n.end');
    expect(result.warnings.some(warning => warning.message.includes('edit'))).toBe(false);
  });

  it('rejects edit once interactive is set: the editor is not reproducible', async () => {
    const error = await simulate('t\nV1 1 0 1\nR1 1 0 1k\n.control\nset interactive\nedit\n.endc\n.end')
      .then(() => undefined, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnsupportedControlCommandError);
    expect((error as UnsupportedControlCommandError).command).toBe('edit');
  });

  it('parses a deck whose .control block ends in edit', () => {
    expect(() => parse(RESNOISE)).not.toThrow();
  });
});
