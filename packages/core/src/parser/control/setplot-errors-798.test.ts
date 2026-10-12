import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';
import { ControlScriptError } from './errors.js';

// ngspice-47 batch mode (-b) plot selection (frontend/vectors.c plot_setcur,
// get_plot, plot_prefix; frontend/postcoms.c com_destroy), measured on the
// decks below:
//  - `setplot <name>` with no matching plot prints "Error: no such plot named
//    <name>", leaves the current plot unchanged and the script continues;
//  - a name matches the newest plot whose type name it prefixes, unless the
//    name ends in a digit and the plot name has more characters (`op` selects
//    op2, `op1` never selects op12);
//  - `setplot previous` / `next` step to the older / newer plot, or print
//    "Warning: No previous|next plot is available. Plot remains unchanged (<plot>)."
//  - `destroy <name>` of a missing plot prints "Error: no such plot <name>" and
//    still destroys the other named plots.
// Other command failures (`let` with an unknown RHS, unknown commands) also
// continue in ngspice-47 but remain fatal ControlScriptErrors in spice-ts.
const NO_SUCH_PLOT_NAMED = (name: string) => `no such plot named ${name}`;

// xictools/wrspice/examples/diodisto.cir (XicTools, Apache-2.0), byte-identical
// (benchmarks/corpus/corpus-h/fixtures/xictools/wrspice/examples/diodisto.cir).
const DIODISTO = `*       Diode-Resistor circuit

r1 2 0 1k
d1 1 2 diode
vcc 1 3 5v ac 0.001 sin(5 0.01 1000) distof1 0.01 distof2 0.01
vcc2 3 0 0v
*.model diode D
.model diode D is=1.0e-14 tt=0.1n cjo=2p
*.disto dec 1 1000.0 1000.0 
*.disto dec 20 1.0e3 1.0e8 
.disto dec 20 1.0e3 1.0e8 0.9
*the output is v(2)
.end

.control
run
plot v(2)
setplot -1
plot v(2)
setplot -1
plot v(2)
edit
.endc
`;

const twoOps = (body: string) => `t\nV1 1 0 1\nR1 1 0 1k\n.control\nop\nlet a = 1\nop\nlet a = 2\n${body}\n.endc\n.end`;

function controlWarnings(result: { warnings: { type: string; message: string }[] }): string[] {
  return result.warnings.filter(warning => warning.type === 'control').map(warning => warning.message);
}

describe('#798 failed setplot/destroy print the ngspice-47 error and the script continues', () => {
  it('runs diodisto.cir to completion: each setplot -1 is a warning, not an abort', async () => {
    const result = await simulate(DIODISTO);
    // ngspice-47 -b: "Error: no such plot named -1" twice, then the edit
    // warning; the .disto analysis runs (No. of Data Rows : 101). simulate()
    // reports repeated identical warnings once.
    expect(controlWarnings(result)).toEqual([NO_SUCH_PLOT_NAMED('-1'), "`edit' is disabled because 'interactive' has not been set"]);
    expect(result.distortion?.frequencies).toHaveLength(101);
  });

  it('leaves the current plot unchanged after setplot of a missing plot', async () => {
    const result = await simulate(twoOps('setplot nosuch\necho $curplot\necho $&a'));
    expect(result.control!.output).toEqual(['op2', '2']);
    expect(controlWarnings(result)).toEqual([NO_SUCH_PLOT_NAMED('nosuch')]);
  });

  it('steps setplot previous/next through the plot list and warns at either end (ngspice-47 d.cir)', async () => {
    const result = await simulate(twoOps(`setplot previous
echo $curplot
setplot previous
echo $curplot
setplot previous
echo $curplot
setplot next
setplot next
setplot next
echo $curplot`));
    expect(result.control!.output).toEqual(['op1', 'const', 'const', 'op2']);
    expect(controlWarnings(result)).toEqual([
      'No previous plot is available. Plot remains unchanged (const)',
      'No next plot is available. Plot remains unchanged (op2)',
    ]);
  });

  it('selects the newest plot a name prefixes, as get_plot/plot_prefix do', async () => {
    const result = await simulate(twoOps('setplot const\nsetplot op\necho $&a\nsetplot op1\necho $&a\nsetplot o\necho $&a'));
    expect(result.control!.output).toEqual(['2', '1', '2']);
    expect(controlWarnings(result)).toEqual([]);
  });

  it('does not let a name ending in a digit prefix a longer plot name', async () => {
    const result = await simulate(twoOps('setplot op1\nsetplot op\necho $curplot\nsetplot op0\necho $curplot'));
    expect(result.control!.output).toEqual(['op2', 'op2']);
    expect(controlWarnings(result)).toEqual([NO_SUCH_PLOT_NAMED('op0')]);
  });

  it('destroys the named plots that exist and warns for the missing one', async () => {
    const result = await simulate(twoOps('destroy nosuch op1\necho $curplot\nsetplot op1\necho $curplot'));
    expect(result.control!.output).toEqual(['op2', 'op2']);
    expect(controlWarnings(result)).toEqual(['no such plot nosuch', NO_SUCH_PLOT_NAMED('op1')]);
  });

  it('keeps unknown-vector let errors fatal (known divergence: ngspice-47 prints RHS invalid and continues)', async () => {
    const error = await simulate(twoOps('setplot nosuch\nlet b = nosuchvec\necho after'))
      .then(() => undefined, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(ControlScriptError);
    expect((error as ControlScriptError).message).toContain("no such vector 'nosuchvec'");
  });
});
