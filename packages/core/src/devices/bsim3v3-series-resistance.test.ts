import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from '../parser/index.js';
import { Resistor } from './resistor.js';
import { UnsupportedModelParameterError } from '../errors.js';

const fixture = readFileSync(new URL(
  '../../../../benchmarks/corpus/corpus-f/fixtures/examples/tclspice/tcl-testbench4/example.cir', import.meta.url,
), 'utf8').split(/\r?\n/);

/** One `.model <name>` card (with + continuations) of the fixture, renamed MOD. */
function corpusCard(modelName: string): string {
  const start = fixture.findIndex(line => new RegExp(`^\\.model\\s+${modelName}\\s`, 'i').test(line));
  const card = [fixture[start]];
  for (let i = start + 1; i < fixture.length && fixture[i].startsWith('+'); i++) card.push(fixture[i]);
  return card.join('\n').replace(new RegExp(`^\\.model\\s+${modelName}`, 'i'), '.model MOD');
}

function withVersion(card: string, version: string): string {
  return card.replace(/\bVERSION\s*=\s*[^\s)]+/i, `VERSION=${version}`);
}

// Issue #691: b3set.c / b3v32set.c (acmMod = 0) default NRD = NRS = 1 square
// and put RSH * NRD and RSH * NRS in front of drain/source prime nodes; the
// load scales both conductances by M. References: ngspice-47 `-b`, numdgt=15,
// on these exact decks (benchmarks/bsim3-rsh-691/probe.ts). The corpus-f TSMC
// 0.25u cards (tcl-testbench4 Nmod/Pmod, VERSION = 3.2.2) have RSH = 4.5.
const nmos = corpusCard('Nmod');
const pmos = corpusCard('Pmod');

function deck(card: string, instance: string, bias = 2.5): string {
  return [
    '* bsim3 rsh probe', `VD d 0 ${bias}`, `VG g 0 ${bias}`, card,
    `M1 d g 0 0 MOD L=0.25u W=40u ${instance}`, '.op', '.end',
  ].join('\n');
}

const CASES: { name: string; card: string; instance: string; bias?: number; ngspice: number }[] = [
  { name: 'default NRD = NRS = 1 (4.5 ohm each)', card: nmos, instance: '', ngspice: -2.16714305378721e-02 },
  { name: 'NRD=0 NRS=0 (no series resistance)', card: nmos, instance: 'NRD=0 NRS=0', ngspice: -2.37799406299022e-02 },
  { name: 'M=2 halves both resistances', card: nmos, instance: 'M=2', ngspice: -4.33428610757442e-02 },
  { name: 'NRD=2 NRS=0.5', card: nmos, instance: 'NRD=2 NRS=0.5', ngspice: -2.24490681216255e-02 },
  { name: 'NRD=0 NRS=3 (source prime node only)', card: nmos, instance: 'NRD=0 NRS=3', ngspice: -1.87951067737700e-02 },
  { name: 'VERSION=3.3.0 device', card: withVersion(nmos, '3.3.0'), instance: '', ngspice: -2.16714305378721e-02 },
  { name: 'VERSION=3.2.4 revision', card: withVersion(nmos, '3.2.4'), instance: '', ngspice: -2.16714305378721e-02 },
  { name: 'PMOS default', card: pmos, instance: '', bias: -2.5, ngspice: 9.889677610980736e-03 },
];

describe('BSIM3 RSH * NRD/NRS series resistance (#691)', () => {
  for (const c of CASES) {
    it(`matches ngspice-47 i(vd): ${c.name}`, async () => {
      const result = await simulate(deck(c.card, c.instance, c.bias));
      const current = result.dc!.current('VD');
      expect(Math.abs(current - c.ngspice) / Math.abs(c.ngspice)).toBeLessThan(1e-6);
    });
  }

  it('inserts a prime node only for a non-zero resistance (b3set.c)', () => {
    const resistors = (instance: string) => parse(deck(nmos, instance)).compile().devices
      .filter((d): d is Resistor => d instanceof Resistor).map(d => d.name);
    expect(resistors('')).toEqual(['M1.RD', 'M1.RS']);
    expect(resistors('NRD=0 NRS=3')).toEqual(['M1.RS']);
    expect(resistors('NRD=0 NRS=0')).toEqual([]);
    // No RSH on the card: no series resistance whatever NRD/NRS say.
    const bare = '.model MOD NMOS (LEVEL=8 VTH0=0.5)';
    expect(parse(deck(bare, 'NRD=4 NRS=4')).compile().devices.some(d => d instanceof Resistor)).toBe(false);
  });

  it('rejects ACM != 0, whose ACM resistances and defaults are not implemented', async () => {
    const card = nmos.replace(/LEVEL\s*=\s*8/i, 'LEVEL=8 ACM=1');
    await expect(simulate(deck(card, ''))).rejects.toBeInstanceOf(UnsupportedModelParameterError);
    const explicitZero = nmos.replace(/LEVEL\s*=\s*8/i, 'LEVEL=8 ACM=0');
    const result = await simulate(deck(explicitZero, ''));
    expect(result.dc!.current('VD')).toBeCloseTo(-2.16714305378721e-02, 9);
  });
});
