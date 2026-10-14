import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
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
      expect(circuit.compile().devices.map(device => device.name)).toEqual(['V1', 'X1.R1']);
      expect(circuit.analyses).toEqual([{ type: 'op' }]);
      expect(circuit.parseWarnings).toEqual([]);
    });
  }

  // ngspice-47 inpcom.c:1442-1456 comments .title before stitching at 1958;
  // 694-702 skips comments without resetting the preceding regular card.
  it('continues the preceding resistor across title cards and multiple + lines', async () => {
    const result = await simulate(`Original
V1 in 0 1
R1 in 0
.title replacement {not_a_parameter}
+ 1k
.title another replacement
+ m=2
.op
.end`);
    expect(result.dc!.current('V1')).toBeCloseTo(-0.002, 12);
  });

  for (const titled of [false, true]) {
    for (const nested of [false, true]) {
      for (const [name, assignment] of [
        ['numeric', 'r=\n.title metadata\n+ 2k'],
        ['bare', 'r=\n.TiTlE metadata {missing}\n+ seed*2'],
        ['braced', 'r={seed\n.title metadata\n+ *2}'],
        ['quoted', "r='seed\n.title metadata\n+ *2'"],
      ] as const) {
        it(`folds ${name} X RHS across .title (${titled ? 'physical title' : 'titleless'}, ${nested ? 'nested' : 'top-level'})`, async () => {
          const call = `X1 in load ${assignment}`;
          const body = `.param seed=1k
.subckt load a params: r=1k
R1 a 0 {r}
.ends
V1 in 0 1
${nested ? `.subckt caller in params: seed=1k\n${call}\n.ends\nXouter in caller` : call}
.op
.end`;
          const circuit = titled ? parse(`Original\n${body}`) : parseTitleless(body);
          const result = await simulate(circuit);
          expect(result.dc!.current('V1')).toBeCloseTo(-0.0005, 12);
        });
      }
    }
  }

  it('does not hide undefined parameters on a continuation after .title', () => {
    expect(() => parse(`Original
.title replacement
+ continued {missing}
V1 in 0 1
R1 in 0 1k
.op
.end`)).toThrow(/missing/i);
  });

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
