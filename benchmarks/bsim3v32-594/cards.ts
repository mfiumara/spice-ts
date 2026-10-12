/**
 * Identical-netlist BSIM3v32 (LEVEL=8/49 VERSION=3.2.x) cases for issue #594.
 *
 * ngspice-47 runs a LEVEL=8/49 card whose VERSION= starts with `3.2` with its
 * bsim3v32 device (src/spicelib/parser/inpdomod.c), and b3v32set.c maps the
 * string to a revision: `3.2.4`/`3.24*` -> 3.2.4, `3.2.3`/`3.23*` -> 3.2.3,
 * `3.2.2`/`3.22*` -> 3.2.2, any other `3.2*` -> 3.2. The cases are:
 *
 * - the two corpus-f TSMC 0.25u cards that triggered #594 (VERSION = 3.2.2,
 *   copied at run time from examples/tclspice/tcl-testbench4/example.cir, see
 *   benchmarks/corpus/corpus-f/SOURCES.md), with one of that deck's instance
 *   lines each;
 * - the #589/#626 BSIM3 cards (benchmarks/bsim3-dc-589/cards.ts,
 *   benchmarks/bsim3-charge-626/cards.ts) with their VERSION= set to a 3.2.x
 *   revision, chosen so that every revision branch of b3v32ld.c is driven:
 *   the IJTH-linearised junction (3.2 vs 3.2.2+), the Abulk < 0.1 guard
 *   (3.2), Vds = 0 (3.2), and capMod 1/2/3 with every partition;
 * - `.options temp=` variants (the corpus-f decks run at TEMP = 25 with
 *   TNOM = 25), for the 3.2.x revisions and the 3.3.0 device, which share
 *   the b3temp.c/b3v32temp.c temperature laws.
 *
 * The TSMC instance lines carry NRD=0 NRS=0: the card has RSH = 4.5, and
 * ngspice (b3v32set.c) defaults NRD = NRS = 1 square, i.e. a 4.5 ohm series
 * resistance on each terminal that spice-ts does not model for any BSIM3
 * revision (https://github.com/mfiumara/spice-ts/issues/691). Zero squares
 * remove those resistors in ngspice, so both engines see the intrinsic device.
 */
import { readFileSync } from 'node:fs';
import { BSIM3_DC_CASES, type Bsim3DcCase } from '../bsim3-dc-589/cards.js';
import { BSIM3_CHARGE_CASES } from '../bsim3-charge-626/cards.js';

const corpusF = new URL('../corpus/corpus-f/fixtures/', import.meta.url);
export const TSMC_FIXTURE = 'examples/tclspice/tcl-testbench4/example.cir';

/** Extract one `.model <name>` card (with + continuations) from a corpus-f fixture, renamed to `as`. */
export function corpusCard(relativePath: string, modelName: string, as = 'MOD'): string {
  const text = readFileSync(new URL(relativePath, corpusF), 'utf8');
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => new RegExp(`^\\.model\\s+${modelName}\\s`, 'i').test(line));
  if (start < 0) throw new Error(`model ${modelName} not found in ${relativePath}`);
  const card = [lines[start]];
  for (let i = start + 1; i < lines.length && lines[i].startsWith('+'); i++) card.push(lines[i]);
  return card.join('\n').replace(new RegExp(`^\\.model\\s+${modelName}`, 'i'), `.model ${as}`);
}

/** Set (or replace) the VERSION= of a BSIM3 card. */
export function withVersion(card: string, version: string): string {
  if (/\bVERSION\s*=\s*\S+/i.test(card)) return card.replace(/\bVERSION\s*=\s*[^\s)]+/i, `VERSION=${version}`);
  return card.replace(/\bLEVEL\s*=\s*\d+/i, match => `${match} VERSION=${version}`);
}

/** MNA0 and MPA0 of the tcl-testbench4 deck, with NRD=0 NRS=0 (see the file comment). */
const TSMC_NMOS_INSTANCE = 'L=2.53696435353243e-07 W=4.24857778403814e-05 AD=3.125e-11 AS=3.125e-11 '
  + 'PD=8.49715556807627e-05 PS=8.49715556807627e-05 NRD=0 NRS=0';
const TSMC_PMOS_INSTANCE = 'L=2.55343565546106e-07 W=0.000101772203908557 AD=7.8125e-11 AS=7.8125e-11 '
  + 'PD=0.000203544407817114 PS=0.000203544407817114 NRD=0 NRS=0';

