import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from './index.js';

// ngspice-47 numparam does not substitute `.print`/`.plot` cards: the brace
// text reaches the frontend print command verbatim, which warns ("can't parse
// '{2*gain}': ignored", "no function as {abs with that arity") and still runs
// every analysis with exit status 0 (probed with `ngspice -b`, #714). The
// analysis vectors are unaffected, so spice-ts keeps the card as output
// metadata and reports each unevaluated brace expression as a parse warning.
const deck = (print: string) => `print braces
V1 1 0 1
R1 1 2 1k
R2 2 0 1k
.param gain=3
.dc V1 0 1 0.5
${print}
.end`;

const unevaluated = (expression: string) =>
  `.print/.plot expression '${expression}' is not evaluated: spice-ts returns every computed vector, ` +
  'and ngspice-47 does not substitute braces on output cards either';

describe('#714 brace expressions on .print/.plot cards', () => {
  it.each([
    ['output function', '.print dc V(1) {DB(V(2))} VDB(2)', '{DB(V(2))}'],
    ['ngspice built-in over output', '.print dc V(1) {fmod(99.5,V(1))}', '{fmod(99.5,V(1))}'],
    ['abs over branch current', '.print DC v(2) {(abs(I(V1)))} {(V(2)**2.0)} I(V1)', '{(abs(I(V1)))}'],
    ['noise output variable', '.print noise {sqrt(abs(inoise))} {log(onoise)}', '{sqrt(abs(inoise))}'],
    ['parameter-only expression', '.print dc V(1) {2*gain}', '{2*gain}'],
    ['undefined name', '.print dc {nosuch}', '{nosuch}'],
    ['.plot card', '.plot dc V(1) {abs(V(1))}', '{abs(V(1))}'],
  ])('keeps the deck running for a %s', (_label, print, first) => {
    const circuit = parse(deck(print));
    expect(circuit.parseWarnings).toContain(unevaluated(first));
  });

  it('treats + continuation lines (with interleaved comments) as part of the .print card', () => {
    const circuit = parse(deck(
      '.print dc V(1)\n* derived quantity\n+ { ((ir(v1_r1)) - (ir(V1)))/dr }\n+ v(2) {i(V1)*(v(1)-v(2))}',
    ));
    expect(circuit.parseWarnings).toEqual([
      unevaluated('{ ((ir(v1_r1)) - (ir(V1)))/dr }'),
      unevaluated('{i(V1)*(v(1)-v(2))}'),
    ]);
  });

  it('still substitutes braces on a device card that follows a .print continuation', async () => {
    const result = await simulate(
      't\nV1 1 0 1\n.print dc {abs(V(1))}\n+ v(1)\nR1 1 2 {2*gain}\nR2 2 0 1000\n.param gain=250\n.op\n.end',
    );
    expect(result.warnings.filter(warning => warning.type === 'parse')).toHaveLength(1);
    expect(result.dc!.voltage('2')).toBeCloseTo(2 / 3, 12);
  });

  it('does not warn for plain output variables', () => {
    expect(parse(deck('.print dc V(1) I(V1) VDB(2)')).parseWarnings).toEqual([]);
  });

  it('simulates the analysis and surfaces the warning as a structured parse warning', async () => {
    const result = await simulate(deck('.print dc V(1) {DB(V(2))}'));
    expect(result.warnings).toContainEqual({ type: 'parse', message: unevaluated('{DB(V(2))}') });
    expect([...result.dcSweep!.voltage('2')]).toEqual([0, 0.25, 0.5]);
  });
});
