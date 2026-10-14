/* ******************************************************************************
   *  BSIM4 4.8.3 released on 05/19/2025                                        *
   *  BSIM4 Model Equations                                                     *
   ******************************************************************************

   ******************************************************************************
   *  Copyright (c) 2025 University of California                               *
   *                                                                            *
   *  Project Directors: Prof. Sayeef Salahuddin and Prof. Chenming Hu          *
   *  Developers list: https://www.bsim.berkeley.edu/models/bsim4/auth_bsim4/   *
   ******************************************************************************/

/*
Licensed under Educational Community License, Version 2.0 (the "License"); you may
not use this file except in compliance with the License. You may obtain a copy of the license at
http://opensource.org/licenses/ECL-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations
under the License.

BSIM4 model is supported by the members of Silicon Integration Initiative's Compact Model Coalition. A link to the most recent version of this
standard can be found at: http://www.si2.org/cmc
*/

/** Modified/ported to TypeScript by spice-ts.
 * Standalone DIOMOD=1 junction subset, NOT a registered BSIM4 transistor.
 * ngspice-47 a80f6e3e95d51534905b1f23410a951802666656:
 * b4set.c:94-100,614-617,2038-2049,2074-2081;
 * b4temp.c:52-64,200-276,376-381,2107-2129;
 * b4ld.c:700-747,802-848. Full licence in bsim4/LICENSE-ECL-2.0.
 */
import { InvalidCircuitError, UnsupportedModelParameterError } from '../errors.js';

/** Effective geometry from the future b4temp geometry port, not raw AD/AS/PD/PS.
 * gateEdge is weffCJ * nf in metres. Both area and perimeter zero disable
 * the entire junction, including its gate-edge contribution, as in b4ld.c.
 */
export interface Bsim4JunctionInput {
  readonly terminal: 'source' | 'drain';
  readonly geometry: { readonly area: number; readonly perimeter: number; readonly gateEdge: number };
  /** Only the junction card subset listed below. Never pass an entire MOS card. */
  readonly parameters?: Readonly<Record<string, number>>;
  readonly temperatureC?: number;
  readonly version?: string;
  /** Only DC/OP. All dynamic requests fail closed. */
  readonly analysis?: string;
}

export interface Bsim4Junction {
  readonly saturationCurrent: number;
  readonly nvtm: number;
  readonly forwardVoltage: number;
  readonly forwardExponentialCurrent: number;
}

export interface Bsim4JunctionResult {
  /** Normalized bulk-to-source/drain current; caller applies MOS polarity. */
  readonly current: number;
  /** d(current)/d(normalized junction voltage), including gmin. */
  readonly conductance: number;
}

const KBOQ = 8.617087e-5;
const MIN_EXP = 1.713908431e-15;
const EXP_THRESHOLD = 34;
const PARAMETERS = new Set([
  'diomod', 'tnom', 'jss', 'jsd', 'jsws', 'jswd', 'jswgs', 'jswgd',
  'njs', 'njd', 'xtis', 'xtid', 'ijthsfwd', 'ijthdfwd',
]);

function unsupported(parameter: string, reason: string): never {
  throw new UnsupportedModelParameterError('', parameter, reason, { model: 'BSIM4 junction subset' });
}

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new InvalidCircuitError(`BSIM4 junction ${name} must be finite`);
  return value;
}

function positive(name: string, value: number): number {
  finite(name, value);
  if (value <= 0) throw new InvalidCircuitError(`BSIM4 junction ${name} must be positive`);
  return value;
}

/** Resolve junction defaults and silicon temperature law. This is not full
 * model setup: channel/size/stress, trap-assisted leakage and DIOMOD=0/2
 * have not been ported. Their parameters are rejected, even if zero.
 */
