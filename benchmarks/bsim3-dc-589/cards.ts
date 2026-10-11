/**
 * Identical-netlist BSIM3v3.3.0 (LEVEL=8/49) DC cases for issue #589.
 *
 * Each case is one model card and one instance line. The same bytes go to
 * ngspice-47 and spice-ts. Cards are either project-authored (the #589 issue
 * deck, the existing bsim3-validation cards and deliberately broad stress
 * cards) or copied at run time from already-ingested corpus-f fixtures
 * (provenance and licence in benchmarks/corpus/corpus-f/SOURCES.md).
 */
import { readFileSync } from 'node:fs';

export interface Bsim3DcCase {
  name: string;
  /** +1 NMOS, -1 PMOS. */
  type: 1 | -1;
  /** `.model MOD ...` card (model name is always MOD). */
  model: string;
  /** Instance parameters after the model name. */
  instance: string;
  /** Where the card comes from. */
  source: string;
}

const corpusF = new URL('../corpus/corpus-f/fixtures/', import.meta.url);

/** Extract one `.model <name>` card (with + continuations) from a corpus-f fixture. */
function corpusCard(relativePath: string, modelName: string): string {
  const text = readFileSync(new URL(relativePath, corpusF), 'utf8');
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => new RegExp(`^\\.model\\s+${modelName}\\s`, 'i').test(line));
  if (start < 0) throw new Error(`model ${modelName} not found in ${relativePath}`);
  const card = [lines[start]];
  for (let i = start + 1; i < lines.length && lines[i].startsWith('+'); i++) card.push(lines[i]);
  return card.join('\n').replace(new RegExp(`^\\.model\\s+${modelName}`, 'i'), '.model MOD');
}

const ISSUE_NMOS = '.model MOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 U0=400 TOX=4n VSAT=1.5e5 PCLM=1.3 '
  + 'PDIBLC1=0.39 PDIBLC2=0.0086 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)';
const ISSUE_PMOS = '.model MOD PMOS (LEVEL=49 VTH0=-0.5 K1=0.6 U0=150 TOX=4n VSAT=1.2e5 PCLM=1.3 '
  + 'PDIBLC1=0.39 PDIBLC2=0.0086 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)';
const VALIDATION_NMOS = '.model MOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 K2=-0.1 U0=400 TOX=4n VSAT=1.5e5 '
  + 'CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)';

