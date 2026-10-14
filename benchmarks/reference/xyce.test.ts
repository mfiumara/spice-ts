import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import test from 'node:test';
import type { ComparisonFixture } from '../comparison-harness.js';
import { parseXyceCsv, runXyce, translateForXyce } from './xyce.js';
import { canonicalize, projectAnalysis } from './canonical.js';
import { runNgspiceReference } from './expanded.js';
import './investigations/990/receipt.test.js';

test('mixed-case requested names use canonical lower-case series keys like ngspice', () => {
  const result = parseXyceCsv('{V1},V(IN),I(V1)\n0,0,0', 'dc', ['V(IN)', 'I(V1)']);
  assert.deepEqual(Object.keys(result.signals), ['v(in)', 'i(v1)']);
});

test('live ngspice quit terminates later control blocks; canonical projections are rejected', { skip: !process.env.XYCE_BIN }, () => {
  const source = 'quit probe\nV1 in 0 1\nR1 in 0 1k\n.control\nop\nprint v(in)\nquit 0\n.endc\n.control\necho UNREACHABLE_DC\ndc V1 0 2 1\nprint v(in)\n.endc\n.end\n';
  const plan = canonicalize(source);
  assert.ok(plan.limitations.includes('Multiple .control blocks need circuit-global execution semantics'));
  assert.equal(plan.netlist, source);
  assert.deepEqual(plan.changes, []);
  assert.throws(() => projectAnalysis(plan, 1), /Multiple \.control blocks/);
  const original = runNgspiceReference(plan.netlist);
  assert.match(original.output ?? '', /v\(in\) = 1\.000000e\+00/);
  assert.doesNotMatch(original.output ?? '', /UNREACHABLE_DC|No\. of Data Rows\s*:\s*3/);
});

test('live shared DEVICE options preserve ngspice settings and are recognized by Xyce', { skip: !process.env.XYCE_BIN }, async () => {
  const settings = ['TEMP=150', 'TNOM=40', 'GMIN=1e-8', 'TEMP=150 TNOM=40 GMIN=1e-8'];
  for (const option of settings) {
    const netlist = `settings probe\nV1 in 0 .5\nD1 in 0 dm\n.model dm D(IS=1e-14)\n.options ${option}\n.op\n.end\n`;
    const plan = canonicalize(netlist);
    assert.deepEqual(plan.limitations, []);
    const original = runNgspiceReference(netlist, 'op');
    const shared = projectAnalysis(plan, 0);
    const mapped = runNgspiceReference(shared, 'op');
    assert.equal(original.status, 'success');
    assert.equal(mapped.status, 'success');
    if (original.status === 'success' && mapped.status === 'success') assert.deepEqual(mapped.series, original.series);
    const xyce = await runXyce({ name: 'options', analysis: 'op', netlist: shared, signals: ['v(in)', 'i(v1)'] });
    assert.equal(xyce.status, 'success', JSON.stringify(xyce));
    assert.doesNotMatch(xyce.output ?? '', /ignored|unrecognized|not supported/i);
  }
});

function fixture(analysis: ComparisonFixture['analysis'] = 'dc'): ComparisonFixture {
  const directive = analysis === 'dc' ? '.dc V1 0 1 .5' : analysis === 'ac' ? '.ac lin 3 1 3' : analysis === 'tran' ? '.tran .1 1' : '.op';
  return { name: 'adapter-small', analysis, signals: ['v(in)', 'i(V1)'],
    netlist: `adapter test\nV1 in 0 DC 1 AC 1\nR1 in 0 1k\n${directive}\n.end\n` };
}

test('SINE sources become native SIN without dropping DC, AC or waveform values', () => {
  const sources = [
    ['V1 in 0 dc 2.5 sine(1 .3 440 0 0)', 'V1 in 0 dc 2.5 SIN(1 .3 440 0 0)'],
    ['I1 in 0 SiNe (1m 2m 1k 2u 3 45) DC 4m AC 5m 90', 'I1 in 0 SIN (1m 2m 1k 2u 3 45) DC 4m AC 5m 90'],
    ['V1 in 0 2 AC 3 45\n+ sine(1 2 3)', 'V1 in 0 2 AC 3 45  SIN(1 2 3)'],
  ];
  for (const [source, expected] of sources) {
    const f = { ...fixture('tran'), netlist: fixture('tran').netlist.replace('V1 in 0 DC 1 AC 1', source) };
    const translated = translateForXyce(f);
    assert.ok(translated.netlist.includes(expected), translated.netlist);
    assert.ok(translated.changes.some(change => /SINE.*SIN/.test(change)));
    assert.equal(translateForXyce({ ...f, netlist: translated.netlist }).netlist, translated.netlist);
  }
  const netlist = readFileSync('benchmarks/reference/investigations/974/jimi-fuzz-baseline-shared.cir', 'utf8');
  const translated = translateForXyce({ name: 'jimi', analysis: 'tran', signals: ['v(10)', 'v(3)'], netlist });
  assert.ok(translated.netlist.includes('V_V2 10 0 dc 0.0 SIN(0.0 0.3 440.0 0 0)'));
  assert.ok(translated.netlist.includes('V_V1 1 0 dc 9.0'));
});

