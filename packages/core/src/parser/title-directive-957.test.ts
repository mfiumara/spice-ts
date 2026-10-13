import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse, parseAsync, parseTitleless, parseTitlelessAsync } from './index.js';

const fixture = readFileSync(new URL(
  '../../../../benchmarks/corpus/corpus-j/fixtures/spicelib/examples/testfiles/test_kicad_nets.cir',
  import.meta.url,
));

// Circuit has no public title field. Both physical titles and .title metadata
// must leave devices, analyses and numparam evaluation untouched.
describe('.title metadata (#957)', () => {
  it('accepts the unchanged corpus-j j-16 KiCad deck', () => {
    expect(createHash('sha256').update(fixture).digest('hex'))
      .toBe('5a124dc0286910a59a8782d0094a9bf8a57507a9c864090b6745ef4230b88f7f');
    expect(parse(fixture.toString()).compile().devices).toHaveLength(5);
  });

  for (const [name, parser, titled] of [
    ['parse', parse, true],
    ['parseAsync', parseAsync, true],
    ['parseTitleless', parseTitleless, false],
    ['parseTitlelessAsync', parseTitlelessAsync, false],
  ] as const) {
    it(`ignores title text anywhere through ${name}`, async () => {
      const body = `.TiTlE replacement {not_a_parameter} 'not an expression'
+ continued {also_not_a_parameter}
V1 in 0 1
.subckt load a
.title subcircuit {not_a_parameter}
R1 a 0 1k
.ends
X1 in load
.title later metadata
.op
.title
.end`;
      const circuit = await parser(titled ? `Original title\n${body}` : body);
      expect(circuit.compile().devices.map(device => device.name)).toEqual(['V1', 'X1:R1']);
      expect(circuit.analyses).toEqual([{ type: 'op' }]);
      expect(circuit.parseWarnings).toEqual([]);
    });
  }

  it('ignores .title in included files', async () => {
    const circuit = await parseAsync('Original\n.include load.cir\nV1 in 0 1\n.op\n.end',
      async () => '.title included {not_a_parameter}\nR1 in 0 1k');
    expect(circuit.compile().devices.map(device => device.name)).toEqual(['R1', 'V1']);
  });

  it('preserves subsequent source line numbers and rejects unrelated directives', () => {
    expect(() => parse('Original\n.title replacement\n.titleish text\n.end'))
      .toThrow(/line 3: Unsupported dot command.*\.titleish/);
  });
});
