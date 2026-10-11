import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  generateCorpus,
  staleFiles,
  TARGET_CORPUS,
  TRANSLATION_DATE,
  translateGnucapDeck,
} from './gnucap-to-spice3.js';

const ROOT = resolve('.');
const REV = '5acb027125d6ea7c546badd03e026d8781c6a400';

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function translate(deck: string) {
  return translateGnucapDeck(deck, 'tests/x.ckt', REV);
}

function body(deck: string): string[] {
  const result = translate(deck);
  assert.equal(result.status, 'translated', JSON.stringify(result));
  return result.status === 'translated' ? result.text.split('\n').filter(line => !line.startsWith('* ')) : [];
}

describe('gnucap-to-spice3 rules', () => {
  it('keeps the title line verbatim and states modification, date and licence after it', () => {
    const result = translate('# my title\nr1 1 0 1\n.op\n.end');
    assert.equal(result.status, 'translated');
    if (result.status !== 'translated') return;
    const lines = result.text.split('\n');
    assert.equal(lines[0], '# my title');
    assert.match(lines[1], /translation of Gnucap tests\/x\.ckt at gnucap\/gnucap@5acb027/);
    assert.match(lines[2], /GPL-3\.0-or-later/);
    assert.match(lines[3], new RegExp(`Modified ${TRANSLATION_DATE} by benchmarks/translate/gnucap-to-spice3\\.ts`));
  });

  it('parenthesises unparenthesised source functions and drops the dc keyword before a function', () => {
    assert.deepEqual(body('t\ni1 1 0 pwl 0 5 .1 0\n.end'), ['t', 'i1 1 0 pwl(0 5 .1 0)', '.end']);
    assert.deepEqual(body('t\nv1 1 0 dc pulse(0 1 0 1 1 5 10) ac 1\n.end'), ['t', 'v1 1 0 pulse(0 1 0 1 1 5 10) ac 1', '.end']);
  });

  it('writes off=1 as the SPICE3 off flag', () => {
    assert.deepEqual(body('t\nq1 3 2 4 0 qstd off=1\n.end'), ['t', 'q1 3 2 4 0 qstd off', '.end']);
  });

  it('writes the single-frequency .ac shorthand and strips trace options', () => {
    assert.deepEqual(body('t\n.ac 1k\n.op trace iter\n.tran .1 100 0 uic trace rejected\n.end'), [
      't',
      '.ac lin 1 1k 1k',
      '.op',
      '.tran .1 100 0 uic',
      '.end',
    ]);
  });

  it('turns .plot into .print, drops plot ranges and Gnucap-only probes, comments out .print op', () => {
    assert.deepEqual(body('t\n.plot ac vdb(6) (0,80) vp(6)(-1,1)\n.print tran v(1) iter(0) i(v1) i(r1)\n.print op v(1)\n.end'), [
      't',
      '.print ac vdb(6) vp(6)',
      '.print tran v(1) i(v1)',
      '*gnucap-only: .print op v(1)',
      '.end',
    ]);
  });

  it('comments out console-only commands and removes Gnucap-only options', () => {
    assert.deepEqual(body('t\n.list\n.width out=80\n.status notime\n.options\n.options nopage reltol=1m\n.end'), [
      't',
      '*gnucap-only: .list',
      '*gnucap-only: .width out=80',
      '*gnucap-only: .status notime',
      '*gnucap-only: .options',
      '.options reltol=1m',
      '.end',
    ]);
  });

  it('renames a duplicate instance name that Gnucap keeps as two elements', () => {
    assert.deepEqual(body('t\nr3 3 0 1k\nr3 4 0 1k\n.end'), ['t', 'r3 3 0 1k', 'r3_2 4 0 1k', '.end']);
  });

  it('refuses constructs without an exact SPICE3 equivalent instead of approximating', () => {
    const cases: Array<[string, RegExp]> = [
      ['t\nv1 1 0 gen(1)\n.end', /`gen\(\)` generator/],
      ['t\n.ac dec 5 1 1k\n.ac\n.end', /bare Gnucap `\.ac`/],
      ['t\n.dc v1 0 1 .1\n.dc\n.end', /bare Gnucap `\.dc`/],
      ['t\n.op\n.param rs=1\n.end', /re-assigns a parameter/],
      ['t\n.model n nmos level=7 vth0=0.7\n.end', /level=7/],
      ['t\n.tran 0 10 1\n.end', /own \(start stop step\) order/],
      ['t\nv1 1 0 1\nv1 2 0 1\nf1 3 0 v1 2\n.end', /cannot be renamed safely/],
    ];
    for (const [deck, reason] of cases) {
      const result = translate(deck);
      assert.equal(result.status, 'unsupported-translation', deck);
      if (result.status === 'unsupported-translation') assert.match(result.reasons.join('\n'), reason, deck);
    }
  });
});