test('SIN, DC-only sources, identifiers, expressions and comments remain untouched', () => {
  const sources = ['V1 sine 0 DC 2', 'Isine in 0 SIN(1 2 3)', 'V1 in 0 DC 2 ; sine(9 9 9)', 'V1 in 0 DC {sine(2)}'];
  for (const source of sources) {
    const translated = translateForXyce({ ...fixture('tran'), netlist: fixture('tran').netlist.replace('V1 in 0 DC 1 AC 1', source) });
    assert.ok(translated.netlist.includes(source));
  }
});

test('live Xyce SINE translation retains explicit DC and nonzero transient excitation', { skip: !process.env.XYCE_BIN }, async () => {
  for (const kind of ['V', 'I']) {
    const netlist = `source probe\n${kind}1 in 0 DC 2.5 sine(1 .3 440 0 0)\nR1 in 0 1\n.tran 10u 3m\n.end\n`;
    const f = { name: 'source', netlist, analysis: 'tran' as const, signals: ['v(in)'] };
    const op = await runXyce({ ...f, analysis: 'op', netlist: netlist.replace('.tran 10u 3m', '.op') });
    assert.equal(op.status, 'success', JSON.stringify(op));
    if (op.status === 'success') assert.equal(op.series.signals['v(in)'][0].re, kind === 'V' ? 2.5 : -2.5);
    const tran = await runXyce(f);
    assert.equal(tran.status, 'success', JSON.stringify(tran));
    if (tran.status !== 'success') continue;
    const values = tran.series.signals['v(in)'].map(value => kind === 'V' ? value.re : -value.re);
    assert.ok(Math.max(...values) > 1.29);
    assert.ok(Math.min(...values) < .71);
  }
});

test('Xyce adapter assigns bare BJT scalar parameters on model continuations (#990)', () => {
  const netlist = readFileSync('benchmarks/reference/mutual-948/classic/rca3040-wideband-amplifier/0-ac.cir', 'utf8');
  const f = { ...fixture('ac'), netlist };
  const translated = translateForXyce(f);
  assert.match(translated.netlist, /cjc=2pf VAF=50/i);
  assert.doesNotMatch(translated.netlist, /\bva\s+50/i);
  assert.ok(translated.changes.some(change => change.includes('va 50') && change.includes('VAF=50')));
  assert.equal(f.netlist, netlist);
});

test('bare BJT syntax normalisation is general, preserves explicit assignments and other cards', () => {
  const f = fixture();
  const models = '.model p PNP (bf 80, va 50 vb 10 ik 2m)\n' +
    '.model n NPN is 1e-16\n+ rb 100 tf 0.3ns ccs 2pf ; va 99\n' +
    '.model explicit NPN (va=50 bf = 80)\n.model diode D (is 1e-14)\n* .model comment NPN va 100';
  f.netlist = f.netlist.replace('.end', `${models}\n.end`);
  const translated = translateForXyce(f);
  assert.ok(translated.netlist.includes('.model p PNP (BF=80, VAF=50 VAR=10 IKF=2m)'));
  assert.match(translated.netlist, /\.model n NPN IS=1e-16\s+RB=100 TF=0.3ns CJS=2pf/);
  assert.ok(translated.netlist.includes('* ; va 99'));
  for (const line of models.split('\n').slice(3)) assert.ok(translated.netlist.includes(line));
  assert.equal(translateForXyce({ ...f, netlist: translated.netlist }).netlist, translated.netlist);
});

test('BJT model expressions are not partially rewritten, bare nonliteral values fail closed', () => {
  const f = fixture();
  for (const model of ['.model n NPN bf={80 + 2} va=50', ".model n NPN bf='80 + 2' va=50"]) {
    assert.ok(translateForXyce({ ...f, netlist: f.netlist.replace('.end', `${model}\n.end`) }).netlist.includes(model));
  }
  for (const value of ['{early + 2}', "'early + 2'", 'early', '50+2']) {
    assert.throws(() => translateForXyce({ ...f, netlist: f.netlist.replace('.end', `.model n NPN va ${value}\n.end`) }), /requires a scalar numeric literal/);
  }
});

test('DC CSV uses explicit primary sweep and preserves flattened nested rows', () => {
  const series = parseXyceCsv('{V1},V(IN),I(V1)\n0,0,0\n.5,.5,-5e-4\n0,0,0\n.5,.5,-5e-4\n', 'dc', ['v(in)', 'i(V1)']);
  assert.deepEqual(series.grid, [0, .5, 0, .5]);
  assert.deepEqual(series.signals['i(v1)'], [{ re: 0, im: 0 }, { re: -.0005, im: 0 }, { re: 0, im: 0 }, { re: -.0005, im: 0 }]);
});