/** A case, optionally run at a circuit temperature (`.options temp=`, Celsius). */
export interface Bsim3v32Case extends Bsim3DcCase {
  temperature?: number;
}

/**
 * Whether ngspice-47 must run each analysis of the case in a fresh process.
 * b3v32temp.c revisions 3.2 and 3.2.2 scale CJ/CJSW/CJSWG by (1 + TCJ*
 * (T - TNOM)) in place, and ngspice reruns the temperature update before
 * every analysis (CKTtemp in each job), so in one batch session the junction
 * capacitance compounds analysis after analysis (capbd 2.1006e-15,
 * 2.0597e-15, 2.0196e-15 ... F for repeated `ac` at one bias of
 * junction-temp-nmos VERSION=3.2.2). A deck with a single analysis, the
 * case spice-ts models, applies the factor once.
 */
export function compoundsJunctionCaps(c: Bsim3v32Case): boolean {
  const version = /\bVERSION\s*=\s*([^\s)]+)/i.exec(c.model)?.[1];
  const v32or322 = version !== undefined && version.startsWith('3.2') && !/^(?:3\.2\.[34]|3\.2[34])/.test(version);
  return v32or322 && /\bTCJ(?:SW|SWG)?\s*=/i.test(c.model);
}

/** Insert `.options temp=` before `.end` when the case has a temperature. */
export function withTemperature(deck: string, c: Bsim3v32Case): string {
  return c.temperature === undefined ? deck : deck.replace(/^\.end$/m, `.options temp=${c.temperature}\n.end`);
}

const tsmc = (type: 1 | -1): Bsim3v32Case => ({
  name: `tsmc025-322-${type > 0 ? 'nmos' : 'pmos'}`,
  type,
  model: corpusCard(TSMC_FIXTURE, type > 0 ? 'Nmod' : 'Pmod'),
  instance: type > 0 ? TSMC_NMOS_INSTANCE : TSMC_PMOS_INSTANCE,
  source: `corpus-f ${TSMC_FIXTURE} ${type > 0 ? 'Nmod/MNA0' : 'Pmod/MPA0'} (VERSION = 3.2.2), NRD=0 NRS=0`,
});

function revision(cases: readonly Bsim3v32Case[], name: string, version: string, temperature?: number): Bsim3v32Case {
  const base = cases.find(c => c.name === name);
  if (!base) throw new Error(`unknown case ${name}`);
  return {
    ...base,
    name: `${base.name}-v${version}${temperature === undefined ? '' : `-t${temperature}`}`,
    model: withVersion(base.model, version),
    source: `${base.source}, VERSION=${version}${temperature === undefined ? '' : `, .options temp=${temperature}`}`,
    temperature,
  };
}

const atTemperature = (c: Bsim3v32Case, temperature: number): Bsim3v32Case => ({
  ...c, name: `${c.name}-t${temperature}`, source: `${c.source}, .options temp=${temperature}`, temperature,
});

/** DC cases: operating points (b3ld.c outputs) and an Id-Vds sweep each. */
export const BSIM3V32_DC_CASES: readonly Bsim3v32Case[] = [
  tsmc(1),
  tsmc(-1),
  atTemperature(tsmc(1), 25),
  atTemperature(tsmc(-1), 25),
  atTemperature(tsmc(1), 85),
  // IJTH = 1e-9: the forward drain junction at Vds < 0 runs the IJTH-linearised branch.
  revision(BSIM3_DC_CASES, 'corner-nmos', '3.2'),
  revision(BSIM3_DC_CASES, 'corner-nmos', '3.2.2'),
  // A0 = -8: Abulk < 0.1 guard (3.2 scales only dAbulk_dVb).
  revision(BSIM3_DC_CASES, 'corner2-nmos', '3.2'),
  revision(BSIM3_DC_CASES, 'corner2-nmos', '3.2.3'),
  revision(BSIM3_DC_CASES, 'stress-nmos', '3.2'),
  revision(BSIM3_DC_CASES, 'stress-pmos', '3.2.4'),
  revision(BSIM3_DC_CASES, 'corner-pmos', '3.2'),
  revision(BSIM3_DC_CASES, 'issue-589-nmos', '3.24'),
  // The same temperature laws for the 3.3.0 device.
  revision(BSIM3_DC_CASES, 'stress-nmos', '3.3.0', 85),
  revision(BSIM3_DC_CASES, 'stress-pmos', '3.3.0', -20),
  revision(BSIM3_DC_CASES, 'corner-nmos', '3.2.2', 60),
];

