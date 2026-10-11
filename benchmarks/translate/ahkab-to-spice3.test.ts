import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ahkabValue,
  buildTranslations,
  SOURCE_DIR,
  spiceValue,
  translateAhkabDeck,
} from './ahkab-to-spice3.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

function translated(deck: string): string {
  const result = translateAhkabDeck(deck, 'tests/x/x.ckt');
  assert.equal(result.status, 'translated', JSON.stringify(result));
  return result.status === 'translated' ? result.text : '';
}

function reasons(deck: string): string[] {
  const result = translateAhkabDeck(deck, 'tests/x/x.ckt');
  assert.equal(result.status, 'unsupported-translation');
  return result.status === 'unsupported-translation' ? result.reasons : [];
}

describe('committed corpus-d-spice3 translation', () => {
  it('equals the translator output byte for byte', async () => {
    const { files } = await buildTranslations(ROOT);
    for (const [path, text] of files) {
      assert.equal(await readFile(resolve(ROOT, path), 'utf8'), text, `${path} is stale: rerun benchmarks/translate/ahkab-to-spice3.ts`);
    }
  });

  it('covers all 20 corpus-d fixtures, keeps the originals unchanged and pins every reference file', async () => {
    const { manifest } = await buildTranslations(ROOT);
    const original = JSON.parse(await readFile(resolve(ROOT, SOURCE_DIR, 'manifest.json'), 'utf8')) as {
      circuits: Array<{ id: string; localPath: string; sha256: string }>;
    };
    assert.deepEqual(manifest.circuits.map(circuit => circuit.id), original.circuits.map(circuit => circuit.id));
    for (const circuit of original.circuits) {
      assert.equal(sha256(await readFile(resolve(ROOT, circuit.localPath))), circuit.sha256, `${circuit.id} original changed`);
    }
    for (const circuit of manifest.circuits) {
      if (circuit.translation.status === 'translated') {
        const text = await readFile(resolve(ROOT, circuit.localPath ?? ''), 'utf8');
        const originalText = await readFile(resolve(ROOT, circuit.originalLocalPath), 'utf8');
        assert.equal(text.split('\n')[0], originalText.split('\n')[0], `${circuit.id}: title line must be kept`);
        assert.match(text, /GPL-2\.0-only/);
        assert.match(text, /Modified \d{4}-\d{2}-\d{2} by benchmarks\/translate\/ahkab-to-spice3\.ts/);
        assert.ok(circuit.translation.changes.length > 0);
      } else {
        assert.equal(circuit.localPath, undefined);
        assert.ok(circuit.translation.reasons.length > 0, `${circuit.id}: unsupported needs a reason`);
      }
      for (const reference of circuit.ahkabReferences ?? []) {
        assert.equal(sha256(await readFile(resolve(ROOT, reference.localPath))), reference.sha256);
      }
    }
    for (const file of ['LICENSE-NOTICE.md', 'COPYING.txt']) {
      assert.deepEqual(
        await readFile(resolve(ROOT, 'benchmarks/corpus/corpus-d-spice3', file)),
        await readFile(resolve(ROOT, SOURCE_DIR, file)),
      );
    }
  });
});

describe('ahkab number fields', () => {
  it('reads M as milli and only accepts exact ahkab multipliers', () => {
    assert.equal(ahkabValue('20M'), 20e-3);
    assert.equal(ahkabValue('1MEG'), 1e6);
    assert.equal(ahkabValue('.3k'), 0.3e3);
    assert.throws(() => ahkabValue('10uF'));
    assert.equal(spiceValue('10uF'), 10 * 1e-6);
    assert.equal(spiceValue('20M'), ahkabValue('20M'));
  });
});

