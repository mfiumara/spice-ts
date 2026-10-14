import assert from 'node:assert/strict';
import { canonicalize, projectAnalysis } from './canonical.js';
import { parseXyceCsv } from './xyce.js';
import { parseReferenceRaw } from './expanded.js';

declare function test(name: string, fn: () => void): void;
const deck = (cards: string) => `shared\nV1 in 0 DC 1\nR1 in 0 1k\n${cards}\n.end\n`;

test('native raw output rejects missing, truncated and nonfinite data before comparison', () => {
  const raw = 'Title: test\nPlotname: Operating Point\nNo. Variables: 1\nNo. Points: 1\nVariables:\n0 v(in) voltage\nValues:\n0 1\n';
  assert.equal(parseReferenceRaw(raw)[0].signals['v(in)'][0].re, 1);
  for (const bad of ['', raw.replace('0 1\n', ''), raw.replace('0 1\n', '0 NaN\n'), raw.replace('0 1\n', '0 1e999\n'), raw + '2\n']) {
    assert.throws(() => parseReferenceRaw(bad));
  }
});

test('OP produces one numeric sample with a synthetic zero grid', () => {
  assert.deepEqual(parseXyceCsv('V(IN),I(V1)\n1,-.001', 'op', ['v(in)', 'i(v1)']), {
    grid: [0], signals: { 'v(in)': [{ re: 1, im: 0 }], 'i(v1)': [{ re: -.001, im: 0 }] },
  });
});
test('simple control analyses lower to static cards; output commands are recorded', () => {
  const plan = canonicalize(deck('.control\nop\ndisplay\nprint v(in)\nremcirc\nquit 0\n.endc'));
  assert.deepEqual(plan.limitations, []);
  assert.equal(plan.analyses[0].directive, '.op');
  assert.doesNotMatch(plan.netlist, /control|remcirc|quit|display/);
  assert.ok(plan.changes.some(s => s.includes('print v(in)')));
});
test('run uses deck analyses once and ordered projections share the same circuit', () => {
  const plan = canonicalize(deck('.op\n.ac lin 3 1 3\n.tran .1 1\n.control\nrun\nplot v(in)\n.endc'));
  assert.deepEqual(plan.limitations, []);
  assert.deepEqual(plan.analyses.map(a => a.type), ['op', 'ac', 'tran']);
  for (const [i, analysis] of plan.analyses.entries()) {
    const projected = projectAnalysis(plan, i);
    assert.ok(projected.includes(analysis.directive));
    assert.equal(projected.match(/^\.(op|ac|tran)\b/gm)?.length, 1);
    assert.ok(projected.includes('R1 in 0 1k'));
  }
});
test('multiple control blocks fail closed atomically, including cross-block termination and cleanup', () => {
  for (const cards of [
    '.control\nop\nquit 0\n.endc\n.control\ndc V1 0 2 1\n.endc',
    '.control\nop\nremcirc\n.endc\n.control\ndc V1 0 2 1\n.endc',
    '.control\nop\ndestroy all\n.endc\n.control\ndc V1 0 2 1\n.endc',
    '.op\n.control\nremcirc\n.endc\n.control\nrun\n.endc',
    '.op\n.control\ndestroy all\n.endc\n.control\nrun\n.endc',
    '.op\n.control\nquit\n.endc\n.control\nrun\n.endc',
    '.op\n.control\nrun\n.endc\n.control\nrun\n.endc',
    '.control\nop\n.endc\n.control\ndc V1 0 2 1\n.endc',
    '.control\n.endc\n.control\nop\n.endc',
  ]) {
    // CRLF and trailing whitespace must also survive rejected lowering verbatim.
    const source = deck(cards).replace(/\n/g, '\r\n') + '  \r\n';
    const plan = canonicalize(source);
    assert.ok(plan.limitations.includes('Multiple .control blocks need circuit-global execution semantics'), cards);
    assert.equal(plan.netlist, source, cards);
    assert.deepEqual(plan.changes, [], cards);
    for (const [ordinal] of plan.analyses.entries()) assert.throws(() => projectAnalysis(plan, ordinal), /Multiple \.control blocks/);
  }
});
test('stateful and conditional control commands fail closed', () => {
  for (const command of ['alter V1 2', 'let x=1', 'if x > 0', 'set reltol=1e-3', 'reset', 'quit 1']) {
    assert.ok(canonicalize(deck(`.control\nop\n${command}\n.endc`)).limitations.length, command);
  }
  assert.ok(canonicalize(deck('.control\nop')).limitations.length);
  assert.ok(canonicalize(deck('.op\n.param gain=2\n.ac lin 3 1 3')).limitations.length);
  assert.ok(canonicalize(deck('.ac lin 3 1 3\n.control\nop\n.endc')).limitations.length);
  assert.ok(canonicalize(deck('.ac lin 3 1 3\n.control\ndisplay\n.endc')).limitations.length);
  assert.ok(canonicalize(deck('.control\nop\nrun\n.endc')).limitations.length);
});
test('only bookkeeping options are removed; TEMP becomes shared DEVICE setting', () => {
  const plan = canonicalize(deck('.options TEMP=150 noacct list node\n.op'));
  assert.deepEqual(plan.limitations, []);
  assert.match(plan.netlist, /\.options DEVICE TEMP=150/);
  assert.doesNotMatch(plan.netlist, /noacct|list|node/);
  const device = canonicalize(deck('.options DEVICE TEMP=150 TNOM=27 GMIN=1e-15\n.op'));
  assert.deepEqual(device.limitations, []);
  assert.match(device.netlist, /DEVICE TEMP=150 TNOM=27 GMIN=1e-15/);
  assert.match(canonicalize(deck('.temp 150\n.op')).netlist, /DEVICE TEMP=150/);
  for (const option of ['reltol=1e-8', 'abstol=10n vntol=10n', 'method=gear', 'itl4=40', 'NONLIN reltol=1e-7', 'timeint newlte=2']) {
    const limited = canonicalize(deck(`.options ${option}\n.op`));
    assert.ok(limited.limitations.length, option);
    assert.ok(limited.netlist.includes(option), 'Never discard solver settings');
  }
});
test('ahkab DC and AC source values map without changing models; missing end is shared', () => {
  const plan = canonicalize('ahkab\nv1 in 0 type=vdc vdc=5 vac=1\ni1 0 in type=idc idc=2u\n.model ekv nmos LEVEL=260 VTO=.4\n.op\n');
  assert.deepEqual(plan.limitations, []);
  assert.match(plan.netlist, /v1 in 0 DC 5 AC 1/);
  assert.match(plan.netlist, /i1 0 in DC 2u/);
  assert.match(plan.netlist, /\.model ekv nmos LEVEL=260 VTO=.4/);
  assert.match(plan.netlist, /\.end\n$/);
  assert.ok(plan.changes.some(c => c.includes('.end')));
  for (const source of ['type=vsource 1', 'type=vdc vdc=5 type=AM 1 2 3', 'type=vdc vdc=5 surprise=2']) {
    assert.ok(canonicalize(`ahkab\nV1 in 0 ${source}\n.op\n.end`).limitations.length);
  }
});
test('continuations are logical records and unsupported analysis stays visible', () => {
  const plan = canonicalize(deck('.options noacct\n+ reltol=1e-8\n.op\n.pz 1 0 2 0 vol pz'));
  assert.ok(plan.limitations.some(s => s.includes('reltol')));
  assert.ok(plan.limitations.some(s => s.includes('pz')));
  assert.match(plan.netlist, /\+ reltol=1e-8/);
  assert.match(plan.netlist, /\.pz/);
});