test('TRAN and AC CSV match case-insensitive headers, quoted differential voltage', () => {
  assert.deepEqual(parseXyceCsv('\uFEFFtime,"V(A,B)",I(V1)\r\n0,2,-.1\r\n', 'tran', ['v(a,b)', 'i(v1)']), {
    grid: [0], signals: { 'v(a,b)': [{ re: 2, im: 0 }], 'i(v1)': [{ re: -.1, im: 0 }] },
  });
  const native = parseXyceCsv('TIME,V(A,B),I(V1)\n0,2,-.1', 'tran', ['v(a,b)', 'i(v1)']);
  assert.deepEqual(native.signals['v(a,b)'], [{ re: 2, im: 0 }]);
  assert.deepEqual(parseXyceCsv('FREQ,VR(IN),VI(IN),IR(V1),II(V1)\n1,2,-3,-4,5', 'ac', ['v(in)', 'i(V1)']), {
    grid: [1], signals: { 'v(in)': [{ re: 2, im: -3 }], 'i(v1)': [{ re: -4, im: 5 }] },
  });
});

test('CSV rejects absent, duplicate, malformed, blank, nonfinite and truncated fields', () => {
  for (const csv of [
    '', 'TIME,V(IN)', 'V(IN)\n1', 'TIME,V(OTHER)\n0,1', 'TIME,V(IN),v(in)\n0,1,2',
    'TIME,V(IN)\n0', 'TIME,V(IN)\n0,1,2', 'TIME,V(IN)\n0,', 'TIME,V(IN)\n0,NaN',
    'TIME,V(IN)\nInfinity,1', 'TIME,V(IN)\n0,1e999', 'TIME,V(IN)\n0,1junk',
    'TIME,V(IN)\n0,"1', 'TIME,V(IN)\n0,1\n\n1,2', 'TIME,,V(IN)\n0,1,2',
  ]) assert.throws(() => parseXyceCsv(csv, 'tran', ['v(in)']), undefined, csv);
  assert.throws(() => parseXyceCsv('FREQ,VR(IN)\n1,2', 'ac', ['v(in)']), /Missing CSV field/);
  assert.throws(() => parseXyceCsv('V(IN)\n1', 'dc', ['v(in)']), /sweep parameter/);
  assert.throws(() => parseXyceCsv('V(IN)\n1\n2', 'op', ['v(in)']), /OP/);
});

test('translation replaces output continuations, preserves qualified options and LEVEL=260', () => {
  const f = fixture();
  f.netlist = f.netlist.replace('.end', '.print dc v(unrequested)\n+ i(unrequested)\n.plot dc v(in)\n+ v(other)\n.options NONLIN reltol=1e-7\n.model ekv NMOS LEVEL=260 VTO=.4\n.end');
  const translated = translateForXyce(f);
  assert.match(translated.netlist, /\.print DC format=csv file=output.csv precision=17 \{V1\} V\(in\) I\(V1\)/);
  assert.doesNotMatch(translated.netlist, /unrequested|v\(other\)|\.plot/i);
  assert.ok(translated.netlist.includes('.options NONLIN reltol=1e-7'));
  assert.ok(translated.netlist.includes('.model ekv NMOS LEVEL=260 VTO=.4'));
  assert.ok(translated.netlist.includes('V1 in 0 DC 1 AC 1'));
  assert.equal(translated.changes.length, 3);
  const nested = fixture();
  nested.netlist = nested.netlist.replace('.dc V1 0 1 .5', '.dc V1 0 1 .5\n+ V2 0 2 1');
  assert.ok(translateForXyce(nested).netlist.includes('.dc V1 0 1 .5\n+ V2 0 2 1'));
  assert.match(translateForXyce(fixture('ac')).netlist, /VR\(in\) VI\(in\) IR\(V1\) II\(V1\)/);
  assert.doesNotMatch(translateForXyce(fixture('tran')).netlist, /\bTIME\b/);
});

test('translation limitations return unsupported before launching executable', async () => {
  const cases = [
    ...['.control\nrun\n.endc', '.options reltol=1e-8', '.option method=gear', '.options reltol 1e-8', '.step V1 0 1 .1', '.ac lin 2 1 2'].map(card => ({ ...fixture(), netlist: fixture().netlist.replace('.end', `${card}\n.end`) })),
    { ...fixture(), signals: ['vm(in)'] }, { ...fixture(), signals: ['v(in);bad'] },
    { ...fixture(), netlist: fixture().netlist.replace('DC 1 AC 1', 'type=vsource 1') },
    { ...fixture(), netlist: fixture().netlist.replace('DC 1 AC 1', 'type=vdc vdc=1') },
    { ...fixture(), netlist: fixture().netlist.replace('.end', '') },
  ];
  for (const f of cases) {
    const result = await runXyce(f, { executable: '/nonexistent/xyce-adapter' });
    assert.equal(result.status, 'unsupported', JSON.stringify(result));
    assert.deepEqual(result.command, []);
  }
});

