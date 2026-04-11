/**
 * BSIM3v3 model validation circuit generators.
 *
 * Each generator returns a SPICE netlist string (or string[]) compatible with
 * both spice-ts and ngspice. All circuits use LEVEL=49 (BSIM3v3) model cards
 * and are designed to exercise specific aspects of the model.
 */

// ---------------------------------------------------------------------------
// Default model cards
// ---------------------------------------------------------------------------

const NMOS_MODEL = `NMOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 K2=-0.1 U0=400 TOX=4n VSAT=1.5e5 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)`;
const PMOS_MODEL = `PMOD PMOS (LEVEL=49 VTH0=-0.5 K1=0.6 K2=-0.1 U0=150 TOX=4n VSAT=1.2e5 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)`;

// ---------------------------------------------------------------------------
// Shared option types
// ---------------------------------------------------------------------------

export interface NmosOpts {
  nmosModel?: string;
}

export interface PmosOpts {
  pmosModel?: string;
}

// ---------------------------------------------------------------------------
// 1. Id-Vgs NMOS — transfer characteristic in saturation
// ---------------------------------------------------------------------------
/**
 * Single NMOS transistor with Vds=1V (saturation).
 * Vgs swept 0 → 1.8 V in 10 mV steps.
 * Measures drain current vs. gate voltage (threshold, transconductance).
 */
export function idVgsNmos(opts?: NmosOpts): string {
  const model = opts?.nmosModel ?? NMOS_MODEL;
  return [
    `* BSIM3v3 NMOS Id-Vgs — saturation (Vds=1V)`,
    `.model ${model}`,
    `VGS gate 0 DC 0`,
    `VDS drain 0 DC 1`,
    `M1 drain gate 0 0 NMOD W=10u L=0.18u`,
    `.dc VGS 0 1.8 0.01`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 2. Id-Vds NMOS — output characteristics (one netlist per Vgs)
// ---------------------------------------------------------------------------
/**
 * Single NMOS transistor with Vds swept 0 → 1.8 V.
 * Returns one netlist per Vgs bias point.
 * Default Vgs values: [0.6, 0.9, 1.2, 1.5, 1.8] V.
 */
export function idVdsNmos(
  vgsValues?: number[],
  opts?: NmosOpts,
): string[] {
  const biases = vgsValues ?? [0.6, 0.9, 1.2, 1.5, 1.8];
  const model = opts?.nmosModel ?? NMOS_MODEL;
  return biases.map((vgs) =>
    [
      `* BSIM3v3 NMOS Id-Vds — Vgs=${vgs}V`,
      `.model ${model}`,
      `VGS gate 0 DC ${vgs}`,
      `VDS drain 0 DC 0`,
      `M1 drain gate 0 0 NMOD W=10u L=0.18u`,
      `.dc VDS 0 1.8 0.01`,
      `.end`,
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// 3. Id-Vgs PMOS — transfer characteristic in saturation
// ---------------------------------------------------------------------------
/**
 * Single PMOS transistor with Vsd=1V (saturation, source at VDD).
 * Vgs swept -1.8 → 0 V in 10 mV steps (gate voltage relative to source).
 * Measures drain current vs. gate voltage for PMOS.
 */
export function idVgsPmos(opts?: PmosOpts): string {
  const model = opts?.pmosModel ?? PMOS_MODEL;
  return [
    `* BSIM3v3 PMOS Id-Vgs — saturation (Vsd=1V)`,
    `.model ${model}`,
    `VDD vdd 0 DC 1.8`,
    `VGS gate vdd DC 0`,
    `VSD vdd drain DC 1`,
    `M1 drain gate vdd vdd PMOD W=20u L=0.18u`,
    `.dc VGS -1.8 0 0.01`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 4. Body effect — threshold shift vs. Vbs
// ---------------------------------------------------------------------------
/**
 * Single NMOS with fixed Vgs=1V, Vds=1V, Vbs swept -2 → 0 V.
 * Validates BSIM3 body-effect parameters (K1, K2).
 */
export function bodyEffect(opts?: NmosOpts): string {
  const model = opts?.nmosModel ?? NMOS_MODEL;
  return [
    `* BSIM3v3 NMOS body effect — Vgs=1V, Vds=1V, Vbs swept`,
    `.model ${model}`,
    `VGS gate 0 DC 1`,
    `VDS drain 0 DC 1`,
    `VBS bulk 0 DC 0`,
    `M1 drain gate 0 bulk NMOD W=10u L=0.18u`,
    `.dc VBS -2 0 0.1`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 5. Subthreshold swing — fine Vgs sweep near threshold
// ---------------------------------------------------------------------------
/**
 * Single NMOS with Vds=1V, Vgs swept 0 → 0.8 V in 5 mV steps.
 * Fine sweep to extract subthreshold slope (S = dVgs/d(log10 Id)).
 * Validates BSIM3 subthreshold parameters (N0, NB, ND).
 */
export function subthresholdSwing(opts?: NmosOpts): string {
  const model = opts?.nmosModel ?? NMOS_MODEL;
  return [
    `* BSIM3v3 NMOS subthreshold swing — fine Vgs sweep`,
    `.model ${model}`,
    `VGS gate 0 DC 0`,
    `VDS drain 0 DC 1`,
    `M1 drain gate 0 0 NMOD W=10u L=0.18u`,
    `.dc VGS 0 0.8 0.005`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 6. Cgg vs. Vgs — gate capacitance extraction via AC analysis
// ---------------------------------------------------------------------------
/**
 * Single NMOS biased in inversion, AC analysis at 1 MHz.
 * Vgs swept 0 → 1.8 V (DC bias); AC small-signal at each point.
 * Gate capacitance Cgg = Im(Y11) / (2π * f).
 * Validates BSIM3 capacitance model (CGSO, CGDO, TOX).
 */
export function cggVsVgs(opts?: NmosOpts): string {
  const model = opts?.nmosModel ?? NMOS_MODEL;
  return [
    `* BSIM3v3 NMOS Cgg vs Vgs — AC capacitance extraction`,
    `.model ${model}`,
    `VGS gate 0 DC 0.9 AC 1`,
    `VDS drain 0 DC 1`,
    `M1 drain gate 0 0 NMOD W=10u L=0.18u`,
    `.ac lin 1 1MEG 1MEG`,
    `.end`,
  ].join('\n');
}
