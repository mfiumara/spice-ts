import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_FIXTURES } from '../../comparison-harness.js';
import { auditOptions, parseOptionNumber, type auditTree } from './option-audit.js';

test('required integral narrowing boundaries, without fractional rounding false positives', () => {
  const hits = auditOptions('title\n.options rshunt=1T a=1G b=2147483647 c=1000000000000.5\n');
  assert.deepEqual(hits, [{ line: 2, option: 'rshunt', text: '1T', parsedValue: 1e12 }]);
  assert.equal(auditOptions('title\n.option a=9007199254740992.5\n').length, 0);
});

test('case, signs, exponents, suffixes, units, comments and continuation lines', () => {
  const hits = auditOptions(['title', '* .options ignored=1T', '.OpTiOn GMIN = -3G foo=2.2e9 $ ignored=1T',
    '+ itl1=3MEGohm bar=3e3Meg ; ignored=1T', '.options (abstol="1T" nohit=1m)', '.end'].join('\n'));
  assert.deepEqual(hits.map(h => [h.option, h.text, h.parsedValue]), [
    ['gmin', '-3G', -3e9], ['foo', '2.2e9', 2.2e9], ['bar', '3e3Meg', 3e9], ['abstol', '"1T"', 1e12],
  ]);
  assert.equal(parseOptionNumber('1mil')?.value, 25.4e-6);
  assert.equal(parseOptionNumber('1M')?.value, 1e-3);
  assert.equal(parseOptionNumber('{parameter}'), null);
  assert.equal(parseOptionNumber('1e999'), null);
});

test('non-option statements and title text are not audited', () => {
  assert.deepEqual(auditOptions('.options title=1T\nR1 n 0 1T\n.model x D(is=1T)\n* comment\n+ rshunt=1T'), []);
});

test('committed receipt matches available bytes; fetch-only absence is not a clean bill of health', () => {
  const receipt = JSON.parse(readFileSync('benchmarks/results/issue-1049/option-audit.json', 'utf8')) as Awaited<ReturnType<typeof auditTree>>;
  assert.equal(receipt.hits.length, 5);
  assert(receipt.unavailablePins.length > 0);
  for (const deck of [...receipt.decks, ...receipt.generatorSources]) {
    const generated = deck.path.startsWith('benchmarks/comparison-harness.ts#');
    const bytes = generated
      ? DEFAULT_FIXTURES.find(f => deck.path === `benchmarks/comparison-harness.ts#${f.name}`)?.netlist
      : existsSync(deck.path) ? readFileSync(deck.path) : undefined;
    if (bytes === undefined) {
      assert(deck.path.startsWith('benchmarks/corpus/ngspice-bugs/fetched/'), `missing committed input ${deck.path}`);
      continue;
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), deck.sha256, deck.path);
    assert.deepEqual(auditOptions(bytes.toString()).map(hit => ({ ...deck, ...hit })),
      receipt.hits.filter((hit: { path: string }) => hit.path === deck.path));
  }
});