// Stress cards: every optional b3ld.c branch the defaults leave dormant.
const STRESS_NMOS = [
  '.model MOD NMOS LEVEL=49 VERSION=3.3.0 MOBMOD=3 TNOM=25 TOX=5n NCH=3e17 NGATE=8e19',
  '+ VTH0=0.45 K1=0.55 K2=0.02 K3=40 K3B=1.5 W0=1e-6 NLX=1.5e-7 DVT0W=0.3 DVT1W=4e6 DVT2W=-0.02',
  '+ U0=420 UA=1.5e-9 UB=1.2e-18 UC=-0.04 VSAT=9e4 A0=1.2 AGS=0.2 A1=0.02 A2=0.9 B0=1e-7 B1=1e-7',
  '+ KETA=-0.03 RDSW=300 PRWG=0.05 PRWB=-0.1 WR=1 DWG=-5e-9 DWB=-3e-9 PVAG=0.6 DELTA=0.015',
  '+ ALPHA0=1e-6 ALPHA1=0.5 BETA0=20 PSCBE1=4e8 PSCBE2=1e-5 PDIBLCB=-0.1 ETA0=0.05 ETAB=-0.05',
  '+ CDSCD=1e-4 CDSCB=-1e-4 CIT=1e-4 NFACTOR=1.2 VOFF=-0.09 LINT=1e-8 WINT=5e-8',
  '+ LVTH0=5e-3 WU0=-20 PK1=1e-3 LL=2e-15 LLN=1 WW=-2e-16 WWN=1 UTE=-1.4 KT1=-0.12 AT=3e4 PRT=50',
].join('\n');
const STRESS_PMOS = [
  '.model MOD PMOS LEVEL=8 MOBMOD=2 TOX=6n NCH=4e23 NSUB=7e16 GAMMA1=0.7 GAMMA2=0.5 XT=1.2e-7',
  '+ VTH0=-0.55 U0=130 UA=2e-9 UB=1e-19 UC=-5e-11 VSAT=1e5 A1=-0.05 A2=0.95 RDSW=500',
  '+ PCLM=1.1 PDIBLC1=0.02 PDIBLC2=0.002 DROUT=0.4 DSUB=0.3 KETA=-0.01 ALPHA0=2e-6 BETA0=25',
  '+ BINUNIT=2 LKETA=-1e-9 WVSAT=1e-3 JS=1e-5 JSW=1e-11',
].join('\n');
// gamma1 only (no NCH): b3temp.c derives npeak from gamma1.
const GAMMA_NMOS = '.model MOD NMOS LEVEL=49 TOX=7n GAMMA1=0.6 VBM=-2.5 VTH0=0.6 U0=450 RDSW=150';
// Corner cards: drive b3ld.c's discontinuity guards (dvt2/dvt2w/keta/pdiblcb/
// etab/prwb/pvag/ua/nfactor/Abulk), the ijth-linearised and zero-Is junction
// branches, K1 without K2, VFB without VTH0, deep subthreshold and M > 1.
const CORNER_NMOS = [
  '.model MOD NMOS LEVEL=49 TOX=4n NCH=2e17 VTH0=0.5 K1=0.6 DVT2=1 DVT2W=1 DVT0W=0.1 KETA=1.2',
  '+ PDIBLCB=1.2 ETA0=0.05 ETAB=0.2 RDSW=400 PRWB=-2 PVAG=-2 UA=-3e-9 NFACTOR=-6 AGS=5',
  '+ IJTH=1e-9 U0=400 VSAT=1e5',
].join('\n');
const CORNER_PMOS = '.model MOD PMOS LEVEL=49 TOX=6n VFB=1.5 K1=0.5 U0=120 JS=0 JSW=0 MOBMOD=3';
// Abulk/Abulk0 < 0.1 (A0 < 0), PRWB clamp, Theta0 underflow (large DVT1),
// Weff < 2e-8 (DWG), and VADIBL/VASCBE disabled (PDIBLC1=PDIBLC2=PSCBE2=0).
const CORNER2_NMOS = [
  '.model MOD NMOS LEVEL=49 TOX=4n VTH0=0.4 K1=0.5 A0=-8 RDSW=200 PRWB=-3 DVT1=60 DWG=4.5e-7',
  '+ PDIBLC1=0 PDIBLC2=0 PSCBE2=0 U0=350',
].join('\n');

