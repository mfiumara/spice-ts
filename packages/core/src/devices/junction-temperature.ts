import { UnsupportedTemperatureError } from '../errors.js';

/**
 * ngspice-47 temperature-update helpers shared by the diode (diotemp.c), the
 * Gummel-Poon BJT (bjttemp.c) and MOS level 1 (mos1temp.c). Temperatures are
 * in kelvin unless a name says otherwise.
 */

// ngspice-47 const.h.
export const CHARGE = 1.6021766208e-19;
export const CONSTBOLTZ = 1.38064852e-23;
export const CONSTKOVERQ = CONSTBOLTZ / CHARGE;
export const CONSTCTOK = 273.15;
/** ngspice REFTEMP: 27 C, the default circuit and nominal temperature. */
export const REFTEMP = 300.15;
export const NOMINAL_TEMPERATURE_C = 27;

/** Silicon band gap EG(T) in eV, the 1.16 - 7.02e-4*T^2/(T+1108) law of the *temp.c files. */
export function siliconBandGap(kelvin: number): number {
  return 1.16 - (7.02e-4 * kelvin * kelvin) / (kelvin + 1108);
}

/**
 * The pbfact term of the junction-potential temperature law:
 * -2*vt*(1.5*ln(T/REFTEMP) + q*(-EG(T)/(2kT) + 1.1150877/(2k*REFTEMP))).
 */
export function junctionPotentialFactor(kelvin: number): number {
  const vt = CONSTKOVERQ * kelvin;
  const arg = -siliconBandGap(kelvin) / (2 * CONSTBOLTZ * kelvin)
    + 1.1150877 / (CONSTBOLTZ * (REFTEMP + REFTEMP));
  return -2 * vt * (1.5 * Math.log(kelvin / REFTEMP) + CHARGE * arg);
}

/**
 * Temperature-adjusted junction potential and zero-bias depletion capacitance
 * (TLEVC = 0), as diotemp.c, bjttemp.c and mos1temp.c compute them: the
 * potential is mapped through REFTEMP (pbo) and the capacitance follows
 * 1 + M*(4e-4*(T - REFTEMP) - (PB(T) - pbo)/pbo).
 *
 * `potential` is the model's junction potential at `nominal`; mos1temp.c
 * scales its sidewall capacitance with the bottom PB, so the potential and the
 * grading coefficient are passed separately.
 */
export function temperatureJunction(
  potential: number,
  capacitance: number,
  grading: number,
  kelvin: number,
  nominalKelvin: number,
): { potential: number; capacitance: number } {
  const fact1 = nominalKelvin / REFTEMP;
  const fact2 = kelvin / REFTEMP;
  const pbo = (potential - junctionPotentialFactor(nominalKelvin)) / fact1;
  const gmaold = (potential - pbo) / pbo;
  const tPotential = junctionPotentialFactor(kelvin) + fact2 * pbo;
  const gmanew = (tPotential - pbo) / pbo;
  const tCapacitance = capacitance
    / (1 + grading * (4e-4 * (nominalKelvin - REFTEMP) - gmaold))
    * (1 + grading * (4e-4 * (kelvin - REFTEMP) - gmanew));
  return { potential: tPotential, capacitance: tCapacitance };
}

/**
 * Supplied model fields whose ngspice temperature law spice-ts does not
 * implement. Away from TNOM they would change the result, so they are
 * rejected instead of silently ignored (#374).
 */
export function assertNoUnsupportedTemperatureParameters(
  device: string,
  supplied: Readonly<Record<string, number | undefined>>,
  unsupported: readonly string[],
  temperatureC: number,
  nominalC: number,
): void {
  if (temperatureC === nominalC) return;
  const field = unsupported.find(name => (supplied[name] ?? 0) !== 0);
  if (field !== undefined) throw new UnsupportedTemperatureError(device, temperatureC, field);
}