/** Charge cases: b3ld.c capacitances, state charges and AC capacitance matrices. */
export const BSIM3V32_CHARGE_CASES: readonly Bsim3v32Case[] = [
  tsmc(1),
  tsmc(-1),
  atTemperature(tsmc(1), 25),
  atTemperature(tsmc(-1), 25),
  ...['3.2', '3.2.2'].flatMap(version => [
    'capmod0-xpart0-nmos', 'capmod1-xpart0-nmos', 'capmod1-xpart1-pmos', 'capmod2-xpart1-nmos',
    'capmod2-xpart0-pmos', 'capmod3-xpart1-nmos', 'capmod3-xpart05-pmos', 'capmod3-dlc-nmos',
  ].map(name => revision(BSIM3_CHARGE_CASES, name, version))),
  revision(BSIM3_CHARGE_CASES, 'issue-589-nmos', '3.2.4'),
  revision(BSIM3_CHARGE_CASES, 'stress-pmos', '3.2.3'),
  revision(BSIM3_CHARGE_CASES, 'junction-temp-nmos', '3.2.2'),
  revision(BSIM3_CHARGE_CASES, 'junction-swg-pmos', '3.2.4'),
  revision(BSIM3_CHARGE_CASES, 'junction-temp-nmos', '3.2.2', 90),
  revision(BSIM3_CHARGE_CASES, 'junction-temp-nmos', '3.3.0', 90),
  revision(BSIM3_CHARGE_CASES, 'capmod3-xpart1-nmos', '3.3.0', -10),
];

/** NMOS-convention DC bias grid (V); includes Vds = 0, where 3.2 keeps a non-zero Vdseff. */
export const VGS_GRID = [0, 0.3, 0.5, 0.7, 1.0, 1.4, 1.8];
export const VDS_GRID = [-0.6, 0, 0.05, 0.3, 0.9, 1.8];
export const VBS_GRID = [0, -0.9];

/**
 * Transient deck: a three-stage inverter chain of the unchanged corpus-f TSMC
 * VERSION = 3.2.2 cards (capMod 2, XPART 1) with that deck's MNA0/MPA0
 * geometry, NRD=0 NRS=0, a pulse input, a 50 fF load and the deck's
 * `.OPTIONS TEMP=25`. TMAX = 2 ps so both engines resolve every edge.
 */
export function inverterChainDeck(): string {
  const n = (d: string, g: string) => `${d} ${g} 0 0 Nmod ${TSMC_NMOS_INSTANCE}`;
  const p = (d: string, g: string) => `${d} ${g} vdd vdd Pmod ${TSMC_PMOS_INSTANCE}`;
  return [
    'bsim3v32 inverter chain (#594)',
    'VDD vdd 0 DC 2.5',
    'VIN in 0 PULSE(0 2.5 0.2n 0.1n 0.1n 0.9n 2n)',
    `MN1 ${n('n1', 'in')}`,
    `MP1 ${p('n1', 'in')}`,
    `MN2 ${n('n2', 'n1')}`,
    `MP2 ${p('n2', 'n1')}`,
    `MN3 ${n('out', 'n2')}`,
    `MP3 ${p('out', 'n2')}`,
    'CL out 0 50f',
    '.tran 2p 4n 0 2p',
    '.options temp=25',
    corpusCard(TSMC_FIXTURE, 'Nmod', 'Nmod'),
    corpusCard(TSMC_FIXTURE, 'Pmod', 'Pmod'),
    '.end',
  ].join('\n');
}

/** Sample times strictly between the PULSE corners (0.2 + k * 0.1 ns grid offset by 25 ps). */
export const CHAIN_SAMPLE_TIMES = Array.from({ length: 160 }, (_, k) => Number(((k + 0.5) * 0.025e-9).toPrecision(12)));
export const CHAIN_SIGNALS = ['v(n1)', 'v(n2)', 'v(out)'] as const;
/** Width of the supply-charge window around each sample (s). */
export const CHAIN_WINDOW = 0.025e-9;