test('missing executable, execution failure, absent output and timeout fail and clean cwd', async () => {
  const directories = () => readdirSync(tmpdir()).filter(name => name.startsWith('spice-ts-xyce-')).sort();
  const before = directories();
  const missing = await runXyce(fixture(), { executable: '/nonexistent/xyce-adapter' });
  assert.equal(missing.status, 'failed');
  assert.equal(missing.failureKind, 'execution');
  assert.equal(missing.convergence, 'unknown');
  if (missing.status !== 'success') assert.match(missing.error, /ENOENT/);
  // Node acts as an executable test double; all SPICE cards stay inside a JS comment.
  for (const [script, message] of [
    ['process.exit(2)', /exited 2/], ['', /ENOENT/], ['while(true) {}', /ETIMEDOUT/],
    ["require('node:fs').writeFileSync('output.csv', '{V1},V(IN),I(V1)\\n0,NaN,0')", /nonfinite/],
  ] as const) {
    const f = fixture();
    f.netlist = f.netlist.replace('adapter test', '/*') + `\n*/\n${script}\n`;
    const result = await runXyce(f, { executable: process.execPath, timeoutMs: script.includes('while') ? 100 : 2000 });
    assert.equal(result.status, 'failed');
    assert.equal(result.failureKind, script.includes('NaN') ? 'parse' : script === '' ? 'export' : 'execution');
    assert.equal(result.convergence, script.includes('NaN') || script === '' ? 'not-run' : 'unknown');
    if (result.status !== 'success') assert.match(result.error, message);
  }
  assert.deepEqual(directories(), before);
});

for (const analysis of ['op', 'dc', 'tran', 'ac'] as const) {
  test(`live Xyce ${analysis}`, { skip: !process.env.XYCE_BIN }, async () => {
    const result = await runXyce(fixture(analysis), { executable: process.env.XYCE_BIN });
    assert.equal(result.status, 'success', JSON.stringify(result));
    if (result.status !== 'success') return;
    assert.ok(result.series.grid.length > 0);
    if (analysis === 'dc') assert.deepEqual(result.series.grid, [0, .5, 1]);
    if (analysis === 'ac') assert.deepEqual(result.series.grid, [1, 2, 3]);
    result.series.signals['v(in)'].forEach((v, i) => {
      const expected = analysis === 'dc' ? result.series.grid[i] : 1;
      assert.ok(Math.abs(v.re - expected) < 1e-12);
      assert.equal(v.im, 0);
      assert.ok(Math.abs(result.series.signals['i(v1)'][i].re + expected / 1000) < 1e-12);
    });
  });
}

test('live Xyce nested DC retains primary sweep restarts', { skip: !process.env.XYCE_BIN }, async () => {
  const f = fixture();
  f.netlist = f.netlist.replace('R1 in 0 1k', 'R1 in 0 1k\nV2 aux 0 DC 0\nR2 aux 0 1k').replace('.dc V1 0 1 .5', '.dc V1 0 1 .5 V2 0 1 1');
  const result = await runXyce(f);
  assert.equal(result.status, 'success', JSON.stringify(result));
  if (result.status === 'success') assert.deepEqual(result.series.grid, [0, .5, 1, 0, .5, 1]);
});

test('live Xyce AC preserves nonzero imaginary voltage and current', { skip: !process.env.XYCE_BIN }, async () => {
  const f = fixture('ac');
  f.signals = ['v(out)', 'i(V1)'];
  f.netlist = f.netlist.replace('R1 in 0 1k', 'R1 in out 1k\nC1 out 0 1u').replace('.ac lin 3 1 3', '.ac lin 3 100 300');
  const result = await runXyce(f);
  assert.equal(result.status, 'success', JSON.stringify(result));
  if (result.status !== 'success') return;
  result.series.grid.forEach((frequency, i) => {
    const x = 2 * Math.PI * frequency * .001;
    const re = 1 / (1 + x * x), im = -x / (1 + x * x);
    const voltage = result.series.signals['v(out)'][i], current = result.series.signals['i(v1)'][i];
    assert.ok(Math.abs(voltage.re - re) < 1e-12);
    assert.ok(Math.abs(voltage.im - im) < 1e-12);
    assert.ok(Math.abs(current.re - (re - 1) / 1000) < 1e-12);
    assert.ok(Math.abs(current.im - im / 1000) < 1e-12);
  });
});