describe('corpus-e-spice3 committed artifacts', () => {
  it('equal the translator output regenerated from the pinned originals', async () => {
    assert.deepEqual(await staleFiles(ROOT), []);
  });

  it('cover exactly the corpus-e fixtures ngspice rejects verbatim, and the manifest matches the translations', async () => {
    const original = JSON.parse(await readFile(resolve(ROOT, 'benchmarks/corpus/corpus-e/manifest.json'), 'utf8')) as {
      circuits: Array<{ id: string; ngspice: { expectedStatus: string } }>;
    };
    const rejected = original.circuits.filter(circuit => circuit.ngspice.expectedStatus === 'fail').map(circuit => circuit.id);
    assert.equal(rejected.length, 15);

    const { records } = await generateCorpus(ROOT);
    assert.deepEqual(records.map(record => record.id), rejected);

    const manifest = JSON.parse(await readFile(resolve(ROOT, TARGET_CORPUS, 'manifest.json'), 'utf8')) as {
      source: { revision: string; licenseNoticeLocalPath: string; licenseNoticeSha256: string; licenseTextLocalPath: string; licenseTextSha256: string };
      circuits: Array<{ id: string; localPath: string; sha256: string; analyses: string[]; originalSha256: string; translation: { changes: string[] }; reference: { localPath: string; sha256: string } }>;
      unsupportedTranslations: Array<{ id: string; translation: { reasons: string[] }; reference: { localPath: string; sha256: string } }>;
    };
    assert.equal(manifest.source.revision, REV);
    for (const [path, digest] of [
      [manifest.source.licenseNoticeLocalPath, manifest.source.licenseNoticeSha256],
      [manifest.source.licenseTextLocalPath, manifest.source.licenseTextSha256],
    ]) {
      assert.equal(sha256(await readFile(resolve(ROOT, path))), digest, path);
    }

    const translated = records.filter(record => record.status === 'translated');
    const unsupported = records.filter(record => record.status === 'unsupported-translation');
    assert.deepEqual(manifest.circuits.map(circuit => circuit.id), translated.map(record => record.id));
    assert.deepEqual(manifest.unsupportedTranslations.map(entry => entry.id), unsupported.map(record => record.id));
    for (const circuit of manifest.circuits) {
      const record = translated.find(candidate => candidate.id === circuit.id)!;
      assert.equal(circuit.localPath, record.localPath);
      assert.equal(circuit.sha256, record.sha256);
      assert.equal(circuit.originalSha256, record.originalSha256);
      assert.deepEqual(circuit.analyses, record.analyses);
      assert.deepEqual(circuit.translation.changes, record.changes);
      assert.equal(sha256(await readFile(resolve(ROOT, circuit.localPath))), circuit.sha256);
    }
    for (const entry of manifest.unsupportedTranslations) {
      const record = unsupported.find(candidate => candidate.id === entry.id)!;
      assert.deepEqual(entry.translation.reasons, record.reasons);
    }
    for (const entry of [...manifest.circuits, ...manifest.unsupportedTranslations]) {
      assert.equal(sha256(await readFile(resolve(ROOT, entry.reference.localPath))), entry.reference.sha256, entry.id);
    }
  });
});