export function setupBsim4Junction(input: Bsim4JunctionInput): Bsim4Junction {
  if (input.terminal !== 'source' && input.terminal !== 'drain') {
    throw new InvalidCircuitError('BSIM4 junction terminal must be source or drain');
  }
  if (input.analysis !== undefined && input.analysis !== 'dc' && input.analysis !== 'op') {
    unsupported('analysis', `${input.analysis} requires an unported charge/noise model`);
  }
  // inpdomod.c family selection, not b4set.c's minor-version label.
  const version = input.version?.toLowerCase();
  if (version !== undefined && !version.startsWith('4.8') && !version.includes('default')) {
    unsupported('version', `VERSION=${input.version} does not select the pinned bsim4/ family`);
  }
  const p: Record<string, number> = {};
  for (const [key, value] of Object.entries(input.parameters ?? {})) {
    const name = key.toLowerCase();
    if (!PARAMETERS.has(name)) unsupported(key, 'parameter is outside the standalone DC junction subset');
    if (Object.hasOwn(p, name)) throw new InvalidCircuitError(`Duplicate BSIM4 junction parameter ${name}`);
    p[name] = finite(name, value);
  }
  if ((p.diomod ?? 1) !== 1) unsupported('diomod', 'only the default DIOMOD=1 law is ported');
  const { area, perimeter, gateEdge } = input.geometry;
  for (const [name, value] of Object.entries({ area, perimeter, gateEdge })) {
    finite(name, value);
    if (value < 0) throw new InvalidCircuitError(`BSIM4 effective junction ${name} must be nonnegative`);
  }
  const tnom = positive('TNOM kelvin', (p.tnom ?? 27) + 273.15);
  const temp = positive('TEMP kelvin', (input.temperatureC ?? 27) + 273.15);
  const drain = input.terminal === 'drain';
  const emission = positive('emission coefficient', drain ? (p.njd ?? p.njs ?? 1) : (p.njs ?? 1));
  // Validate both sides rather than accept an invalid unused source/drain override.
  if (p.njs !== undefined) positive('NJS', p.njs);
  if (p.njd !== undefined) positive('NJD', p.njd);
  const exponent = drain ? (p.xtid ?? p.xtis ?? 3) : (p.xtis ?? 3);
  const bottom = drain ? (p.jsd ?? p.jss ?? 1e-4) : (p.jss ?? 1e-4);
  const sidewall = drain ? (p.jswd ?? p.jsws ?? 0) : (p.jsws ?? 0);
  const gateSidewall = drain ? (p.jswgd ?? p.jswgs ?? 0) : (p.jswgs ?? 0);
  const forwardLimit = Math.max(0, drain ? (p.ijthdfwd ?? p.ijthsfwd ?? 0.1) : (p.ijthsfwd ?? 0.1));
  const nvtm = positive('Nvtm', KBOQ * temp * emission);
  let scale = 1;
  if (temp !== tnom) {
    const eg0 = 1.16 - 7.02e-4 * tnom * tnom / (tnom + 1108);
    const eg = 1.16 - 7.02e-4 * temp * temp / (temp + 1108);
    scale = finite('temperature scale', Math.exp((eg0 / (KBOQ * tnom) - eg / (KBOQ * temp)
      + exponent * Math.log(temp / tnom)) / emission));
  }
  const density = (value: number) => Math.max(0, finite('temperature-adjusted density', value * scale));
  const saturationCurrent = (area <= 0 && perimeter <= 0) ? 0
    : finite('saturation current', area * density(bottom) + perimeter * density(sidewall) + gateEdge * density(gateSidewall));
  if (saturationCurrent <= 0) {
    return Object.freeze({ saturationCurrent: 0, nvtm, forwardVoltage: 0, forwardExponentialCurrent: 0 });
  }
  // b4temp.c BSIM4DioIjthVjmEval with XExpBV=0, followed by IVjsmFwd.
  const tb = 1 + forwardLimit / saturationCurrent;
  const forwardVoltage = finite('forward voltage', nvtm * Math.log(0.5 * (tb + Math.sqrt(tb * tb))));
  const forwardExponentialCurrent = finite('forward exponential current', saturationCurrent * Math.exp(forwardVoltage / nvtm));
  return Object.freeze({ saturationCurrent, nvtm, forwardVoltage, forwardExponentialCurrent });
}

/** b4ld.c DIOMOD=1 current and analytic derivative. No charge/capacitance
 * approximations, no standalone-diode substitution, no transistor stamping.
 */
export function evaluateBsim4Junction(model: Bsim4Junction, voltage: number, gmin: number): Bsim4JunctionResult {
  finite('voltage', voltage);
  finite('gmin', gmin);
  if (gmin < 0) throw new InvalidCircuitError('BSIM4 junction gmin must be nonnegative');
  const { saturationCurrent: is, nvtm, forwardVoltage, forwardExponentialCurrent } = model;
  let current: number;
  let conductance: number;
  if (is <= 0) {
    current = gmin * voltage;
    conductance = gmin;
  } else if (voltage / nvtm < -EXP_THRESHOLD) {
    current = is * (MIN_EXP - 1) + gmin * voltage;
    conductance = gmin;
  } else if (voltage <= forwardVoltage) {
    const ev = Math.exp(voltage / nvtm);
    current = is * (ev - 1) + gmin * voltage;
    conductance = is * ev / nvtm + gmin;
  } else {
    const slope = forwardExponentialCurrent / nvtm;
    current = forwardExponentialCurrent - is + slope * (voltage - forwardVoltage) + gmin * voltage;
    conductance = slope + gmin;
  }
  return { current: finite('current', current), conductance: finite('conductance', conductance) };
}
