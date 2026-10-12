/**
 * Identical-netlist BSIM3v3.3.0 (LEVEL=8/49) charge cases for issue #626.
 *
 * The #589 DC cases (benchmarks/bsim3-dc-589/cards.ts, capMod 3 and XPART 0
 * by default) are reused unchanged. Project-authored variants add every
 * b3ld.c charge branch the defaults leave dormant: capMod 0, 1 and 2, the
 * 0/100 and 50/50 partitions and XPART < 0 (no intrinsic charge), the
 * bias-dependent overlap (CGDL/CGSL/CKAPPA), the gate-edge sidewall junction
 * (CJSWG/MJSWG/PBSWG, perimeter below and above Weff), MJ = 0.5, and the
 * junction-capacitance temperature laws (TCJ*, TPB*, TNOM != TEMP).
 */
import { BSIM3_DC_CASES } from '../bsim3-dc-589/cards.js';

export interface Bsim3ChargeCase {
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

const NMOS = '.model MOD NMOS LEVEL=49 VTH0=0.5 K1=0.6 U0=400 TOX=4n VSAT=1.5e5 '
  + 'CGSO=2.5e-10 CGDO=2.5e-10 CGBO=1e-10 CJ=1e-3 CJSW=5e-10 MJ=0.45 PB=0.9';
const PMOS = '.model MOD PMOS LEVEL=49 VTH0=-0.5 K1=0.6 U0=150 TOX=4n VSAT=1.2e5 '
  + 'CGSO=2.5e-10 CGDO=2.5e-10 CGBO=1e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1';
const JUNCTIONS = 'W=1u L=0.18u AD=1p AS=0.8p PD=4u PS=0.6u';

function variant(name: string, type: 1 | -1, extra: string, instance = JUNCTIONS): Bsim3ChargeCase {
  return { name, type, model: `${type > 0 ? NMOS : PMOS} ${extra}`, instance, source: 'project-authored #626 charge card' };
}

export const BSIM3_CHARGE_CASES: readonly Bsim3ChargeCase[] = [
  ...BSIM3_DC_CASES,
  variant('capmod0-xpart0-nmos', 1, 'CAPMOD=0 XPART=0 VFBCV=-0.8'),
  variant('capmod0-xpart05-pmos', -1, 'CAPMOD=0 XPART=0.5'),
  variant('capmod0-xpart1-nmos', 1, 'CAPMOD=0 XPART=1'),
  variant('capmod1-xpart0-nmos', 1, 'CAPMOD=1 XPART=0 NOFF=1.3 VOFFCV=-0.02'),
  variant('capmod1-xpart1-pmos', -1, 'CAPMOD=1 XPART=1'),
  variant('capmod1-xpart05-nmos', 1, 'CAPMOD=1 XPART=0.5 CGDL=3e-10 CGSL=2e-10 CKAPPA=0.8'),
  variant('capmod2-xpart0-pmos', -1, 'CAPMOD=2 XPART=0 CGDL=2e-10 CGSL=3e-10'),
  variant('capmod2-xpart1-nmos', 1, 'CAPMOD=2 XPART=1'),
  variant('capmod2-xpart05-nmos', 1, 'CAPMOD=2 XPART=0.5 NOFF=0.8'),
  variant('capmod3-xpart1-nmos', 1, 'CAPMOD=3 XPART=1 ACDE=0.6 MOIN=12'),
  variant('capmod3-xpart05-pmos', -1, 'CAPMOD=3 XPART=0.5 CGDL=3e-10 CGSL=3e-10 CKAPPA=0.5'),
  variant('capmod3-xpartneg-nmos', 1, 'XPART=-1'),
  variant('capmod3-dlc-nmos', 1, 'DLC=2e-8 DWC=1e-8 LLC=1e-15 CLC=0.2e-6 CLE=0.5 VOFFCV=0.03'),
  variant('junction-temp-nmos', 1, 'TNOM=50 TCJ=1e-3 TCJSW=8e-4 TCJSWG=6e-4 TPB=1e-3 TPBSW=2e-3 TPBSWG=1e-3 '
    + 'CJSWG=3e-10 MJSWG=0.4 PBSWG=0.8 MJSW=0.3 PBSW=0.7'),
  variant('junction-swg-pmos', -1, 'CJSWG=4e-10 MJSWG=0.5 PBSWG=0.9', 'W=2u L=0.25u AD=2p AS=1p PD=1.5u PS=6u M=2'),
];

/** NMOS-convention bias grid (V) for the device charges; PMOS cases apply type * value physically. */
const VGS = [-0.6, 0.3, 0.6, 1.0, 1.8];
const VDS = [-0.6, -0.05, 0, 0.05, 0.4, 1.8];
const VBS = [0.3, 0, -0.9];
export const CHARGE_GRID = VBS.flatMap(vbs => VGS.flatMap(vgs => VDS.map(vds => ({ vgs, vds, vbs }))));

/** Sparser grid for the AC terminal capacitance matrices. */
export const AC_GRID = [0, -0.9].flatMap(vbs => [-0.6, 0.3, 1.0, 1.8].flatMap(vgs => [-0.6, 0.05, 0.9].map(vds => ({ vgs, vds, vbs }))));
/**
 * The quasi-static BSIM3 capacitance matrix does not depend on frequency. A
 * high frequency keeps the imaginary terminal currents well above the
 * solvers' rounding of the real (conductance) currents, which at forward-biased
 * junctions are ~1e9 times larger at 1 MHz.
 */
export const AC_FREQUENCY = 1e9;

/** The bias deck: D, G and B driven against a grounded source, every source AC-capable. */
export function chargeDeck(c: Bsim3ChargeCase): string {
  return [
    `bsim3 charge parity ${c.name}`,
    c.model,
    'VD d 0 DC 0 AC 0',
    'VG g 0 DC 0 AC 0',
    'VB b 0 DC 0 AC 0',
    `M1 d g 0 b MOD ${c.instance}`.trimEnd(),
    '.end',
  ].join('\n');
}

/**
 * Transient regression deck: the all-default BSIM3v3.3.0 NAND of corpus-f
 * examples/snapshot/adder_mos_circ.cir (same subcircuit and model cards), X1
 * driven by that deck's first two input pulses and loaded by X2 (inputs tied,
 * an inverter). TMAX = 10 ps so both engines resolve every edge.
 */
export const NAND_DECK = [
  'bsim3 nand transient (#626)',
  '.SUBCKT NAND in1 in2 out VDD',
  'M1 out in2 Vdd Vdd p1 W=3u L=1u',
  'M2 net.1 in2 0 0 n1 W=3u L=2u',
  'M3 out in1 Vdd Vdd p1 W=3u L=1u',
  'M4 out in1 net.1 0 n1 W=3u L=2u',
  '.ENDS NAND',
  'VCC 99 0 DC 3.3V',
  'VIN1A 1 0 PULSE(0 3 0 10NS 10NS 10NS 50NS)',
  'VIN1B 2 0 PULSE(0 3 0 10NS 10NS 20NS 100NS)',
  'X1 1 2 9 99 NAND',
  'X2 9 9 10 99 NAND',
  '.TRAN 0.01NS 100NS 0 0.01NS',
  '.model n1 nmos level=8 version=3.3.0',
  '.model p1 pmos level=8 version=3.3.0',
  '.END',
].join('\n');

/** Sample times between the PULSE corners (all corners are multiples of 10 ns). */
export const NAND_SAMPLE_TIMES = Array.from({ length: 200 }, (_, k) => Number(((k + 0.5) * 0.5e-9).toPrecision(12)));

/** Width of the supply-charge window around each NAND sample (s). */
export const NAND_WINDOW = 0.5e-9;

/** Trapezoidal integral of `values(time)` over [center - NAND_WINDOW/2, center + NAND_WINDOW/2]. */
export function windowCharge(time: readonly number[], values: readonly number[], center: number): number {
  const lo = center - NAND_WINDOW / 2;
  const hi = center + NAND_WINDOW / 2;
  const at = (t: number): number => {
    const j = time.findIndex(x => x >= t);
    if (j <= 0) return values[Math.max(j, 0)];
    return values[j - 1] + (values[j] - values[j - 1]) * (t - time[j - 1]) / (time[j] - time[j - 1]);
  };
  const points: [number, number][] = [[lo, at(lo)]];
  for (let k = 0; k < time.length; k++) if (time[k] > lo && time[k] < hi) points.push([time[k], values[k]]);
  points.push([hi, at(hi)]);
  let charge = 0;
  for (let k = 1; k < points.length; k++) charge += 0.5 * (points[k][1] + points[k - 1][1]) * (points[k][0] - points[k - 1][0]);
  return charge;
}
