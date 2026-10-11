/**
 * VBIC temperature mapping, a port of ngspice-47 `vbic_4T_et_cf_t`
 * (src/spicelib/devices/vbic/vbictemp.c) restricted to the bounded VBIC subset.
 *
 * Parameters outside that subset are held at their ngspice vbicsetup.c
 * defaults: EA = EAIE = EAIC = EAIS = EANE = EANC = EAP = 1.12 eV,
 * XIS = XII = XIN = 3, NF = NR = NEI = NCI = NFP = 1, NEN = NCN = 2,
 * PE = PC = PS = 0.75, ME = MC = MS = 0.33, and every other temperature
 * exponent (XRCI, XRBI, XRBP, XIKF, XVO, TNF, TAVC, XISR, DEAR) at 0, which
 * leaves RCI, RBI, RBP, IKF, VO, AVC2, NF and ISRR temperature independent.
 */

/** ngspice CONSTCtoK and the Boltzmann/charge constants used by vbictemp.c. */
const CELSIUS_TO_KELVIN = 2.7315e2;
const BOLTZMANN = 1.380662e-23;
const CHARGE = 1.602189e-19;

const EA = 1.12;
const EAIE = 1.12;
const EAIC = 1.12;
const EAIS = 1.12;
const EANE = 1.12;
const EANC = 1.12;
const EAP = 1.12;
const XIS = 3;
const XII = 3;
const XIN = 3;
const NEN = 2;
const NCN = 2;

/** Junction built-in potentials and grading coefficients (ngspice defaults). */
export const VBIC_PE = 0.75;
export const VBIC_ME = 0.33;
export const VBIC_PC = 0.75;
export const VBIC_MC = 0.33;
export const VBIC_PS = 0.75;
export const VBIC_MS = 0.33;

export interface VBICTemperatureInput {
  TNOM: number;
  IS: number;
  IBEI: number;
  IBEN: number;
  IBCI: number;
  IBCN: number;
  ISP: number;
  GAMM: number;
  CJE: number;
  CJC: number;
  CJEP: number;
  CJCP: number;
}

/** Temperature-resolved values that differ from the nominal model card. */
export interface VBICTemperatureState {
  /** Thermal voltage kT/q at the device temperature. */
  vt: number;
  IS: number;
  IBEI: number;
  IBEN: number;
  IBCI: number;
  IBCN: number;
  ISP: number;
  GAMM: number;
  CJE: number;
  CJC: number;
  CJEP: number;
  CJCP: number;
  /** Base-emitter, base-collector and substrate built-in potentials. */
  PE: number;
  PC: number;
  PS: number;
}

/** Thermal voltage kT/q of a device at `temperature` degrees Celsius. */
export function vbicThermalVoltage(temperature: number): number {
  return BOLTZMANN * (CELSIUS_TO_KELVIN + temperature) / CHARGE;
}

/** Map the bounded VBIC parameters from TNOM to `temperature` (degrees Celsius). */
export function resolveVBICTemperature(
  params: VBICTemperatureInput,
  temperature: number,
): VBICTemperatureState {
  const tini = CELSIUS_TO_KELVIN + params.TNOM;
  const tdev = CELSIUS_TO_KELVIN + temperature;
  const vtv = BOLTZMANN * tdev / CHARGE;
  const rT = tdev / tini;

  // ngspice: I(T) = I * (rT^XI * exp(-EA * (1 - rT) / Vtv))^(1 / N).
  const saturation = (current: number, exponent: number, activation: number, emission: number): number =>
    current * Math.pow(Math.pow(rT, exponent) * Math.exp(-activation * (1 - rT) / vtv), 1 / emission);
  // ngspice built-in potential mapping with a smooth lower limit.
  const potential = (nominal: number, activation: number): number => {
    const psiio = 2 * (vtv / rT) * Math.log(
      Math.exp(0.5 * nominal * rT / vtv) - Math.exp(-0.5 * nominal * rT / vtv),
    );
    const psiin = psiio * rT - 3 * vtv * Math.log(rT) - activation * (rT - 1);
    return psiin + 2 * vtv * Math.log(0.5 * (1 + Math.sqrt(1 + 4 * Math.exp(-psiin / vtv))));
  };

  const PE = potential(VBIC_PE, EAIE);
  const PC = potential(VBIC_PC, EAIC);
  const PS = potential(VBIC_PS, EAIS);
  return {
    vt: vtv,
    IS: saturation(params.IS, XIS, EA, 1),
    IBEI: saturation(params.IBEI, XII, EAIE, 1),
    IBEN: saturation(params.IBEN, XIN, EANE, NEN),
    IBCI: saturation(params.IBCI, XII, EAIC, 1),
    IBCN: saturation(params.IBCN, XIN, EANC, NCN),
    ISP: saturation(params.ISP, XIS, EAP, 1),
    GAMM: params.GAMM * Math.pow(rT, XIS) * Math.exp(-EA * (1 - rT) / vtv),
    CJE: params.CJE * Math.pow(VBIC_PE / PE, VBIC_ME),
    CJC: params.CJC * Math.pow(VBIC_PC / PC, VBIC_MC),
    CJEP: params.CJEP * Math.pow(VBIC_PC / PC, VBIC_MC),
    CJCP: params.CJCP * Math.pow(VBIC_PS / PS, VBIC_MS),
    PE,
    PC,
    PS,
  };
}
