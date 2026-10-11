/**
 * Run: pnpm exec tsx --test benchmarks/translate/xyce-to-spice3.test.ts
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  formatSpiceNumber,
  generateCorpus,
  parseSpiceNumber,
  staleFiles,
  translateXyceDeck,
} from './xyce-to-spice3.js';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const provenance = { upstreamUrl: 'https://example.invalid/x.cir', originalLocalPath: 'x.cir', originalSha256: '0' };
const sha256 = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');

function translated(deck: string): string {
  const result = translateXyceDeck(deck, provenance);
  assert.equal(result.status, 'translated', JSON.stringify(result));
  return result.status === 'translated' ? result.deck : '';
}

function activeLines(deck: string): string[] {
  return deck.split('\n').slice(1).filter(line => line.trim() && !line.trim().startsWith('*'));
}

test('committed xyce-spice3 files equal the translator output', async () => {
  assert.deepEqual(await staleFiles(repoRoot), []);
});

test('only the seven ngspice-rejected fixtures are covered, with honest statuses', async () => {
  const files = await generateCorpus(repoRoot);
  const manifest = JSON.parse(files.find(file => file.path.endsWith('manifest.json'))!.content);
  const statuses = Object.fromEntries(
    manifest.circuits.map((circuit: { id: string; translation: { status: string } }) => [circuit.id, circuit.translation.status]),
  );
  assert.deepEqual(statuses, {
    'capacitor-rc-transient': 'translated',
    'capacitor-rc-transient-newlte': 'unsupported-translation',
    'capacitor-rc-oscillator': 'translated',
    'diode-level2-temperature-breakdown': 'unsupported-translation',
    'diode-zener-5229': 'unsupported-translation',
    'diode-transient': 'translated',
    'njfet-stepped-dc': 'translated',
  });
});

test('verbatim originals stay byte-for-byte pinned', async () => {
  const manifest = JSON.parse(await readFile(resolve(repoRoot, 'benchmarks/corpus/xyce-spice3/manifest.json'), 'utf8'));
  for (const circuit of manifest.circuits) {
    const bytes = await readFile(resolve(repoRoot, circuit.original.localPath));
    assert.equal(sha256(bytes), circuit.original.sha256, circuit.id);
  }
});

test('translation keeps the title first and every non-dialect line unchanged', async () => {
  const manifest = JSON.parse(await readFile(resolve(repoRoot, 'benchmarks/corpus/xyce-spice3/manifest.json'), 'utf8'));
  for (const circuit of manifest.circuits.filter((c: { localPath?: string }) => c.localPath)) {
    const original = (await readFile(resolve(repoRoot, circuit.original.localPath), 'utf8')).split('\n');
    const deck = (await readFile(resolve(repoRoot, circuit.localPath), 'utf8')).split('\n');
    assert.equal(deck[0], original[0], `${circuit.id}: title`);
    const changed = new Set(
      deck.filter(line => line.startsWith('* [xyce-to-spice3] original: '))
        .map(line => line.slice('* [xyce-to-spice3] original: '.length)),
    );
    const kept = original.slice(1).filter(line => !changed.has(line.trimEnd()));
    const body = deck.slice(1);
    for (const line of kept) assert.ok(body.includes(line), `${circuit.id}: lost line '${line}'`);
  }
});

test('zero print-step .tran becomes (TSTOP - TSTART)/50', () => {
  assert.deepEqual(activeLines(translated('t\nr1 1 0 1\n.tran 0 5ms\n.end\n')), ['r1 1 0 1', '.tran 1e-4 5ms', '.end']);
  assert.deepEqual(activeLines(translated('t\n.TRAN 0 0.5ms\n')), ['.TRAN 1e-5 0.5ms']);
  assert.deepEqual(activeLines(translated('t\n.tran 0 1 0.5 100m\n')), ['.tran 1e-2 1 0.5 100m']);
  assert.deepEqual(activeLines(translated('t\n.tran 1u 1m\n')), ['.tran 1u 1m']);
});

test('TIMEINT tolerances are commented out; other TIMEINT fields are not translated', () => {
  assert.deepEqual(activeLines(translated('t\n.options timeint reltol=1e-4 abstol=1e-4 method=7\n')), []);
  const result = translateXyceDeck('t\n.options timeint reltol=1e-6 newlte=2\n', provenance);
  assert.equal(result.status, 'unsupported-translation');
  assert.match(result.status === 'unsupported-translation' ? result.reasons[0] : '', /newlte=2/);
});

test('.step over a source becomes the outer sweep of a nested .dc', () => {
  const deck = translated('t\nVds 1 0 0\n.DC VDS 0 15 1\nVgs 2 0 0\n.Step Vgs 0 -1.875 -0.625\nr1 1 2 1k\n');
  assert.deepEqual(activeLines(deck), ['Vds 1 0 0', '.DC VDS 0 15 1 Vgs 0 -1.875 -0.625', 'Vgs 2 0 0', 'r1 1 2 1k']);
  const temp = translateXyceDeck('t\nv1 1 0 1\n.dc v1 0 1 0.1\n.step TEMP list -55 25 72\n', provenance);
  assert.equal(temp.status, 'unsupported-translation');
});

test('grounded capacitor IC= without UIC gains the equivalent .ic', () => {
  assert.deepEqual(
    activeLines(translated('t\nc1 1 0 1uF IC=1\n.tran 0 5ms\n')),
    ['c1 1 0 1uF IC=1', '.ic v(1)=1', '.tran 1e-4 5ms'],
  );
  assert.deepEqual(activeLines(translated('t\nc1 0 n2 1u IC=2\n')), ['c1 0 n2 1u IC=2', '.ic v(n2)=-2']);
  assert.deepEqual(activeLines(translated('t\nc1 1 0 1u IC=1\n.tran 1u 1m uic\n')), ['c1 1 0 1u IC=1', '.tran 1u 1m uic']);
  assert.equal(translateXyceDeck('t\nc1 1 2 1u IC=1\n', provenance).status, 'unsupported-translation');
  assert.equal(translateXyceDeck('t\nl1 1 0 1u IC=1m\n', provenance).status, 'unsupported-translation');
});

test('.print brace expressions become their referenced output variables', () => {
  assert.deepEqual(activeLines(translated('t\n.PRINT TRAN I(VMON) V(3) {V(3)/I(VMON)}\n')), ['.PRINT TRAN I(VMON) V(3)']);
  assert.deepEqual(activeLines(translated('t\n.print tran {v(2)+0.002}  \n')), ['.print tran v(2)']);
});

test('level-2 diode models are never approximated', () => {
  const result = translateXyceDeck('t\n.MODEL DZR D( level=2\n+ IS = 1E-14\n+ BV = 7.255;7.25 yields\n+ )\nd1 1 0 DZR\n', provenance);
  assert.equal(result.status, 'unsupported-translation');
  assert.match(result.status === 'unsupported-translation' ? result.reasons[0] : '', /LEVEL=2/);
});

test('SPICE numbers parse and format deterministically', () => {
  assert.equal(parseSpiceNumber('5ms'), 5e-3);
  assert.equal(parseSpiceNumber('2.0e-4'), 2e-4);
  assert.equal(parseSpiceNumber('1meg'), 1e6);
  assert.equal(formatSpiceNumber(5e-3 / 50), '1e-4');
  assert.equal(formatSpiceNumber(2e-4 / 50), '4e-6');
});