export const BSIM3_DC_CASES: readonly Bsim3DcCase[] = [
  { name: 'issue-589-nmos', type: 1, model: ISSUE_NMOS, instance: 'W=0.5u L=0.18u', source: 'issue #589 deck' },
  { name: 'issue-582-pmos', type: -1, model: ISSUE_PMOS, instance: 'W=1u L=0.18u', source: 'benchmarks/bsim3-reverse (#582) PMOS card' },
  { name: 'validation-nmos', type: 1, model: VALIDATION_NMOS, instance: 'W=10u L=0.18u', source: 'benchmarks/circuits/bsim3-validation.ts NMOS card' },
  { name: 'defaults-nmos', type: 1, model: '.model MOD nmos level=49 version=3.3.0', instance: 'W=3u L=0.35u pd=9u ad=9p ps=9u as=9p', source: 'corpus-f examples/mos/adder_mos.cir n1 (all defaults)' },
  { name: 'defaults-pmos', type: -1, model: '.model MOD pmos level=49 version=3.3.0', instance: 'W=7.5u L=0.35u pd=13.5u ad=22.5p ps=13.5u as=22.5p', source: 'corpus-f examples/mos/adder_mos.cir p1 (all defaults)' },
  { name: 'defaults-nmos-no-wl', type: 1, model: '.model MOD nmos level=49', instance: '', source: 'b3set.c default W=L=5u' },
  { name: 'bsim330-nmos', type: 1, model: corpusCard('examples/mos/nmos_out_BSIM330_plainwrite.sp', 'n1'), instance: 'W=1u L=0.35u Pd=1.5u Ps=1.5u ad=1.5p as=1.5p', source: 'corpus-f examples/mos/nmos_out_BSIM330_plainwrite.sp n1' },
  { name: 'bsim330-pmos', type: -1, model: corpusCard('examples/mos/nmos_out_BSIM330_plainwrite.sp', 'p1'), instance: 'W=1u L=0.35u Pd=1.5u Ps=1.5u ad=1.5p as=1.5p', source: 'corpus-f examples/mos/nmos_out_BSIM330_plainwrite.sp p1' },
  { name: 'mc-ring-nmos', type: 1, model: corpusCard('examples/Monte_Carlo/MC_ring.sp', 'n1'), instance: 'w=2u l=0.35u as=3p ad=3p ps=4u pd=4u', source: 'corpus-f examples/Monte_Carlo/MC_ring.sp n1' },
  { name: 'mc-ring-pmos', type: -1, model: corpusCard('examples/Monte_Carlo/MC_ring.sp', 'p1'), instance: 'w=4u l=0.35u as=7p ad=7p ps=6u pd=6u', source: 'corpus-f examples/Monte_Carlo/MC_ring.sp p1' },
  { name: 'stress-nmos', type: 1, model: STRESS_NMOS, instance: 'W=0.8u L=0.15u', source: 'project-authored stress card' },
  { name: 'stress-pmos', type: -1, model: STRESS_PMOS, instance: 'W=2u L=0.25u AD=1p AS=1p PD=4u PS=4u', source: 'project-authored stress card' },
  { name: 'gamma1-nmos', type: 1, model: GAMMA_NMOS, instance: 'W=1u L=0.5u DELVTO=0.02', source: 'project-authored gamma1 card' },
  { name: 'corner-nmos', type: 1, model: CORNER_NMOS, instance: 'W=1u L=0.18u M=2', source: 'project-authored corner card' },
  { name: 'corner2-nmos', type: 1, model: CORNER2_NMOS, instance: 'W=1u L=0.3u', source: 'project-authored corner card' },
  { name: 'corner-pmos', type: -1, model: CORNER_PMOS, instance: 'W=2u L=0.5u AD=2p AS=2p', source: 'project-authored corner card' },
];

/** NMOS-convention bias grid (V); PMOS cases apply type * value physically. */
export const VGS_GRID = [0, 0.3, 0.5, 0.7, 1.0, 1.4, 1.8];
export const VDS_GRID = [-0.6, 0.05, 0.3, 0.9, 1.8];
export const VBS_GRID = [0, -0.9];

/** The operating-point deck: D, G and B driven against a grounded source. */
export function operatingPointDeck(c: Bsim3DcCase): string {
  return [
    `bsim3 dc parity ${c.name}`,
    c.model,
    'VD d 0 DC 0',
    'VG g 0 DC 0',
    'VB b 0 DC 0',
    `M1 d g 0 b MOD ${c.instance}`.trimEnd(),
    '.end',
  ].join('\n');
}

/** Id-Vds sweep deck (Vgs = type * 1.2, Vbs = 0) for terminal-current parity. */
export function sweepDeck(c: Bsim3DcCase): string {
  return [
    `bsim3 dc sweep ${c.name}`,
    c.model,
    'VD d 0 DC 0',
    `VG g 0 DC ${c.type * 1.2}`,
    `M1 d g 0 0 MOD ${c.instance}`.trimEnd(),
    `.dc VD ${c.type > 0 ? '-0.6 1.8 0.1' : '-1.8 0.6 0.1'}`,
    '.end',
  ].join('\n');
}