describe('source translation', () => {
  it('maps ahkab AM onto an ngspice AM with the identical waveform', () => {
    const text = translated('t\nv1 1 0 type=vdc vdc=0 type=AM 2.5 4 100 1K 1M\nr1 1 0 1\n.tran 1u 2m\n');
    assert.match(text, /^v1 1 0 DC 0 AM\(0 10 2\.5 100 1K 1M\)$/m);
    const [sa, oc, fm, fc, td] = [2.5, 4, 100, 1e3, 1e-3];
    for (const t of [0, 1e-3, 1.0001e-3, 1.37e-3, 1.9e-3]) {
      const ahkab = t <= td ? 0 : sa * (oc + Math.sin(2 * Math.PI * fm * (t - td))) * Math.sin(2 * Math.PI * fc * (t - td));
      const ngspice = t - td <= 0 ? 0 : 0 + (sa * oc + sa * Math.sin(2 * Math.PI * fm * (t - td))) * Math.sin(2 * Math.PI * fc * (t - td));
      assert.ok(Math.abs(ahkab - ngspice) <= 1e-12 * Math.max(1, Math.abs(ahkab)), `t=${t}`);
    }
  });

  it('writes keyed PULSE/SIN positionally and DC/AC values as SPICE3 keywords', () => {
    const text = translated('t\nv1 1 0 type=vdc vdc=0 type=pulse v1=0 v2=1 td=0 tr=1n tf=2n pw=3n per=1u\nr1 1 0 1\n'
      + 'i1 2 0 type=idc idc=0 iac=1 type=sin 0 5 1k\nr2 2 0 1\n.tran 1n 1u\n');
    assert.match(text, /^v1 1 0 DC 0 PULSE\(0 1 0 1n 2n 3n 1u\)$/m);
    assert.match(text, /^i1 2 0 DC 0 AC 1 SIN\(0 5 1k 0 0\)$/m);
  });

  it('refuses a PULSE whose ahkab and SPICE3 periodic extensions differ', () => {
    assert.match(reasons('t\nv1 1 0 type=vdc vdc=0 type=pulse v1=0 v2=1 td=80n tr=1n tf=1n pw=50n per=100n\nr1 1 0 1\n').join(), /PULSE timing/);
  });

  it('refuses a source without a DC value', () => {
    assert.match(reasons('t\nvs 1 0 type=sin 0 15 60 0 0\nr1 1 0 1\n.tran 1m 30m\n').join(), /without vdc=/);
  });
});

describe('analysis translation', () => {
  const rlc = 't\nv1 1 0 type=vdc vdc=0 type=pulse v1=0 v2=1 td=0 tr=1n tf=1n pw=1n per=1000\nc1 2 0 550p ic=0\nr1 2 1 1k\n';

  it('maps uic=2 to UIC only when the OP and every element IC are zero', () => {
    assert.match(translated(`${rlc}.tran tstep=10n tstop=1u uic=2\n`), /^\.tran 10n 1u UIC$/m);
    assert.match(reasons(`${rlc}vb 3 0 type=vdc vdc=1\nr3 3 0 1\n.tran tstep=10n tstop=1u uic=2\n`).join(), /uic=2/);
    assert.match(reasons(rlc.replace('ic=0', 'ic=2.5') + '.tran tstep=10n tstop=1u uic=2\n').join(), /uic=2/);
  });

  it('maps uic=0 to UIC only without element ICs', () => {
    assert.match(reasons(`${rlc}.tran 10n 1u\n`).join(), /uic=0 ignores element ICs/);
  });

  it('states the Gear order caveat and keeps trap as trap', () => {
    const gear = translateAhkabDeck(`${rlc}.tran tstep=10n tstop=1u uic=2 method=gear5\n`, 'tests/x/x.ckt');
    assert.equal(gear.status, 'translated');
    if (gear.status === 'translated') {
      assert.match(gear.text, /^\.options method=gear maxord=5$/m);
      assert.ok(gear.changes.some(change => /variable-order/.test(change)));
    }
    assert.match(translated(`${rlc}.tran tstep=10n tstop=1u uic=2 method=trap\n`), /^\.options method=trap$/m);
  });

  it('translates AC grids only when SPICE3 can reproduce them exactly', () => {
    const rc = 't\nv1 1 0 type=vdc vdc=0 vac=1\nr1 1 2 1k\nc1 2 0 1u\n';
    assert.match(translated(`${rc}.ac start=1 stop=1k nsteps=31\n`), /^\.ac dec 10 1 1k$/m);
    assert.match(translated(`${rc}.ac type=lin start=1 stop=10 nsteps=10\n`), /^\.ac lin 10 1 10$/m);
    assert.match(reasons(`${rc}.ac start=.1 stop=10 nsteps=100\n`).join(), /points\/decade/);
  });

  it('marks EKV, symbolic and unknown constructs unsupported instead of approximating', () => {
    assert.match(reasons('t\nm1 d g 0 0 nch w=1u l=1u\n.model ekv nch type=n vto=.5 kp=10e-6\n').join(), /EKV/);
    assert.match(reasons('t\nr1 1 0 1\n.op\n.symbolic\n').join(), /symbolic/);
    assert.match(reasons('t\nq1 c b e npn\n').join(), /unsupported ahkab element/);
    assert.match(reasons('t\nr1 1 0 1\n.option foo=1\n').join(), /unrecognised ahkab directive/);
  });

  it('adds the 300 K operating and nominal temperature only to decks with diodes', () => {
    const diode = translated('t\nv1 1 0 type=vdc vdc=1\nr1 1 2 1\nd1 2 0 di\n.model diode di\n.op\n');
    assert.match(diode, /^\.model di D$/m);
    assert.match(diode, /^\.temp 26\.85$/m);
    assert.match(diode, /^\.options tnom=26\.85$/m);
    assert.doesNotMatch(translated('t\nv1 1 0 type=vdc vdc=1\nr1 1 0 1\n.op\n'), /\.temp/);
  });
});
