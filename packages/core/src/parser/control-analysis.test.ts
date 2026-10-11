import { describe, expect, it } from 'vitest';
import { parse } from './index.js';
import { simulate } from '../simulate.js';
import { ParseError } from '../errors.js';

/**
 * Analysis commands inside ngspice `.control` blocks (#489).
 *
 * The control blocks below are verbatim excerpts of ngspice decks from corpus-f batch 1
 * (ngspice `3ef069fb1f04177a153f342a32d941fc20ff047e`, BSD-3-Clause), committed on branch
 * `wt/corpus-f-batch1-484` under `benchmarks/corpus/corpus-f/fixtures/<path>`. The circuits
 * around them are small stand-ins so these tests do not depend on unsupported devices.
 */
const rc = `V1 1 0 dc 1 ac 1 pulse(0 1 0 1u 1u 1m 2m)
R1 1 2 1k
C1 2 0 1u`;

function parseError(netlist: string): ParseError {
  try {
    parse(netlist);
  } catch (error) {
    expect(error).toBeInstanceOf(ParseError);
    return error as ParseError;
  }
  throw new Error('expected a ParseError');
}

describe('.control analysis commands (#489)', () => {
  it('maps a control tran command onto the .tran dot card (examples/digital/auto_bridge/vcc.cir)', async () => {
    const control = await simulate(`Control tran
${rc}
.control
tran 100n 30u
plot in out
.endc
.end`);
    const dot = await simulate(`Dot tran
${rc}
.tran 100n 30u
.end`);

    expect(parse(`t\n${rc}\n.control\ntran 100n 30u\n.endc`).analyses)
      .toEqual(parse(`t\n${rc}\n.tran 100n 30u`).analyses);
    expect(control.transient!.time).toEqual(dot.transient!.time);
    expect(control.transient!.voltage('2')).toEqual(dot.transient!.voltage('2'));
  });

  it('accepts upper-case TRAN with tstart/tmax plus rusage and plot-only set variables (examples/TransmissionLines/ltra3_2_line.sp)', () => {
    const circuit = parse(`Control TRAN
${rc}
.control
TRAN 0.2N 47.9NS
rusage
set color0=white
set xbrushwidth=3
PLOT v(648) v(651) v(751)
.endc`);
    expect(circuit.analyses).toEqual(parse(`t\n${rc}\n.tran 0.2N 47.9NS`).analyses);
    expect(circuit.analyses[0]).toMatchObject({ type: 'tran', timestep: 0.2e-9, stopTime: 47.9e-9 });

    const withStart = parse(`Control TRAN\n${rc}\n.control\nTRAN 0.2N 47N 0 0.1N\nrusage\n.endc`);
    expect(withStart.analyses).toEqual([parse(`t\n${rc}\n.tran 0.2N 47N 0 0.1N`).analyses[0]]);
  });

  it('maps a nested control dc sweep and keeps display/plot output-only (examples/p-to-n-examples/MOS1_out.cir, examples/probe/probe-i-dev.cir)', async () => {
    const circuit = parse(`Control dc
${rc}
V2 3 0 1
R2 3 0 1k
.control
dc v1 0 5 0.1 v2 0 5 1
plot vs1#branch vs2#branch vs3#branch
display
.endc`);
    expect(circuit.analyses).toEqual([{
      type: 'dc', source: 'v1', start: 0, stop: 5, step: 0.1,
      secondary: { source: 'v2', start: 0, stop: 5, step: 1 },
    }]);

    const result = await simulate(`Control dc\n${rc}\n.control\ndc V1 -5 5 1\ndisplay\nset xbrushwidth=2\nplot i(r1)\n.endc`);
    expect(result.dcSweep!.sweepValues).toHaveLength(11);
  });

  it('runs op, tran and ac commands in one block (tests/regression/misc/empty-1.cir)', async () => {
    const netlist = `Control op/tran/ac
${rc}
.control
op
tran 0.1m 1m
ac lin 3 1kHz 2kHz
echo "TEST: done"
quit 0
.endc
.end`;
    expect(parse(netlist).analyses.map(analysis => analysis.type)).toEqual(['op', 'tran', 'ac']);

    const result = await simulate(netlist);
    expect(result.dc!.voltage('2')).toBeCloseTo(1, 9);
    expect(result.transient!.time.at(-1)).toBeCloseTo(1e-3, 12);
    expect(result.ac!.frequencies).toHaveLength(3);
  });

  it('accepts settype between analyses as output-only (examples/vbic/vbic99_tran.sp)', () => {
    const circuit = parse(`Control settype
${rc}
.control
op
tran 50p 100n
set xbrushwidth=2
plot v(in) v(b) v(c) v(vp)
settype temperature v(t)
plot v(t)
.endc`);
    expect(circuit.analyses.map(analysis => analysis.type)).toEqual(['op', 'tran']);
  });

  it('treats bare run as a no-op next to control analyses (examples/osdi/hicuml0/vbic_out.sp)', () => {
    const circuit = parse(`Control run\n${rc}\n.control\ndc v1 0.0 5.0 0.05\nrun\nplot abs(i(vc))\n.endc`);
    expect(circuit.analyses).toEqual([{ type: 'dc', source: 'v1', start: 0, stop: 5, step: 0.05, secondary: undefined }]);
  });

  it('reports malformed control analysis arguments with the control line number', () => {
    const error = parseError(`Bad tran\n${rc}\n.control\ntran 1u\n.endc`);
    expect(error.line).toBe(6);
    expect(error.message).toContain('.tran requires TSTEP and TSTOP');
  });

  it('rejects a repeated analysis type because results hold one vector set per type (examples/vdmos/IXTP6N100D2-n-weak-inv.sp)', () => {
    const error = parseError(`Two sweeps
${rc}
.control
dc  v1 -3.1 -2.1 0.01
plot vs#branch
dc  v1 0 60 0.1
.endc`);
    expect(error.line).toBe(8);
    expect(error.message).toContain("Unsupported repeated 'dc' analysis in .control");

    const dotThenControl = parseError(`Dot then control\n${rc}\n.tran 1u 1m\n.control\ntran 1u 2m\n.endc`);
    expect(dotThenControl.message).toContain("Unsupported repeated 'tran' analysis in .control");

    const controlThenDot = parseError(`Control then dot\n${rc}\n.control\nop\n.endc\n.op`);
    expect(controlThenDot.message).toContain("Unsupported repeated 'op' analysis in .control");
  });

  it.each([
    // examples/vdmos/IXTH80N20L-IXTH48P20P-quasisat.sp
    ['dc v1 -1 100 0.05\naltermod mn1 rq=0', 'altermod'],
    // examples/measure/mos-meas-dc-control.sp
    ['dc v1 0 3.5 0.05\nmeas dc is_max max i(vs)', 'meas'],
    // examples/rf/pss/vackar_osc_pss_ctrl.cir
    ['tran 10n 20u\nlinearize v(4)', 'linearize'],
    ['tran 10n 20u\nfft v(4)', 'fft'],
    ['tran 10n 20u\nreset', 'reset'],
    ['pss 1.8e6 20e-6 4 1024 10 50 5e-3 uic', 'pss'],
    // examples/various/gain_stage.cir
    ['ac dec 10 100 1000Meg\nlet flen = length(frequency)', 'let'],
    // examples/vdmos/100W.sp
    ['op\nnoise V(out) Vin dec 10 10 100K', 'noise'],
    ['op\nfourier 1K V(out)', 'fourier'],
    // set commands other than plot styling can change simulation behaviour
    ['set temp = 50\nop', 'set'],
    ['set ngbehavior=ps\nop', 'set'],
  ])('still rejects result-affecting command after an analysis: %s', (control, command) => {
    const error = parseError(`Unsupported\n${rc}\n.control\n${control}\n.endc`);
    expect(error.message).toContain(`Unsupported .control command '${command}'`);
  });
});
