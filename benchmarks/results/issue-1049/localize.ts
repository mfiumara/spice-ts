/** Diagnostic #737 NEW-op localization. Run with spice-heavy, after fetch.ts 737 and tar extraction.
 * No vendor bytes are stored in the receipt. The original pin remains unchanged.
 */
import { strict as assert } from 'node:assert';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir, platform, arch } from 'node:os';
import { simulate, parseAsync } from '../../../packages/core/dist/index.js';
import { MNAAssembler } from '../../../packages/core/src/mna/assembler.js';
import { parseNgspiceRaw } from '../../comparison-harness.js';

type Point = Record<string, number>;
type Run = { status: string; point: Point; error?: string; exitCode?: number | null; diagnostics?: string; transientPoints?: number; finalTime?: number };
type Difference = { signal: string; own: number; native: number; absolute: number; relative: number | null };
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const canonCurrent = (name: string) => name.toLowerCase().replace(/^a\$poly\$e\./, '').replace(/^[ve]\.(?=x)/, '').replace(/\.be_/g, '.e_');
function diff(own: Point, native: Point): Difference[] {
  return Object.entries(native).flatMap(([signal, value]) => signal in own ? [{ signal, own: own[signal], native: value, absolute: Math.abs(own[signal] - value), relative: value === 0 ? null : Math.abs((own[signal] - value) / value) }] : []).sort((a, b) => b.absolute - a.absolute);
}
async function main(): Promise<void> {
  if (process.argv[2] === '--check') {
    const receipt = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    assert.equal(receipt.input.sha256, '53bd1936ee8529e1b1158d91a6fba578e8eceb4e5c2ca7219aa03b2d31208245');
    assert.equal(receipt.baseline.differences.length, 98);
    assert.equal(receipt.baseline.unmatchedNative.length, 0);
    assert.equal(receipt.transistorProbes.length, 9);
    assert.equal(receipt.diodeProbes.length, 12);
    assert.equal(receipt.baseline.own.point['i(v159)'], -0.0013554713473383079);
    assert.equal(receipt.baseline.native.point['i(v159)'], -0.001237320859729758);
    assert.equal(receipt.baseline.own.point['v(net-_q37-s_)'], -0.0016983367337954761);
    assert.equal(receipt.baseline.native.point['v(net-_q37-s_)'], -0.1043817443873431);
    assert.equal(receipt.short.own.status, 'failed'); assert.equal(receipt.short.native.status, 'failed');
    assert(Math.abs(receipt.disable.kcl.nativeFull.disable) > 9e-10);
    assert(Math.abs(receipt.disable.kcl.ownFull.disable) < 1e-18);
    console.log('Receipt check passed: 98 shared signals, 9 BJTs, 12 diodes, exact baseline, disclosed short failures');
    return;
  }
  const output = process.argv[2];
  assert(output && !existsSync(output), 'Supply a new receipt path');
  const directory = resolve('benchmarks/corpus/ngspice-bugs/fetched/737');
  const manifest = JSON.parse(readFileSync('benchmarks/corpus/ngspice-bugs/manifest.json', 'utf8'));
  const entry = manifest.tickets.find((item: { ticket: number }) => item.ticket === 737);
  assert.equal(hash(readFileSync(join(directory, 'Test.zip'))), entry.attachments[0].sha256);
  const original = readFileSync(join(directory, 'OPA890Test.cir'), 'utf8').replace(/\r\n/g, '\n').replace(/(\.include\s+)"[A-Za-z]:\/([^"]+)"/gi, '$1$2');
  assert.equal(hash(original), 'b58eda0bc033ac63358e66f275efeff0af13534ffe7cb3efbe391f13b1c15965');
  const op = original.replace('.TRAN 1m 10m', '.op');
  assert.equal(hash(op), '53bd1936ee8529e1b1158d91a6fba578e8eceb4e5c2ca7219aa03b2d31208245');
  const scratch = mkdtempSync(join(tmpdir(), 'issue-1049-'));
  cpSync(join(directory, 'spice_lib'), join(scratch, 'spice_lib'), { recursive: true });
  writeFileSync(join(scratch, '.spiceinit'), 'set filetype=ascii\nset ngbehavior=ltps\n');
  async function own(text: string): Promise<Run> {
    try {
      const result = await simulate(text, { resolveInclude: async name => readFileSync(resolve(scratch, name), 'utf8') });
      const point: Point = {};
      if (result.transient) return { status: 'success', point, transientPoints: result.transient.time.length, finalTime: result.transient.time.at(-1) };
      for (const [name, value] of result.dc!.voltages) point[`v(${name.toLowerCase()})`] = value;
      for (const [name, value] of result.dc!.currents) point[`i(${canonCurrent(name)})`] = value;
      return { status: 'success', point };
    } catch (error) { return { status: 'failed', error: String(error), point: {} }; }
  }
  function native(text: string): Run {
    const deck = join(scratch, 'probe.cir');
    const raw = join(scratch, 'probe.raw');
    rmSync(raw, { force: true });
    writeFileSync(deck, text);
    const run = spawnSync('ngspice', ['-b', '-r', raw, deck], { cwd: scratch, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    const point: Point = {};
    if (existsSync(raw)) for (const plot of parseNgspiceRaw(readFileSync(raw, 'utf8'))) for (const [name, values] of Object.entries(plot.signals)) {
      const canonical = name.startsWith('i(') ? `i(${canonCurrent(name.slice(2, -1))})` : name.toLowerCase();
      point[canonical] = values[0].re;
    }
    return { status: run.status === 0 ? 'success' : 'failed', exitCode: run.status, point, diagnostics: (run.stdout + run.stderr).replaceAll(scratch, '<scratch>'), ...(run.error ? { error: run.error.message } : {}) };
  }
  try {
    const ownBase = await own(op);
    const nativeBase = native(op);
    assert.equal(ownBase.status, 'success'); assert.equal(nativeBase.status, 'success');
    function nodeset(point: Point): string {
      return Object.entries(point).filter(([signal]) => signal.startsWith('v(') && signal !== 'v(0)').map(([signal, value]) => `.nodeset ${signal}=${value}`).join('\n');
    }
    const seededOwnDeck = op.replace('.end', nodeset(nativeBase.point) + '\n.end');
    const sharedOwnVoltages = Object.fromEntries(Object.entries(ownBase.point).filter(([signal]) => signal in nativeBase.point));
    const seededNativeDeck = op.replace('.end', nodeset(sharedOwnVoltages) + '\n.end');
    const seededOwn = await own(seededOwnDeck);
    const seededNative = native(seededNativeDeck);
    const includes = op.split('\n').filter(line => /^\.include/i.test(line)).join('\n');
    const reductions = [];
    for (const probe of ['XU68', 'XQ37', 'XQ37-source-free']) {
      const instance = probe === 'XQ37-source-free' ? 'XQ37' : probe;
      const line = op.split('\n').find(line => line.startsWith(instance + ' '))!;
      const terminals = [...new Set(line.trim().split(/\s+/).slice(1, -1))].filter(node => node !== '0');
      const boundaries = Object.fromEntries(terminals.filter(node => probe !== 'XQ37-source-free' || node !== 'Net-_Q37-S_').map(node => [node, nativeBase.point[`v(${node.toLowerCase()})`]]));
      const text = ['.title fixed ngspice OP boundaries', includes, '.options rshunt=1T', '.op', line, ...Object.entries(boundaries).map(([node, value], i) => `VBOUND${i} ${node} 0 ${value}`), '.end', ''].join('\n');
      const ownRun = await own(text); const nativeRun = native(text);
      reductions.push({ instance: probe, sha256: hash(text), boundaries, own: ownRun, native: nativeRun, differences: diff(ownRun.point, nativeRun.point), unmatchedOwn: Object.keys(ownRun.point).filter(key => !(key in nativeRun.point)), unmatchedNative: Object.keys(nativeRun.point).filter(key => !(key in ownRun.point)) });
    }
    const receipt = { core: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), machine: `${platform()} ${arch()}`, node: process.version, ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).trim(), input: { sha256: hash(op), originalSha256: hash(original), archiveSha256: entry.attachments[0].sha256 }, baseline: { own: ownBase, native: nativeBase, differences: diff(ownBase.point, nativeBase.point), unmatchedOwn: Object.keys(ownBase.point).filter(key => !(key in nativeBase.point)), unmatchedNative: Object.keys(nativeBase.point).filter(key => !(key in ownBase.point)) }, seeded: { ownFromNative: { sha256: hash(seededOwnDeck), run: seededOwn, differenceFromNative: diff(seededOwn.point, nativeBase.point), differenceFromOwn: diff(seededOwn.point, ownBase.point) }, nativeFromOwn: { sha256: hash(seededNativeDeck), run: seededNative, differenceFromOwn: diff(ownBase.point, seededNative.point), differenceFromNative: diff(seededNative.point, nativeBase.point) } }, reductions };
    // Isolate every op-amp BJT at its original external terminal voltages.
    // Model cards are extracted at runtime from the hash-verified fetch-only library.
    const library = readFileSync(join(scratch, 'spice_lib/ic_lib/OPA690/OPA690.LIB'), 'utf8').replace(/\r\n/g, '\n');
    const cards = library.split('\n').reduce<string[]>((lines, line) => {
      if (/^\+/.test(line)) lines[lines.length - 1] += ' ' + line.slice(1);
      else lines.push(line);
      return lines;
    }, []);
    const models = cards.filter(line => /^\.model (PNP8|NPN8)\b/i.test(line)).join('\n');
    const devices = cards.filter(line => /^Q_Q\d+\s/.test(line));
    const transistorProbes = [];
    for (const line of devices) {
      const [device, ...tokens] = line.trim().split(/\s+/);
      const terminals = tokens.slice(0, 3);
      const pinMap: Record<string, string> = { '+': 'unconnected-_u68-+-pad3_', '-': 'net-_u68--_', 'V+': 'net-_u68-v+_', 'V-': 'net-_u68-v-_' };
      const boundaries = terminals.map(node => nativeBase.point[`v(${pinMap[node] ?? 'xu68.' + node.toLowerCase()})`]);
      assert(boundaries.every(Number.isFinite));
      const text = ['.title fixed native OP BJT terminals', models, '.op', `QPROBE c b e ${tokens.slice(3).join(' ')}`, ...['c', 'b', 'e'].map((node, i) => `V${node} ${node} 0 ${boundaries[i]}`), '.end', ''].join('\n');
      const ownRun = await own(text); const nativeRun = native(text);
      transistorProbes.push({ device, model: tokens[3], boundaries, sha256: hash(text), own: ownRun, native: nativeRun, differences: diff(ownRun.point, nativeRun.point) });
    }
    const diodeModels = cards.filter(line => /^\.model (DX|DN1|DN3)\b/i.test(line)).join('\n');
    const diodeProbes = [];
    for (const line of cards.filter(line => /^D_D\d+\s/.test(line))) {
      const [device, ...tokens] = line.trim().split(/\s+/);
      const pinMap: Record<string, string> = { Out: 'net-_r151-pad2_' };
      const boundaries = tokens.slice(0, 2).map(node => node === '0' ? 0 : nativeBase.point[`v(${pinMap[node] ?? 'xu68.' + node.toLowerCase()})`]);
      assert(boundaries.every(Number.isFinite));
      const text = ['.title fixed native OP diode terminals', diodeModels, '.op', `DPROBE a k ${tokens.slice(2).join(' ')}`, `Va a 0 ${boundaries[0]}`, `Vk k 0 ${boundaries[1]}`, '.end', ''].join('\n');
      const ownRun = await own(text); const nativeRun = native(text);
      diodeProbes.push({ device, model: tokens[2], boundaries, sha256: hash(text), own: ownRun, native: nativeRun, differences: diff(ownRun.point, nativeRun.point) });
    }
    const compiled = (await parseAsync(op, async name => readFileSync(resolve(scratch, name), 'utf8'))).compile();
    const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount, { useDcSourceValue: true });
    compiled.nodeNames.forEach((name, i) => { assembler.solution[i] = ownBase.point[`v(${name.toLowerCase()})`]; });
    compiled.branchNames.forEach((name, i) => { assembler.solution[compiled.nodeCount + i] = ownBase.point[`i(${canonCurrent(name)})`]; });
    const ctx = assembler.getStampContext();
    // Repeat the stamp to release any first-load junction initialisation.
    for (let pass = 0; pass < 3; pass++) {
      assembler.clear();
      for (const device of compiled.devices) device.stamp(ctx);
    }
    const residuals = [...compiled.nodeNames, ...compiled.branchNames].map((name, row) => ({ name, kind: row < compiled.nodeCount ? 'KCL-A' : 'constraint-V', residual: [...assembler.G.getRow(row)].reduce((sum, [col, value]) => sum + value * assembler.solution[col], -assembler.b[row]) })).sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));
    console.log('own residuals', residuals.slice(0, 15));
    const disableNetwork = ['.title isolated disable clamp', diodeModels, '.options rshunt=1T', '.op', ...cards.filter(line => /^(D_D[12]|R_R1|V_V[12]|C_C8)\s/.test(line)), '.end', ''].join('\n');
    const disableOwn = await own(disableNetwork); const disableNative = native(disableNetwork);
    function disableKcl(point: Point, prefix = '', disable = 'disa'): Point {
      const value = (node: string) => point[`v(${prefix + node})`];
      const vt = 1.38064852e-23 / 1.6021766208e-19 * 300.15; // ngspice-47 const.h
      const diode = (from: string, to: string) => {
        const voltage = value(from) - value(to);
        const current = voltage >= -3 * vt ? 1e-15 * Math.expm1(voltage / vt) : -1e-15 * (1 + (3 * vt / (voltage * Math.E)) ** 3);
        return current + 1e-12 * voltage;
      };
      return { disable: (point[`v(${disable})`] - value('10')) / 5625 + point[`v(${disable})`] / 1e12, node10: (value('10') - point[`v(${disable})`]) / 5625 - diode('l', '10') + diode('10', 'h') + value('10') / 1e12 };
    }
    const disable = { sha256: hash(disableNetwork), own: disableOwn, native: disableNative, differences: diff(disableOwn.point, disableNative.point), kcl: { ownFull: disableKcl(ownBase.point, 'xu68.', 'unconnected-_u68-_dis-pad8_'), nativeFull: disableKcl(nativeBase.point, 'xu68.', 'unconnected-_u68-_dis-pad8_'), ownReduced: disableKcl(disableOwn.point), nativeReduced: disableKcl(disableNative.point) } };
    console.log('Disable network', disable);
    const short = original.replace('.TRAN 1m 10m', '.TRAN 1m 1e-9');
    const shortRun = { sha256: hash(short), own: await own(short), native: native(short) };
    for (const run of [seededOwn, seededNative, disableOwn, disableNative, ...reductions.flatMap(row => [row.own, row.native]), ...transistorProbes.flatMap(row => [row.own, row.native]), ...diodeProbes.flatMap(row => [row.own, row.native])]) {
      assert.equal(run.status, 'success');
      assert(Object.values(run.point).every(Number.isFinite));
    }
    assert.equal(receipt.baseline.differences.length, Object.keys(nativeBase.point).length);
    assert.equal(transistorProbes.length, 9); assert.equal(diodeProbes.length, 12);
    writeFileSync(output, JSON.stringify({ ...receipt, transistorProbes, diodeProbes, ownResiduals: residuals, disable, short: shortRun }, null, 2) + '\n');
    console.log(JSON.stringify({ compared: receipt.baseline.differences.length, short: { own: shortRun.own.status, native: shortRun.native.status }, reductions: reductions.map(row => ({ instance: row.instance, differences: row.differences.slice(0, 3) })) }, null, 2));
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
