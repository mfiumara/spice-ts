import type { DeviceModel } from './devices/device.js';
import type {
  AnalysisDirective, DCSweepDimension, PoleZeroAnalysis, SensitivityAnalysis, SourceWaveform, ModelParams, SubcktDefinition, StepAnalysis,
  SimulationOptions, NodeInitialState, RFPort,
} from './types.js';
import type { CircuitIR } from './ir/types.js';
import { buildIR } from './ir/builder.js';
import { Resistor } from './devices/resistor.js';
import { resolveResistor } from './devices/resistor-model.js';
import { VoltageSource } from './devices/voltage-source.js';
import { CurrentSource } from './devices/current-source.js';
import { TransientNoiseContext } from './devices/transient-noise.js';
import { Capacitor } from './devices/capacitor.js';
import { Inductor } from './devices/inductor.js';
import { MutualInductor } from './devices/mutual-inductor.js';
import { Diode, diodeZeroBiasCapacitance } from './devices/diode.js';
import { BJT, hasBiasDependentBaseResistance } from './devices/bjt.js';
import { VBIC, resolveVBICParams, vbicNodeCount } from './devices/vbic.js';
import { MOSFET } from './devices/mosfet.js';
import { MOS2, resolveMOS2Model } from './devices/mos2.js';
import { MOS3, mos3SeriesResistances, resolveMOS3Model } from './devices/mos3.js';
import { MOS6, resolveMOS6Model } from './devices/mos6.js';
import { createBSIM1, resolveBSIM1Model } from './devices/bsim1.js';
import { createBSIM2, resolveBSIM2Model } from './devices/bsim2.js';
import { classicBsimSeriesResistances, resolveClassicBsimInstance } from './devices/bsim12-load.js';
import { VDMOS } from './devices/vdmos.js';
import { isVdmosModelType, resolveVdmosModel } from './devices/vdmos-model.js';
import { JFET, resolveNJFETParams } from './devices/jfet.js';
import { createZDevice, expandZDevice, resolveZModel } from './devices/z-device.js';
import { BehavioralCurrentSource, BehavioralSource, BehavioralVoltageSource } from './devices/behavioral-source.js';
import {
  behavioralControlNodes,
  compileBehavioralExpression,
  formatBehavioralExpression,
  mapBehavioralNodes,
  parseBehavioralSourceCard,
  substituteBehavioralParameters,
  type BehavioralExpression,
  type BehavioralInstanceParams,
  type BehavioralSourceKind,
} from './parser/behavioral-expression.js';
import { BSIM3v3 } from './devices/bsim3v3.js';
import { bsim3SeriesResistances, isSupportedBsim3Version, SUPPORTED_BSIM3_VERSIONS } from './devices/bsim3v3-params.js';
import { VCCS } from './devices/vccs.js';
import { VCVS } from './devices/vcvs.js';
import { CCCS } from './devices/cccs.js';
import { CurrentSwitch, resolveSwitchModel, VoltageSwitch } from './devices/switch.js';
import { CCVS } from './devices/ccvs.js';
import { TransmissionLine } from './devices/transmission-line.js';
import { resolveLtraModel } from './devices/ltra-model.js';
import { LossyTransmissionLine, LtraModelState } from './devices/lossy-transmission-line.js';
import {
  assertXspiceAnalyses,
  bindXspiceSources,
  buildXspiceEventNetwork,
  createXspiceDevice,
  prepareXspiceInstance,
  type PreparedXspiceInstance,
} from './devices/xspice/compile.js';
import type { XspiceInstanceCard, XspiceModelCard } from './parser/xspice-parser.js';
import type { ControlScript } from './parser/control/script.js';
import { DEFAULT_OPTIONS, GROUND_NODE } from './types.js';
import { evaluateExpression } from './parser/expression.js';
import { parseNumber, tokenizeNetlist } from './parser/tokenizer.js';
import { parseModelCard } from './parser/model-parser.js';
import { assertDeviceModelType, normalizeModelType } from './parser/model-type.js';
import {
  extractRFPort, extractSourceMultiplier, hasSourceMultiplier, parseSourceWaveform, parseInstanceParams,
  transientNoiseWaveform, transientRandomWaveform, VOLTAGE_SOURCE_MULTIPLIER_ERROR,
} from './parser/waveform-parser.js';
import { invalidPassiveInstanceLine, parsePassiveElement } from './parser/passive-parser.js';
import { locateSubcircuitCall } from './parser/subcircuit-syntax.js';
import { parseResistorElement } from './parser/resistor-parser.js';
import { parseZInstance } from './parser/z-device-parser.js';
import { parseSwitchInstance } from './parser/switch-parser.js';
import { DEVICE_GMIN } from './devices/device.js';
import { parseBJTInstance, type BJTInstanceParams } from './parser/bjt-parser.js';
import { parseJFETInstance, type JFETInstanceParams } from './parser/jfet-parser.js';
import {
  formatCplModelCard,
  parseCplLines,
  parseTransmissionLineModelCard,
  parseTxlLine,
} from './parser/transmission-line-parser.js';
import { createSwecLine, swecLineBranchNames } from './devices/swec-line-factory.js';
import {
  parseDiodeInstanceParams,
  type DiodeInstanceParams,
} from './parser/diode-parser.js';
import { assertSupportedPoleZero } from './validation/pole-zero.js';
import { assertSupportedSensitivity } from './validation/sensitivity.js';
import {
  resolveCapacitance,
  resolveCapacitorModel,
  resolveInductance,
  resolveInductorModel,
  type ResolvedCapacitorModel,
  type ResolvedInductorModel,
} from './devices/passive-model.js';
import {
  CycleError, InvalidCircuitError, ParseError, UnsupportedModelLevelError, UnsupportedModelVersionError,
  UnsupportedTemperatureError,
} from './errors.js';
import type { ProtocolExecutionGuard } from './protocol/execution-guard.js';
import { CaseFoldedNameSet, CaseInsensitiveMap } from './case-fold.js';

/**
 * MOSFET model levels with a spice-ts implementation: MOS1, MOS2, MOS3, BSIM1 (4), BSIM2 (5), MOS6,
 * BSIM3v3 (8/49) and MOS9.
 */
const SUPPORTED_MOSFET_LEVELS: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 9, 49];
/** ngspice's default circuit temperature (and TNOM) in degrees Celsius. */
const NOMINAL_TEMPERATURE_C = 27;
/** ngspice CONSTCtoK. */
const CELSIUS_TO_KELVIN = 273.15;

/**
 * The compiled representation of a circuit, ready for numerical simulation.
 *
 * Produced by {@link Circuit.compile}. Contains instantiated device models,
 * node/branch mappings, and analysis commands.
 */
export interface CompiledCircuit {
  /** Instantiated device models with resolved node indices */
  devices: DeviceModel[];
  /** Number of non-ground nodes */
  nodeCount: number;
  /** Number of MNA branches (voltage sources, inductors, controlled sources) */
  branchCount: number;
  /** Ordered list of node names (excludes ground) */
  nodeNames: string[];
  /** Map from node name to its matrix index (-1 for ground) */
  nodeIndexMap: Map<string, number>;
  /** Ordered list of branch names */
  branchNames: string[];
  /** Analysis commands to execute */
  analyses: AnalysisDirective[];
  /** Bounded native pole-zero commands, kept outside adapters without `.pz` result support. */
  poleZeroAnalyses: PoleZeroAnalysis[];
  /** Device model parameter cards */
  models: Map<string, ModelParams>;
  /** Subcircuit definitions */
  subcircuits: Map<string, SubcktDefinition>;
  /** Step directives for parametric sweeps */
  steps: StepAnalysis[];
  /** Solver options declared by `.options` cards in the netlist */
  simulationOptions: SimulationOptions;
  /**
   * Node voltages from `.ic`: the t=0 state with transient UIC; otherwise held
   * during the transient operating point and released at t=0 (ngspice).
   */
  initialConditions: NodeInitialState[];
  /** Node-voltage Newton guesses from `.nodeset`. */
  nodeSets: NodeInitialState[];
}

interface DeviceDescriptor {
  type: string;
  name: string;
  nodes: string[];
  value?: number;
  waveform?: Partial<SourceWaveform> & { dc?: number };
  modelName?: string;
  params?: Record<string, number>;
  controlSource?: string;
  /** Volts for capacitors, amps for inductors. */
  ic?: number;
  coupledA?: string;
  coupledB?: string;
  /** B-card `I=`/`V=` expression; node references are already circuit node names. */
  expression?: BehavioralExpression;
  /** B-card source form and ASRC instance parameters. */
  behavioral?: { kind: BehavioralSourceKind; params: BehavioralInstanceParams };
  /** XSPICE A-card; its nodes are known once the model's port table is applied at compile. */
  xspice?: XspiceInstanceCard;
  /** RF port of a V source (`portnum`/`z0`/`pwr`/`freq`). */
  port?: RFPort;
  /** I-source `m` multiplier (ngspice ISRCmValue); absent means 1. */
  multiplier?: number;
}

/** PULSE coefficients in ngspice `@vsrc[pulse]` order. */
const PULSE_FIELDS = ['v1', 'v2', 'delay', 'rise', 'fall', 'width', 'period'] as const;

type SourceDescriptorWaveform = Partial<SourceWaveform> & { dc?: number };

/** DC value of a source waveform as written on its card. */
function sourceDc(waveform: SourceDescriptorWaveform): number {
  return waveform.type === 'dc' ? (waveform as { value: number }).value : waveform.dc ?? 0;
}

/**
 * Apply ngspice `alter` to an independent source, producing the waveform the
 * parser builds for the edited card (`DC x AC y` is an `ac`-typed waveform).
 */
function alterSourceWaveform(
  descriptor: DeviceDescriptor,
  key: string | undefined,
  values: number[],
): string | undefined {
  const waveform: SourceDescriptorWaveform = descriptor.waveform ?? { type: 'dc', value: 0 };
  if (key === 'PULSE') {
    if (waveform.type !== 'pulse' || values.length !== PULSE_FIELDS.length) {
      return `pulse of '${descriptor.name}' can be altered only on a PULSE source with ${PULSE_FIELDS.length} values`;
    }
    const pulse: Record<string, unknown> = { ...waveform };
    PULSE_FIELDS.forEach((field, index) => { pulse[field] = values[index]; });
    descriptor.waveform = pulse as SourceDescriptorWaveform;
    return undefined;
  }
  if (key === 'TRNOISE' || key === 'TRRANDOM') {
    // ngspice-47 vsrcpar.c/isrcpar.c: the new coefficients replace the source
    // function and re-initialise its noise state; DC and AC terms are kept.
    let noise: SourceDescriptorWaveform;
    try {
      noise = key === 'TRNOISE' ? transientNoiseWaveform(values) : transientRandomWaveform(values);
    } catch (error) {
      return (error as Error).message;
    }
    const dc = waveform.type === 'dc' ? waveform.value : waveform.dc;
    const ac = waveform.type === 'ac'
      ? { magnitude: waveform.magnitude ?? 1, phase: waveform.phase ?? 0 }
      : waveform.ac;
    descriptor.waveform = { ...noise, ...(dc !== undefined ? { dc } : {}), ...(ac ? { ac } : {}) };
    return undefined;
  }
  if (values.length !== 1) return `parameter needs one value, got ${values.length}`;
  const [value] = values;
  if (key === undefined || key === 'DC') {
    descriptor.waveform = waveform.type === 'dc'
      ? { ...waveform, value } as SourceDescriptorWaveform
      : { ...waveform, dc: value };
    return undefined;
  }
  if (key === 'AC' || key === 'ACMAG' || key === 'ACPHASE') {
    const field = key === 'ACPHASE' ? 'phase' : 'magnitude';
    if (waveform.type === 'dc') {
      descriptor.waveform = { type: 'ac', dc: sourceDc(waveform), magnitude: 0, phase: 0, [field]: value };
    } else if (waveform.type === 'ac') {
      descriptor.waveform = { ...waveform, [field]: value };
    } else {
      const ac = waveform.ac ?? { magnitude: 0, phase: 0 };
      descriptor.waveform = { ...waveform, ac: { ...ac, [field]: value } };
    }
    return undefined;
  }
  return `parameter '${key.toLowerCase()}' of source '${descriptor.name}' cannot be altered`;
}

/** ngspice `@vsrc[param]` readout of a source input parameter, when spice-ts holds it. */
function sourceParameter(waveform: SourceDescriptorWaveform | undefined, key: string): number[] | undefined {
  const source: SourceDescriptorWaveform = waveform ?? { type: 'dc', value: 0 };
  if (key === 'DC') return [sourceDc(source)];
  if (key === 'PULSE' && source.type === 'pulse') {
    return PULSE_FIELDS.map(field => (source as Record<string, number>)[field]);
  }
  if (key === 'TRNOISE' && source.type === 'trnoise') {
    return [source.amplitude, source.ts, source.alpha, source.oneOverFAmplitude,
      source.rtsAmplitude, source.rtsCaptureTime, source.rtsEmissionTime].map(value => value ?? 0);
  }
  if (key === 'TRRANDOM' && source.type === 'trrandom') {
    return [source.distribution, source.ts, source.td, source.param1 ?? 1, source.param2].map(value => value ?? 0);
  }
  if (key === 'AC' || key === 'ACMAG') {
    return [source.type === 'ac' ? (source as { magnitude: number }).magnitude : source.ac?.magnitude ?? 0];
  }
  return undefined;
}

function behavioralDescriptor(
  name: string,
  nPlus: string,
  nMinus: string,
  kind: BehavioralSourceKind,
  expression: BehavioralExpression,
  params: BehavioralInstanceParams = {},
): DeviceDescriptor {
  const controls = behavioralControlNodes(expression);
  return {
    type: 'B', name, nodes: [nPlus, nMinus, ...controls], expression, behavioral: { kind, params },
  };
}

/**
 * Bind every B-source `i(vsource)` to its source's MNA branch (ngspice
 * PT_CURRENT via CKTfndBranch). As in ngspice, only elements that own a
 * branch current (V, E, H, L and V= B-sources) can be referenced; names
 * match case-insensitively, as ngspice lower-cases the whole deck.
 */
function bindBehavioralControlBranches(
  sources: readonly BehavioralSource[],
  deviceMap: ReadonlyMap<string, DeviceModel>,
): void {
  if (sources.length === 0) return;
  const byLowerName = new Map<string, DeviceModel>();
  for (const [name, device] of deviceMap) {
    if (!byLowerName.has(name.toLowerCase())) byLowerName.set(name.toLowerCase(), device);
  }
  for (const device of sources) {
    device.bindControlBranches(device.expression.sources.map(source => {
      const control = deviceMap.get(source) ?? byLowerName.get(source.toLowerCase());
      if (!control) {
        throw new InvalidCircuitError(
          `B-source '${device.name}' references i(${source}), but '${source}' is not a source in the circuit`,
        );
      }
      const ownsBranch = control instanceof VoltageSource || control instanceof VCVS || control instanceof CCVS
        || control instanceof Inductor || control instanceof BehavioralVoltageSource;
      if (!ownsBranch) {
        throw new InvalidCircuitError(
          `B-source '${device.name}' references i(${source}), but '${source}' has no branch current `
          + '(only V, E, H, L and V= B elements can be referenced)',
        );
      }
      return control.branches[0];
    }));
  }
}

function formatBehavioralSource(desc: DeviceDescriptor): string {
  const { kind, params } = desc.behavioral!;
  const assignment = `${kind === 'voltage' ? 'V' : 'I'}=${formatBehavioralExpression(desc.expression!)}`;
  const instance = Object.entries(params)
    .map(([key, value]) => `${key}=${typeof value === 'boolean' ? Number(value) : formatNumber(value)}`);
  return [desc.name, desc.nodes[0], desc.nodes[1], assignment, ...instance].join(' ');
}

/**
 * The shortest literal that the netlist parser reads back as exactly `value`.
 * Literals are read as ngspice-47 INPevaluate does (#749): an integer
 * mantissa M times pow(10, E) (times 25.4 first for `mil`), which is not
 * always the correctly rounded value, so Number#toString does not always
 * round-trip (0.30000000000000004, the parsed `0.3`, prints back as `0.3`,
 * and `30u` is 2.9999999999999997e-5, which no plain decimal reads back to).
 * For each precision this tries the plain decimal, then the integer-mantissa
 * form `<M>e<E>` (`30e-6`), which is built exactly as the parser builds the
 * value; then the `mil` form (`74mil` is 74 * 25.4 * 1e-6, which no decimal
 * reaches); then mantissas next to the rounded one.
 *
 * @internal Exported for the round-trip tests.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return Object.is(value, -0) ? '-0' : '0';
  for (let digits = 1; digits <= 17; digits++) {
    const text = Number(value.toPrecision(digits)).toString();
    if (readsBackAs(text, value)) return text;
    const integerForm = roundedMantissaForm(value, digits, DECIMAL);
    if (readsBackAs(integerForm, value)) return integerForm;
  }
  for (let digits = 1; digits <= 17; digits++) {
    const milForm = roundedMantissaForm(value, digits, MIL);
    if (readsBackAs(milForm, value)) return milForm;
  }
  return nearestMantissaForm(value, DECIMAL) ?? nearestMantissaForm(value, MIL) ?? value.toString();
}

/** How INPevaluate scales the mantissa for a literal ending in `suffix`. */
interface MantissaUnit { suffix: string; factor: number; exponentOffset: number }
const DECIMAL: MantissaUnit = { suffix: '', factor: 1, exponentOffset: 0 };
const MIL: MantissaUnit = { suffix: 'mil', factor: 25.4, exponentOffset: 6 };

function mantissaLiteral(sign: string, mantissa: string, scale: number, unit: MantissaUnit): string {
  const exponent = scale + unit.exponentOffset;
  return `${sign}${mantissa}${exponent === 0 ? '' : `e${exponent}`}${unit.suffix}`;
}

/** `value` rounded to `digits` significant digits, written as `<M>e<E><unit>` with integer M. */
function roundedMantissaForm(value: number, digits: number, unit: MantissaUnit): string {
  const [mantissa, exponent] = (Math.abs(value) / unit.factor).toExponential(digits - 1).split('e');
  return mantissaLiteral(value < 0 ? '-' : '', mantissa.replace('.', ''), Number(exponent) - (digits - 1), unit);
}

/**
 * A `<M>e<E><unit>` literal for `value` when no rounded mantissa reads back
 * to it: integer mantissas next to `value / pow(10, E)`, from 17 digits (one
 * mantissa step is about one ulp of the product) up to 23 digits, where
 * accumulating the digits rounds and the extra digits pick the rounding.
 */
function nearestMantissaForm(value: number, unit: MantissaUnit): string | undefined {
  const magnitude = Math.abs(value) / unit.factor;
  const sign = value < 0 ? '-' : '';
  const topScale = Math.floor(Math.log10(magnitude)) - 16;
  for (let scale = topScale + 1; scale >= topScale - 6; scale--) {
    const rounded = Math.round(magnitude / Number(`1e${scale}`));
    if (!Number.isFinite(rounded)) continue; // pow(10, E) underflows to 0 for subnormal values
    const nearest = BigInt(rounded);
    for (let step = 0n; step <= MANTISSA_SEARCH_STEPS; step++) {
      for (const mantissa of step === 0n ? [nearest] : [nearest - step, nearest + step]) {
        if (mantissa <= 0n) continue;
        const text = mantissaLiteral(sign, mantissa.toString(), scale, unit);
        if (readsBackAs(text, value)) return text;
      }
    }
  }
  return undefined;
}

const MANTISSA_SEARCH_STEPS = 64n;

function readsBackAs(text: string, value: number): boolean {
  try {
    return Object.is(parseNumber(text), value);
  } catch {
    return false; // e.g. `Infinity` from rounding a value near Number.MAX_VALUE
  }
}

function formatParams(params?: Record<string, number>): string {
  if (!params) return '';
  return Object.entries(params)
    .map(([key, value]) => `${key}=${formatNumber(value)}`)
    .join(' ');
}

/** Subcircuit defaults; expression defaults are written as `{expr}`. */
function formatSubcircuitParams(params: Record<string, number | string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${typeof value === 'number' ? formatNumber(value) : `{${value}}`}`)
    .join(' ');
}

function formatModel(model: ModelParams): string {
  if (model.type === 'CPL') return formatCplModelCard(model);
  const params = [formatParams(model.params), model.version === undefined ? '' : `VERSION=${model.version}`]
    .filter(Boolean).join(' ');
  return params
    ? `.model ${model.name} ${model.type} (${params})`
    : `.model ${model.name} ${model.type}`;
}

/**
 * A pwr/freq port uses its DC value only when one was given, so it must not
 * gain the `DC 0` that {@link formatWaveform} writes for an omitted value.
 */
function formatSourceValue(desc: DeviceDescriptor): string {
  const power = desc.port?.power;
  const wf = desc.waveform;
  if (!power) return formatWaveform(wf);
  const terms = power.dc === undefined ? [] : [`DC ${formatNumber(power.dc)}`];
  const ac = wf?.type === 'ac' ? { magnitude: wf.magnitude ?? 1, phase: wf.phase ?? 0 } : wf?.ac;
  if (ac) terms.push(`AC ${formatNumber(ac.magnitude)} ${formatNumber(ac.phase)}`);
  return terms.join(' ');
}

function formatRFPort(port?: RFPort): string {
  if (!port) return '';
  const power = port.power
    ? ` pwr ${formatNumber(port.power.watts)} freq ${formatNumber(port.power.frequency)}`
    : '';
  return ` portnum ${port.number} z0 ${formatNumber(port.z0)}${power}`;
}

/**
 * Give every RF port source its internal `<name>.res` node (ngspice vsrcset.c
 * `<name>#res`: z0 sits between the outer + node and it) and enforce ngspice
 * vsrctemp.c port numbering: the N ports are numbered 1..N, each once.
 */
function withRFPortNodes(descriptors: DeviceDescriptor[]): DeviceDescriptor[] {
  const ports = descriptors.filter(desc => desc.type === 'V' && desc.port);
  const seen = new Map<number, string>();
  for (const desc of ports) {
    const { number } = desc.port!;
    const previous = seen.get(number);
    if (previous !== undefined) {
      throw new InvalidCircuitError(`RF port sources '${previous}' and '${desc.name}' share port number ${number}`);
    }
    if (number > ports.length) {
      throw new InvalidCircuitError(
        `RF port '${desc.name}' has port number ${number}, but the ${ports.length} port(s) must use port numbers 1..${ports.length}`,
      );
    }
    seen.set(number, desc.name);
  }
  if (ports.length === 0) return descriptors;
  return descriptors.map(desc => (desc.type === 'V' && desc.port
    ? { ...desc, nodes: [desc.nodes[0], desc.nodes[1], internalNodeName(desc.name, 'res')] }
    : desc));
}

/**
 * Positional waveform coefficients up to the last given one. An omitted one
 * before it is written as the value ngspice reads the same as omitted; one
 * without such a value (a TSTOP-derived default) cannot be written.
 */
function positionalCoefficients(keyword: string, coefficients: Array<[number | undefined, number?]>): string {
  let last = coefficients.length - 1;
  while (last > 0 && coefficients[last][0] === undefined) last--;
  return coefficients.slice(0, last + 1).map(([value, omitted], index) => {
    if (value !== undefined) return formatNumber(value);
    if (omitted === undefined) {
      throw new InvalidCircuitError(
        `${keyword} coefficient ${index + 1} is omitted before a given one; its default cannot be written on a netlist card`,
      );
    }
    return formatNumber(omitted);
  }).join(' ');
}

function formatWaveform(wf?: Partial<SourceWaveform> & { dc?: number }): string {
  if (!wf) return 'DC 0';
  let base: string;
  if (!wf.type) {
    base = wf.dc !== undefined ? `DC ${formatNumber(wf.dc)}` : 'DC 0';
  } else {
    switch (wf.type) {
      case 'dc':
        base = `DC ${formatNumber(wf.value ?? 0)}`;
        break;
      case 'ac': {
        const ac = `AC ${formatNumber(wf.magnitude ?? 1)} ${formatNumber(wf.phase ?? 0)}`;
        base = wf.dc !== undefined ? `DC ${formatNumber(wf.dc)} ${ac}` : ac;
        break;
      }
      case 'pulse':
        base = `PULSE(${[
          wf.v1 ?? 0,
          wf.v2 ?? 0,
          wf.delay ?? 0,
          wf.rise ?? 1e-12,
          wf.fall ?? 1e-12,
          wf.width ?? Infinity,
          wf.period ?? Infinity,
          ...(wf.pulses !== undefined ? [wf.pulses] : []),
        ].map(formatNumber).join(' ')})`;
        break;
      case 'sin':
        base = `SIN(${[
          wf.offset ?? 0,
          wf.amplitude ?? 0,
          wf.frequency ?? 0,
          wf.delay,
          wf.damping,
          wf.phase,
        ].filter(v => v !== undefined).map(v => formatNumber(v as number)).join(' ')})`;
        break;
      case 'pwl':
        base = `PWL(${(wf.points ?? [])
          .flatMap(point => [point.time, point.value])
          .map(formatNumber)
          .join(' ')})`;
        if (wf.delay !== undefined) base += ` TD=${formatNumber(wf.delay)}`;
        if (wf.repeat !== undefined) base += ` R=${formatNumber(wf.repeat)}`;
        break;
      case 'exp':
        // ngspice reads a zero TD1/TAU1/TD2/TAU2 as omitted.
        base = `EXP(${positionalCoefficients('EXP', [
          [wf.v1 ?? 0], [wf.v2 ?? 0], [wf.td1, 0], [wf.tau1, 0], [wf.td2, 0], [wf.tau2, 0],
        ])})`;
        break;
      case 'sffm':
        // An omitted FC defaults from TSTOP, which no explicit value writes; a zero FM is omitted.
        base = `SFFM(${positionalCoefficients('SFFM', [
          [wf.offset ?? 0], [wf.amplitude ?? 0], [wf.carrierFrequency], [wf.modulationIndex, 90],
          [wf.signalFrequency, 0], [wf.delay, 0], [wf.signalPhase, 0], [wf.carrierPhase, 0],
        ])})`;
        break;
      case 'am':
        // Omitted FM and FC default from TSTOP, which no explicit value writes.
        base = `AM(${positionalCoefficients('AM', [
          [wf.offset ?? 0], [wf.carrierAmplitude ?? 0], [wf.modulationAmplitude, 1], [wf.modulationFrequency],
          [wf.carrierFrequency], [wf.delay, 0], [wf.modulationPhase, 0], [wf.carrierPhase, 0],
        ])})`;
        break;
      case 'trnoise':
        base = `TRNOISE(${[
          wf.amplitude ?? 0, wf.ts ?? 0, wf.alpha ?? 0, wf.oneOverFAmplitude ?? 0,
          wf.rtsAmplitude ?? 0, wf.rtsCaptureTime ?? 0, wf.rtsEmissionTime ?? 0,
        ].map(formatNumber).join(' ')})`;
        break;
      case 'trrandom':
        base = `TRRANDOM(${[
          wf.distribution ?? 0, wf.ts ?? 0, wf.td ?? 0, wf.param1 ?? 1, wf.param2 ?? 0,
        ].map(formatNumber).join(' ')})`;
        break;
      default:
        base = 'DC 0';
    }
  }
  if (wf.type !== 'dc' && wf.type !== 'ac') {
    const prefix = [
      wf.dc !== undefined ? `DC ${formatNumber(wf.dc)}` : '',
      wf.ac ? `AC ${formatNumber(wf.ac.magnitude)} ${formatNumber(wf.ac.phase)}` : '',
    ].filter(Boolean).join(' ');
    if (prefix) base = `${prefix} ${base}`;
  }
  const distortion = [
    wf.distortionF1
      ? `DISTOF1 ${formatNumber(wf.distortionF1.magnitude)} ${formatNumber(wf.distortionF1.phase)}`
      : '',
    wf.distortionF2
      ? `DISTOF2 ${formatNumber(wf.distortionF2.magnitude)} ${formatNumber(wf.distortionF2.phase)}`
      : '',
  ].filter(Boolean).join(' ');
  return distortion ? `${base} ${distortion}` : base;
}

function formatDevice(desc: DeviceDescriptor): string {
  const params = formatParams(desc.params);
  const tail = params ? ` ${params}` : '';

  switch (desc.type) {
    case 'R': {
      const valueAndModel = [
        desc.value !== undefined ? formatNumber(desc.value) : undefined,
        desc.modelName,
      ].filter(Boolean).join(' ');
      // A keyword-only card (no value, no model) round-trips as written: ngspice
      // resolves it to the 1 mOhm default (#574), not to the '0' placeholder.
      const resistance = valueAndModel || (tail ? '' : '0');
      return `${desc.name} ${desc.nodes[0]} ${desc.nodes[1]}${resistance ? ` ${resistance}` : ''}${tail}`;
    }
    case 'C':
    case 'L': {
      const value = desc.value !== undefined ? formatNumber(desc.value) : undefined;
      const valueAndModel = [value, desc.modelName].filter(Boolean).join(' ');
      const ic = desc.ic === undefined ? '' : ` IC=${formatNumber(desc.ic)}`;
      return `${desc.name} ${desc.nodes[0]} ${desc.nodes[1]} ${valueAndModel || '0'}${tail}${ic}`;
    }
    case 'K':
      return `${desc.name} ${desc.coupledA} ${desc.coupledB} ${formatNumber(desc.value ?? 0)}`;
    case 'T':
      return `${desc.name} ${desc.nodes.join(' ')} Z0=${formatNumber(desc.value ?? 0)} TD=${formatNumber(desc.params?.TD ?? 0)}`;
    case 'O':
      return `${desc.name} ${desc.nodes.join(' ')} ${desc.modelName ?? ''}`.trim();
    case 'Y':
    case 'P': {
      const lines = desc.nodes.length / 2;
      const length = desc.params?.LEN === undefined ? '' : ` len=${formatNumber(desc.params.LEN)}`;
      return `${desc.name} ${desc.nodes.slice(0, lines).join(' ')} 0 ${desc.nodes.slice(lines).join(' ')} 0 `
        + `${desc.modelName ?? ''}${length}`;
    }
    case 'V':
    case 'I': {
      const multiplier = desc.multiplier === undefined ? '' : ` m=${formatNumber(desc.multiplier)}`;
      return `${desc.name} ${desc.nodes[0]} ${desc.nodes[1]} ${formatSourceValue(desc)}${formatRFPort(desc.port)}${multiplier}`;
    }
    case 'D':
      return `${desc.name} ${desc.nodes[0]} ${desc.nodes[1]} ${desc.modelName ?? ''}${tail}`.trim();
    case 'Q':
      return `${desc.name} ${desc.nodes.join(' ')} ${desc.modelName ?? ''}${tail}`.trim();
    case 'J':
    case 'Z':
      return `${desc.name} ${desc.nodes[0]} ${desc.nodes[1]} ${desc.nodes[2]} ${desc.modelName ?? ''}`.trim();
    case 'M':
      return `${desc.name} ${desc.nodes.join(' ')} ${desc.modelName ?? ''}${tail}`.trim();
    case 'E':
    case 'G':
      return `${desc.name} ${desc.nodes.join(' ')} ${formatNumber(desc.value ?? 0)}`;
    case 'F':
    case 'H':
      return `${desc.name} ${desc.nodes[0]} ${desc.nodes[1]} ${desc.controlSource ?? ''} ${formatNumber(desc.value ?? 0)}`.trim();
    case 'S':
      return `${desc.name} ${desc.nodes.join(' ')} ${desc.modelName ?? ''} ${desc.params?.ON ? 'ON' : 'OFF'}`;
    case 'W':
      return `${desc.name} ${desc.nodes.join(' ')} ${desc.controlSource ?? ''} ${desc.modelName ?? ''} ${desc.params?.ON ? 'ON' : 'OFF'}`;
    case 'B':
      return formatBehavioralSource(desc);
    case 'X':
      return `${desc.name} ${desc.nodes.join(' ')} ${desc.modelName ?? ''}${tail}`.trim();
    case 'A':
      return desc.xspice!.raw;
    default:
      return `${desc.name} ${desc.nodes.join(' ')}`;
  }
}

function formatAnalysis(analysis: AnalysisDirective | PoleZeroAnalysis): string {
  switch (analysis.type) {
    case 'op':
      return '.op';
    case 'dc':
      return `.dc ${analysis.source} ${formatNumber(analysis.start)} ${formatNumber(analysis.stop)} ${formatNumber(analysis.step)}${analysis.secondary === undefined ? '' : ` ${analysis.secondary.source} ${formatNumber(analysis.secondary.start)} ${formatNumber(analysis.secondary.stop)} ${formatNumber(analysis.secondary.step)}`}`;
    case 'tran': {
      const parts = ['.tran', formatNumber(analysis.timestep), formatNumber(analysis.stopTime)];
      if (analysis.startTime !== undefined) parts.push(formatNumber(analysis.startTime));
      if (analysis.maxTimestep !== undefined) parts.push(formatNumber(analysis.maxTimestep));
      if (analysis.useInitialConditions) parts.push('UIC');
      return parts.join(' ');
    }
    case 'ac':
      return `.ac ${analysis.variation} ${analysis.points} ${formatNumber(analysis.startFreq)} ${formatNumber(analysis.stopFreq)}`;
    case 'noise':
      return `.noise v(${analysis.outputNode}${analysis.outputReferenceNode === undefined ? '' : `,${analysis.outputReferenceNode}`}) ${analysis.inputSource} ${analysis.variation} ${analysis.points} ${formatNumber(analysis.startFreq)} ${formatNumber(analysis.stopFreq)}${analysis.pointsPerSummary === undefined ? '' : ` ${analysis.pointsPerSummary}`}`;
    case 'sp':
      return `.sp ${analysis.variation} ${analysis.points} ${formatNumber(analysis.startFreq)} ${formatNumber(analysis.stopFreq)} ${analysis.noise ? 1 : 0}`;
    case 'disto':
      return `.disto dec ${analysis.points} ${formatNumber(analysis.startFreq)} ${formatNumber(analysis.stopFreq)}${analysis.f2OverF1 === undefined ? '' : ` ${formatNumber(analysis.f2OverF1)}`}`;
    case 'tf':
      return 'outputNode' in analysis
        ? `.tf v(${analysis.outputNode}) ${analysis.inputSource}`
        : `.tf i(${analysis.outputSource}) ${analysis.inputSource}`;
    case 'pz':
      return `.pz ${analysis.inputPositive} ${analysis.inputNegative} ${analysis.outputPositive} ${analysis.outputNegative} ${analysis.inputType} ${analysis.mode}`;
    case 'sens':
      return analysis.mode === 'dc'
        ? `.sens v(${analysis.outputNode})`
        : `.sens v(${analysis.outputNode}) ac dec ${analysis.points} ${formatNumber(analysis.startFreq)} ${formatNumber(analysis.stopFreq)}`;
  }
}

function formatStep(step: StepAnalysis): string {
  if (step.sweepMode === 'list') {
    return `.step ${step.param} LIST ${(step.values ?? []).map(formatNumber).join(' ')}`;
  }
  if (step.sweepMode === 'lin') {
    return `.step ${step.param} ${formatNumber(step.start ?? 0)} ${formatNumber(step.stop ?? 0)} ${formatNumber(step.increment ?? 0)}`;
  }
  return `.step ${step.sweepMode.toUpperCase()} ${step.param} ${formatNumber(step.start ?? 0)} ${formatNumber(step.stop ?? 0)} ${step.points ?? 0}`;
}

/** Descriptor params for a BJT instance; undefined when the card gave no scaling. */
function bjtInstanceDescriptorParams(
  instance: BJTInstanceParams | undefined,
): Record<string, number> | undefined {
  if (!instance) return undefined;
  const params: Record<string, number> = {};
  for (const name of ['AREA', 'AREAB', 'AREAC', 'M'] as const) {
    if (instance[name] !== undefined) params[name] = instance[name];
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

/** ngspice-47 BJT/VBIC instance scale: AREA * M (both default to 1). */
function bjtInstanceScale(params: Record<string, number> | undefined): number {
  return (params?.AREA ?? 1) * (params?.M ?? 1);
}

/** VDMOS instance parameters (vdmos.c): M, TEMP and DTEMP are supported. */
function vdmosInstanceParams(desc: DeviceDescriptor): { M?: number; TEMP?: number; DTEMP?: number } {
  const { M, TEMP, DTEMP, ...rest } = desc.params ?? {};
  const unsupported = Object.keys(rest);
  if (unsupported.length > 0) {
    throw new InvalidCircuitError(
      `VDMOS '${desc.name}' has unsupported instance parameters: ${unsupported.join(', ')}`,
    );
  }
  if (M !== undefined && !(M > 0)) {
    throw new InvalidCircuitError(`VDMOS '${desc.name}' multiplier M must be positive`);
  }
  return { M, TEMP, DTEMP };
}

function isPositiveFinite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function hasCapacitorParasitics(model: ResolvedCapacitorModel): boolean {
  return isPositiveFinite(model.seriesResistance)
    || isPositiveFinite(model.seriesInductance)
    || isPositiveFinite(model.parallelResistance);
}

function hasInductorParasitics(model: ResolvedInductorModel): boolean {
  return isPositiveFinite(model.seriesResistance)
    || isPositiveFinite(model.parallelResistance)
    || isPositiveFinite(model.parallelCapacitance);
}

function internalNodeName(deviceName: string, suffix: string): string {
  return `${deviceName}.${suffix}`;
}

/**
 * MOS1 drain/source series resistances as ngspice-47 mos1set.c/mos1temp.c
 * resolve them: 0 when the terminal has no prime node (shorted), `Infinity`
 * when the prime node exists but its conductance is 0 (open terminal), else
 * the resistance.
 *
 * mos1set.c creates the drain prime node when RD != 0 || (RSH != 0 && NRD != 0)
 * (NRD = NRS = 1 square by default). mos1temp.c then sets the conductance to
 * M / RD when RD is given (0 when RD = 0), else M / (RSH * NRD) when RSH is
 * non-zero; the source likewise with RS and NRS. RD = 0 given with RSH != 0 and
 * NRD != 0 thus leaves the drain open (#757). With RD not given, RSH != 0 and
 * NRD = 0 ngspice divides by zero and its operating point fails; spice-ts keeps
 * that zero-square terminal shorted.
 */
function mos1SeriesResistances(
  card: Readonly<Record<string, number | undefined>>,
  instance: Readonly<Record<string, number | undefined>> | undefined,
): { drain: number; source: number } {
  const m = instance?.M ?? 1;
  const sheet = card.RSH ?? 0;
  const resistance = (given: number | undefined, squares: number): number => {
    if ((given ?? 0) === 0 && (sheet === 0 || squares === 0)) return 0;
    const conductance = given !== undefined ? (given !== 0 ? m / given : 0) : m / (sheet * squares);
    return conductance !== 0 ? 1 / conductance : Infinity;
  };
  return {
    drain: resistance(card.RD, instance?.NRD ?? 1),
    source: resistance(card.RS, instance?.NRS ?? 1),
  };
}

/**
 * `.model` registry keyed case-insensitively, as in ngspice: `M1 ... PMOS`
 * must resolve `.model pmos pmos ...`. A miss silently falls back to default
 * device parameters, so a case mismatch would otherwise change the circuit.
 */
class ModelTable extends Map<string, ModelParams> {
  override get(name: string): ModelParams | undefined {
    return super.get(name.toUpperCase());
  }

  override has(name: string): boolean {
    return super.has(name.toUpperCase());
  }

  override set(name: string, model: ModelParams): this {
    return super.set(name.toUpperCase(), model);
  }

  override delete(name: string): boolean {
    return super.delete(name.toUpperCase());
  }
}

/**
 * Programmatic circuit builder for constructing SPICE circuits without a netlist.
 *
 * Add devices, models, subcircuits, and analysis commands via the `add*` methods,
 * then call {@link Circuit.compile} to produce a {@link CompiledCircuit} for simulation.
 *
 * @example
 * ```ts
 * const ckt = new Circuit();
 * ckt.addVoltageSource('V1', 'in', '0', { dc: 5 });
 * ckt.addResistor('R1', 'in', 'out', 1000);
 * ckt.addResistor('R2', 'out', '0', 1000);
 * ckt.addAnalysis('op');
 * const result = await simulate(ckt);
 * ```
 */
export class Circuit {
  private descriptors: DeviceDescriptor[] = [];
  private _analyses: AnalysisDirective[] = [];
  private _poleZeroAnalyses: PoleZeroAnalysis[] = [];
  private _steps: StepAnalysis[] = [];
  private _models: Map<string, ModelParams> = new ModelTable();
  /**
   * Upper-case names of `.model` cards defined inside a subcircuit body. ngspice
   * gives every subcircuit instance its own copy of such a model (`x1:name`).
   */
  private readonly _subcircuitModelNames = new Set<string>();
  /** XSPICE code model cards, keyed by upper-case model name like {@link ModelTable}. */
  private _xspiceModels = new Map<string, XspiceModelCard>();
  private _subcircuits = new Map<string, SubcktDefinition>();
  /** `.global` node names, keyed upper-case, valued with their first spelling. */
  private _globalNodes = new Map<string, string>();
  /** Top-level `.param` values (upper-case names) visible inside subcircuits. */
  private _parameters = new Map<string, number>();
  private _parameterScope: Record<string, number> | undefined;
  private _simulationOptions: SimulationOptions = {};
  private _temperature: number | undefined;
  private _xspiceTrtol: number | undefined;
  private _initialConditions: NodeInitialState[] = [];
  private _nodeSets: NodeInitialState[] = [];
  private nodeSet = new CaseFoldedNameSet();
  private _controlScript?: ControlScript;
  private _parseWarnings: string[] = [];

  get analyses(): AnalysisDirective[] {
    return this._analyses;
  }

  get poleZeroAnalyses(): PoleZeroAnalysis[] {
    return this._poleZeroAnalyses;
  }

  get simulationOptions(): Readonly<SimulationOptions> {
    return { ...this._simulationOptions };
  }

  setSimulationOptions(options: SimulationOptions): void {
    this._simulationOptions = { ...this._simulationOptions, ...options };
  }

  /**
   * Circuit temperature in degrees Celsius set by `.options TEMP=`, or
   * `undefined` for ngspice's default of 27 C.
   */
  get temperature(): number | undefined {
    return this._temperature;
  }

  /**
   * Set the circuit temperature in degrees Celsius (ngspice `.options TEMP=`).
   * Devices without an instance temperature are evaluated at it. A value other
   * than 27 C is rejected at compile time for devices whose temperature model
   * does not yet follow ngspice.
   */
  setTemperature(celsius: number): void {
    if (!Number.isFinite(celsius) || celsius <= -CELSIUS_TO_KELVIN) {
      throw new InvalidCircuitError(`Invalid circuit temperature: ${celsius} C`);
    }
    this._temperature = celsius;
  }

  /**
   * ngspice `.options XTRTOL=` (integer, at least 1), or `undefined` when not
   * set. ngspice-47 cktdojob.c uses it instead of 1 as the trtol of a circuit
   * with XSPICE 'A' devices whose trtol is above 1; otherwise it has no effect.
   */
  get xspiceTrtol(): number | undefined {
    return this._xspiceTrtol;
  }

  /**
   * Non-fatal netlist diagnostics recorded while parsing, such as ngspice's
   * "misplaced .endc card". {@link simulate} reports them as `parse` warnings.
   */
  get parseWarnings(): readonly string[] {
    return this._parseWarnings;
  }

  /** @internal Record a non-fatal parse diagnostic; see {@link parseWarnings}. */
  addParseWarning(message: string): void {
    this._parseWarnings.push(message);
  }

  /** Set the ngspice `.options XTRTOL=` value; see {@link xspiceTrtol}. */
  setXspiceTrtol(trtol: number | undefined): void {
    if (trtol !== undefined && (!Number.isInteger(trtol) || trtol < 1)) {
      throw new InvalidCircuitError(`Invalid XSPICE trtol: ${trtol}`);
    }
    this._xspiceTrtol = trtol;
  }

  /**
   * @internal The deck's ngspice `.control` script when it needs the
   * control-language interpreter (set by the netlist parser).
   */
  get controlScript(): ControlScript | undefined {
    return this._controlScript;
  }

  /** @internal */
  setControlScript(script: ControlScript | undefined): void {
    this._controlScript = script;
  }

  /**
   * @internal Capture everything a `.control` script can change (`alter`,
   * `altermod`, `option`) and return a function that puts it back, so running
   * a script never leaves the caller's Circuit edited.
   *
   * `alterInstance`/`alterModel`/`setSimulationOptions` replace the affected
   * fields with new objects rather than mutating them, so saving the field
   * references is a complete snapshot.
   */
  snapshotControlState(): () => void {
    const descriptors = this.descriptors.map(descriptor => ({
      descriptor, value: descriptor.value, waveform: descriptor.waveform, params: descriptor.params,
      multiplier: descriptor.multiplier,
    }));
    const models = Array.from(this._models.values(), model => ({ model, params: model.params }));
    const simulationOptions = this._simulationOptions;
    const temperature = this._temperature;
    return () => {
      for (const { descriptor, value, waveform, params, multiplier } of descriptors) {
        descriptor.value = value;
        descriptor.waveform = waveform;
        descriptor.params = params;
        descriptor.multiplier = multiplier;
      }
      for (const { model, params } of models) model.params = params;
      this._simulationOptions = simulationOptions;
      this._temperature = temperature;
    };
  }

  /**
   * @internal ngspice `alter`: change an input parameter of a top-level
   * device, with the same effect as editing its card. `parameter` undefined
   * selects the primary value (resistance, capacitance, inductance, source DC).
   *
   * @returns undefined on success, or why the change is not supported
   */
  alterInstance(name: string, parameter: string | undefined, values: number[]): string | undefined {
    const descriptor = this.descriptors.find(candidate => candidate.name.toUpperCase() === name.toUpperCase());
    if (!descriptor) {
      return name.includes('.')
        ? `device '${name}' is inside a subcircuit; only top-level devices can be altered`
        : `no device named '${name}'`;
    }
    const key = parameter?.toUpperCase();
    const single = (): number | string => (values.length === 1 ? values[0] : `parameter needs one value, got ${values.length}`);
    const primary: Record<string, string[]> = { R: ['R', 'RESISTANCE'], C: ['C', 'CAPACITANCE'], L: ['L', 'INDUCTANCE'] };
    if (descriptor.type in primary) {
      if (key !== undefined && !primary[descriptor.type].includes(key)) {
        return `parameter '${parameter}' of ${descriptor.type} device '${name}' cannot be altered`;
      }
      const value = single();
      if (typeof value === 'string') return value;
      descriptor.value = value;
      return undefined;
    }
    if (descriptor.type === 'I' && key === 'M') {
      // ngspice-47 isrcpar.c: ISRC_M is settable.
      const value = single();
      if (typeof value === 'string') return value;
      descriptor.multiplier = value;
      return undefined;
    }
    if (descriptor.type === 'V' || descriptor.type === 'I') {
      return alterSourceWaveform(descriptor, key, values);
    }
    if (['M', 'Q', 'D', 'J'].includes(descriptor.type) && key !== undefined) {
      const params = descriptor.params ?? {};
      if (!(key in params) && !(descriptor.type === 'M' && (key === 'W' || key === 'L'))) {
        return `parameter '${parameter}' of ${descriptor.type} device '${name}' cannot be altered`;
      }
      const value = single();
      if (typeof value === 'string') return value;
      descriptor.params = { ...params, [key]: value };
      return undefined;
    }
    return `${descriptor.type} device '${name}'${parameter ? ` parameter '${parameter}'` : ''} cannot be altered`;
  }

  /**
   * @internal ngspice `altermod`: set a `.model` parameter, with the same effect
   * as writing it on the model card.
   *
   * @returns undefined on success, or why the change is not supported
   */
  alterModel(name: string, parameter: string, value: number): string | undefined {
    const model = this._models.get(name);
    if (!model) return `no top-level .model named '${name}'`;
    model.params = { ...model.params, [parameter.toUpperCase()]: value };
    return undefined;
  }

  /**
   * @internal ngspice `@name[parameter]` readout of an input parameter of a
   * top-level device or `.model`, or undefined when spice-ts cannot report it
   * (operating-point quantities, internal parameters, subcircuit devices).
   */
  parameterVector(name: string, parameter: string): number[] | undefined {
    const key = parameter.toUpperCase();
    const descriptor = this.descriptors.find(candidate => candidate.name.toUpperCase() === name.toUpperCase());
    if (descriptor) {
      const primary: Record<string, string[]> = { R: ['R', 'RESISTANCE'], C: ['C', 'CAPACITANCE'], L: ['L', 'INDUCTANCE'] };
      if (primary[descriptor.type]?.includes(key)) return descriptor.value === undefined ? undefined : [descriptor.value];
      if (descriptor.type === 'I' && key === 'M') return [descriptor.multiplier ?? 1];
      if (descriptor.type === 'V' || descriptor.type === 'I') return sourceParameter(descriptor.waveform, key);
      const value = descriptor.params?.[key];
      return value === undefined ? undefined : [value];
    }
    const value = this._models.get(name)?.params[key];
    return value === undefined ? undefined : [value];
  }

  get initialConditions(): readonly NodeInitialState[] {
    return this._initialConditions;
  }

  get nodeSets(): readonly NodeInitialState[] {
    return this._nodeSets;
  }

  get nodeCount(): number {
    const nodes = new Set(this.nodeSet);
    nodes.delete(GROUND_NODE);
    return nodes.size;
  }

  get branchCount(): number {
    return this.descriptors.reduce((count, descriptor) =>
      count + (descriptor.type === 'T'
        ? 2
        : descriptor.type === 'Y' || descriptor.type === 'P'
          ? descriptor.nodes.length
          : descriptor.type === 'V' || descriptor.type === 'L'
            || descriptor.type === 'E' || descriptor.type === 'H' ? 1 : 0), 0);
  }

  getNodeIndex(name: string): number {
    if (name === GROUND_NODE) return -1;
    const nodes = [...this.nodeSet].filter(n => n !== GROUND_NODE).sort();
    return nodes.indexOf(this.nodeSet.canonical(name));
  }

  /**
   * Add a resistor to the circuit.
   *
   * @param name - Device name (e.g., `'R1'`)
   * @param nodePos - Positive terminal node
   * @param nodeNeg - Negative terminal node
   * @param resistance - Resistance value in ohms. Omit when using a `.model R` card value.
   * @param instanceParams - ngspice instance parameters (e.g. `{ TC1: 1e-3, AC: 4e3, M: 2, NOISY: 0 }`)
   * @param modelName - Optional name of a `.model R` card
   */
  addResistor(
    name: string,
    nodePos: string,
    nodeNeg: string,
    resistance?: number,
    instanceParams?: Record<string, number>,
    modelName?: string,
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({
      type: 'R', name, nodes: [nodePos, nodeNeg], value: resistance,
      params: instanceParams,
      modelName,
    });
  }

  /**
   * Add a capacitor to the circuit.
   *
   * @param name - Device name (e.g., `'C1'`)
   * @param nodePos - Positive terminal node
   * @param nodeNeg - Negative terminal node
   * @param capacitance - Capacitance value in farads. Omit when using a `.model C` card value.
   * @param modelName - Optional name of a `.model C` card
   * @param instanceParams - Per-instance model parameters (e.g., `{ L: 10e-6, W: 1e-6, M: 2 }`)
   */
  addCapacitor(
    name: string,
    nodePos: string,
    nodeNeg: string,
    capacitance?: number,
    modelName?: string,
    instanceParams?: Record<string, number>,
    ic?: number,
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({
      type: 'C',
      name,
      nodes: [nodePos, nodeNeg],
      value: capacitance,
      modelName,
      params: instanceParams,
      ic,
    });
  }

  /**
   * Add an inductor to the circuit.
   *
   * @param name - Device name (e.g., `'L1'`)
   * @param nodePos - Positive terminal node
   * @param nodeNeg - Negative terminal node
   * @param inductance - Inductance value in henries. Omit when using a `.model L` card value.
   * @param modelName - Optional name of a `.model L` card
   * @param instanceParams - Per-instance model parameters (e.g., `{ NT: 10, SCALE: 2 }`)
   */
  addInductor(
    name: string,
    nodePos: string,
    nodeNeg: string,
    inductance?: number,
    modelName?: string,
    instanceParams?: Record<string, number>,
    ic?: number,
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({
      type: 'L',
      name,
      nodes: [nodePos, nodeNeg],
      value: inductance,
      modelName,
      params: instanceParams,
      ic,
    });
  }

  /** Add a SPICE K-element coupling two previously declared inductors. */
  addInductorCoupling(name: string, indA: string, indB: string, coupling: number): void {
    this.descriptors.push({
      type: 'K', name, nodes: [], value: coupling,
      coupledA: indA, coupledB: indB,
    });
  }

  /** Add a bounded ideal lossless T-element using characteristic impedance and delay. */
  addTransmissionLine(
    name: string,
    port1Positive: string,
    port1Negative: string,
    port2Positive: string,
    port2Negative: string,
    impedance: number,
    delay: number,
  ): void {
    for (const node of [port1Positive, port1Negative, port2Positive, port2Negative]) {
      this.nodeSet.add(node);
    }
    this.descriptors.push({
      type: 'T',
      name,
      nodes: [port1Positive, port1Negative, port2Positive, port2Negative],
      value: impedance,
      params: { TD: delay },
    });
  }

  /** Add a benchmark-bounded common-reference O-element backed by an LTRA model. */
  addLossyTransmissionLine(
    name: string,
    port1Positive: string,
    port1Negative: string,
    port2Positive: string,
    port2Negative: string,
    modelName: string,
  ): void {
    for (const node of [port1Positive, port1Negative, port2Positive, port2Negative]) {
      this.nodeSet.add(node);
    }
    this.descriptors.push({
      type: 'O',
      name,
      nodes: [port1Positive, port1Negative, port2Positive, port2Negative],
      modelName,
    });
  }

  /**
   * Add an ngspice SWEC lossy line: a Y-element (TXL, one conductor) or a
   * P-element (CPL, `inputs.length` coupled conductors). All conductors are
   * referenced to ground, as in ngspice, which ignores the reference nodes.
   */
  addLossyLines(
    name: string,
    card: 'Y' | 'P',
    inputs: string[],
    outputs: string[],
    modelName: string,
    length?: number,
  ): void {
    for (const node of [...inputs, ...outputs]) this.nodeSet.add(node);
    this.descriptors.push({
      type: card,
      name,
      nodes: [...inputs, ...outputs],
      modelName,
      ...(length === undefined ? {} : { params: { LEN: length } }),
    });
  }

  /**
   * Add a voltage source to the circuit.
   *
   * @param name - Device name (e.g., `'V1'`)
   * @param nodePos - Positive terminal node
   * @param nodeNeg - Negative terminal node
   * @param waveform - Source waveform specification (DC, pulse, sine, or AC)
   * @param port - Optional ngspice RF port (`portnum`, `z0`, `pwr`, `freq`) for `.sp`
   */
  addVoltageSource(
    name: string, nodePos: string, nodeNeg: string,
    waveform: Partial<SourceWaveform> & { dc?: number },
    port?: RFPort,
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'V', name, nodes: [nodePos, nodeNeg], waveform, ...(port ? { port } : {}) });
  }

  /**
   * Add a current source to the circuit.
   *
   * @param name - Device name (e.g., `'I1'`)
   * @param nodePos - Positive terminal node (current flows from pos to neg)
   * @param nodeNeg - Negative terminal node
   * @param waveform - Source waveform specification (DC, pulse, sine, or AC)
   * @param multiplier - ngspice `m` instance multiplier: the DC, transient and
   *   AC values are scaled by it (default 1); DISTOF terms are not.
   */
  addCurrentSource(
    name: string, nodePos: string, nodeNeg: string,
    waveform: Partial<SourceWaveform> & { dc?: number },
    multiplier?: number,
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({
      type: 'I', name, nodes: [nodePos, nodeNeg], waveform,
      ...(multiplier === undefined ? {} : { multiplier }),
    });
  }

  /**
   * Add a voltage-controlled voltage source (VCVS, E-element).
   *
   * @param name - Device name (e.g., `'E1'`)
   * @param nOutP - Positive output node
   * @param nOutN - Negative output node
   * @param nCtrlP - Positive control (sensing) node
   * @param nCtrlN - Negative control (sensing) node
   * @param gain - Voltage gain (V/V)
   */
  addVCVS(name: string, nOutP: string, nOutN: string, nCtrlP: string, nCtrlN: string, gain: number): void {
    this.nodeSet.add(nOutP);
    this.nodeSet.add(nOutN);
    this.nodeSet.add(nCtrlP);
    this.nodeSet.add(nCtrlN);
    this.descriptors.push({ type: 'E', name, nodes: [nOutP, nOutN, nCtrlP, nCtrlN], value: gain });
  }

  /**
   * Add a voltage-controlled current source (VCCS, G-element).
   *
   * @param name - Device name (e.g., `'G1'`)
   * @param nOutP - Positive output node
   * @param nOutN - Negative output node
   * @param nCtrlP - Positive control (sensing) node
   * @param nCtrlN - Negative control (sensing) node
   * @param gm - Transconductance (A/V)
   */
  addVCCS(name: string, nOutP: string, nOutN: string, nCtrlP: string, nCtrlN: string, gm: number): void {
    this.nodeSet.add(nOutP);
    this.nodeSet.add(nOutN);
    this.nodeSet.add(nCtrlP);
    this.nodeSet.add(nCtrlN);
    this.descriptors.push({ type: 'G', name, nodes: [nOutP, nOutN, nCtrlP, nCtrlN], value: gm });
  }

  /**
   * Add a current-controlled voltage source (CCVS, H-element).
   *
   * @param name - Device name (e.g., `'H1'`)
   * @param nOutP - Positive output node
   * @param nOutN - Negative output node
   * @param controlSource - Name of the voltage source whose current controls this device
   * @param gain - Transresistance (V/A)
   */
  addCCVS(name: string, nOutP: string, nOutN: string, controlSource: string, gain: number): void {
    this.nodeSet.add(nOutP);
    this.nodeSet.add(nOutN);
    this.descriptors.push({ type: 'H', name, nodes: [nOutP, nOutN], value: gain, controlSource });
  }

  /**
   * Add a current-controlled current source (CCCS, F-element).
   *
   * @param name - Device name (e.g., `'F1'`)
   * @param nOutP - Positive output node
   * @param nOutN - Negative output node
   * @param controlSource - Name of the voltage source whose current controls this device
   * @param gain - Current gain (A/A)
   */
  addCCCS(name: string, nOutP: string, nOutN: string, controlSource: string, gain: number): void {
    this.nodeSet.add(nOutP);
    this.nodeSet.add(nOutN);
    this.descriptors.push({ type: 'F', name, nodes: [nOutP, nOutN], value: gain, controlSource });
  }

  /**
   * Add an ngspice voltage-controlled switch (S-element, `.model SW`).
   *
   * @param name - Device name (e.g., `'S1'`)
   * @param nodePos - Positive switch node
   * @param nodeNeg - Negative switch node
   * @param nCtrlP - Positive control node
   * @param nCtrlN - Negative control node
   * @param modelName - Name of a `.model ... SW` card
   * @param initiallyOn - Instance `ON` flag (default `OFF`)
   */
  addVoltageSwitch(
    name: string, nodePos: string, nodeNeg: string, nCtrlP: string, nCtrlN: string,
    modelName: string, initiallyOn = false,
  ): void {
    for (const node of [nodePos, nodeNeg, nCtrlP, nCtrlN]) this.nodeSet.add(node);
    this.descriptors.push({
      type: 'S', name, nodes: [nodePos, nodeNeg, nCtrlP, nCtrlN], modelName,
      ...(initiallyOn ? { params: { ON: 1 } } : {}),
    });
  }

  /**
   * Add an ngspice current-controlled switch (W-element, `.model CSW`).
   *
   * @param name - Device name (e.g., `'W1'`)
   * @param nodePos - Positive switch node
   * @param nodeNeg - Negative switch node
   * @param controlSource - Voltage source whose current controls the switch
   * @param modelName - Name of a `.model ... CSW` card
   * @param initiallyOn - Instance `ON` flag (default `OFF`)
   */
  addCurrentSwitch(
    name: string, nodePos: string, nodeNeg: string, controlSource: string,
    modelName: string, initiallyOn = false,
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({
      type: 'W', name, nodes: [nodePos, nodeNeg], modelName, controlSource,
      ...(initiallyOn ? { params: { ON: 1 } } : {}),
    });
  }

  /**
   * Add an ngspice B-source with an `I=` expression (current flows from
   * `nPlus` through the source to `nMinus`).
   *
   * @param name - Device name (e.g., `'B1'`)
   * @param nPlus - Positive node
   * @param nMinus - Negative node
   * @param expression - Parsed behavioral current expression
   */
  addBehavioralCurrentSource(
    name: string,
    nPlus: string,
    nMinus: string,
    expression: BehavioralExpression,
    params: BehavioralInstanceParams = {},
  ): void {
    this.addBehavioralSource(behavioralDescriptor(name, nPlus, nMinus, 'current', expression, params));
  }

  /**
   * Add an ngspice B-source with a `V=` expression: V(nPlus) - V(nMinus)
   * follows the expression, with a branch current like a `V` source.
   *
   * @param name - Device name (e.g., `'B1'`)
   * @param nPlus - Positive node
   * @param nMinus - Negative node
   * @param expression - Parsed behavioral voltage expression
   * @param params - ASRC instance parameters (`tc1`, `tc2`, `temp`, `dtemp`, `reciproctc`)
   */
  addBehavioralVoltageSource(
    name: string,
    nPlus: string,
    nMinus: string,
    expression: BehavioralExpression,
    params: BehavioralInstanceParams = {},
  ): void {
    this.addBehavioralSource(behavioralDescriptor(name, nPlus, nMinus, 'voltage', expression, params));
  }

  private addBehavioralSource(descriptor: DeviceDescriptor): void {
    for (const node of descriptor.nodes) this.nodeSet.add(node);
    this.descriptors.push(descriptor);
  }

  /**
   * Add an XSPICE A-element. Its connections are read against the port table
   * of its code model when the circuit is compiled, as ngspice does.
   *
   * @param card - Parsed A-card (see `parseXspiceInstance`)
   */
  addXspiceInstance(card: XspiceInstanceCard): void {
    this.descriptors.push({ type: 'A', name: card.name, nodes: [], modelName: card.modelName, xspice: card });
  }

  /**
   * Add a `.model` card of an implemented XSPICE code model.
   *
   * @param model - Parsed card (see `parseXspiceModelCard`)
   */
  addXspiceModel(model: XspiceModelCard): void {
    this._xspiceModels.set(model.name.toUpperCase(), model);
  }

  /**
   * Add a Z-card device (NHFET level 5 or NMF level 2, chosen by its model).
   *
   * @param name - Device name (e.g., `'Z1'`)
   * @param nodeDrain - Drain node
   * @param nodeGate - Gate node
   * @param nodeSource - Source node
   * @param modelName - Name of an `NHFET` or `NMF` model
   * @param instanceParams - `L`/`W` instance parameters
   */
  addZDevice(
    name: string,
    nodeDrain: string,
    nodeGate: string,
    nodeSource: string,
    modelName: string,
    instanceParams: Record<string, number> = {},
  ): void {
    this.nodeSet.add(nodeDrain);
    this.nodeSet.add(nodeGate);
    this.nodeSet.add(nodeSource);
    this.descriptors.push({
      type: 'Z', name, nodes: [nodeDrain, nodeGate, nodeSource], modelName, params: instanceParams,
    });
  }

  /**
   * Add a diode to the circuit.
   *
   * @param name - Device name (e.g., `'D1'`)
   * @param nodeAnode - Anode node
   * @param nodeCathode - Cathode node
   * @param modelName - Name of a `.model D` card (optional; uses default diode model if omitted)
   * @param instanceParams - Per-instance geometry (`AREA`, `PJ`, and multiplier `M`)
   */
  addDiode(
    name: string,
    nodeAnode: string,
    nodeCathode: string,
    modelName?: string,
    instanceParams?: DiodeInstanceParams,
  ): void {
    this.nodeSet.add(nodeAnode);
    this.nodeSet.add(nodeCathode);
    this.descriptors.push({
      type: 'D',
      name,
      nodes: [nodeAnode, nodeCathode],
      modelName,
      params: instanceParams ? { ...instanceParams } : undefined,
    });
  }

  /**
   * Add a bipolar junction transistor (BJT) to the circuit.
   *
   * @param name - Device name (e.g., `'Q1'`)
   * @param nodeCollector - Collector node
   * @param nodeBase - Base node
   * @param nodeEmitter - Emitter node
   * @param modelName - Name of a `.model NPN` or `.model PNP` card
   * @param nodeSubstrate - Optional substrate node. VBIC (LEVEL=4) and the
   *   Gummel-Poon BJT stamp their substrate junction to it; omitted, it is
   *   ground as in ngspice.
   * @param nodeThermal - Optional thermal node. Self-heating is not
   *   implemented, so compilation rejects it with an InvalidCircuitError.
   * @param instanceParams - Optional instance scaling (`AREA`, base/collector
   *   areas `AREAB`/`AREAC`, multiplier `M`), as in ngspice-47.
   */
  addBJT(
    name: string,
    nodeCollector: string,
    nodeBase: string,
    nodeEmitter: string,
    modelName: string,
    nodeSubstrate?: string,
    nodeThermal?: string,
    instanceParams?: BJTInstanceParams,
  ): void {
    this.nodeSet.add(nodeCollector);
    this.nodeSet.add(nodeBase);
    this.nodeSet.add(nodeEmitter);
    // Substrate/thermal nodes join the node set during expansion, and only
    // when the resolved model stamps them.
    const nodes = [nodeCollector, nodeBase, nodeEmitter];
    if (nodeSubstrate !== undefined || nodeThermal !== undefined) nodes.push(nodeSubstrate ?? GROUND_NODE);
    if (nodeThermal !== undefined) nodes.push(nodeThermal);
    const params = bjtInstanceDescriptorParams(instanceParams);
    this.descriptors.push({ type: 'Q', name, nodes, modelName, ...(params ? { params } : {}) });
  }

  /**
   * Add a bounded level-1/level-2 junction field-effect transistor
   * (`.model NJF` or `.model PJF`). `instanceParams.TEMP` is the ngspice
   * instance temperature; only the nominal 27 C is supported.
   */
  addJFET(
    name: string,
    nodeDrain: string,
    nodeGate: string,
    nodeSource: string,
    modelName: string,
    instanceParams?: JFETInstanceParams,
  ): void {
    this.nodeSet.add(nodeDrain);
    this.nodeSet.add(nodeGate);
    this.nodeSet.add(nodeSource);
    this.descriptors.push({
      type: 'J', name, nodes: [nodeDrain, nodeGate, nodeSource], modelName,
      ...(instanceParams?.TEMP === undefined ? {} : { params: { TEMP: instanceParams.TEMP } }),
    });
  }

  /**
   * Add a MOSFET to the circuit.
   *
   * Supports Level 1 (Shichman-Hodges), Level 2 (Grove-Frohman), Level 6 (Sakurai-Newton) and
   * Level 49/8 (BSIM3v3) models.
   * Any other `LEVEL` raises {@link UnsupportedModelLevelError} at compile time.
   *
   * @param name - Device name (e.g., `'M1'`)
   * @param nodeDrain - Drain node
   * @param nodeGate - Gate node
   * @param nodeSource - Source node
   * @param modelName - Name of a `.model NMOS` or `.model PMOS` card
   * @param instanceParams - Per-instance parameters (e.g., `{ W: 1e-6, L: 0.18e-6 }`)
   * @param nodeBulk - Bulk/body node (optional; defaults to source if omitted)
   */
  addMOSFET(
    name: string,
    nodeDrain: string, nodeGate: string, nodeSource: string,
    modelName: string,
    instanceParams?: Record<string, number>,
    nodeBulk?: string,
  ): void {
    this.nodeSet.add(nodeDrain);
    this.nodeSet.add(nodeGate);
    this.nodeSet.add(nodeSource);
    if (nodeBulk) this.nodeSet.add(nodeBulk);
    this.descriptors.push({
      type: 'M', name,
      nodes: nodeBulk ? [nodeDrain, nodeGate, nodeSource, nodeBulk] : [nodeDrain, nodeGate, nodeSource],
      modelName, params: instanceParams,
    });
  }

  /**
   * Register a subcircuit definition for later instantiation with {@link addSubcircuitInstance}.
   *
   * @param def - Subcircuit definition (name, ports, default parameters, and body lines)
   */
  addSubcircuit(def: SubcktDefinition): void {
    this._subcircuits.set(def.name.toUpperCase(), def);
  }

  /**
   * Declare `.global` nodes. Inside every subcircuit body these names bind to
   * the top-level net of the same name instead of an instance-local node, and
   * take precedence over a subcircuit port of the same name (ngspice
   * `gettrans`). Repeated declarations accumulate; ground (`0`) is always
   * global and is not recorded.
   */
  addGlobalNodes(names: readonly string[]): void {
    for (const name of names) {
      if (name === GROUND_NODE) continue;
      const key = name.toUpperCase();
      if (!this._globalNodes.has(key)) this._globalNodes.set(key, name);
    }
  }

  /** Declared `.global` node names, in declaration order. */
  get globalNodes(): string[] {
    return [...this._globalNodes.values()];
  }

  /**
   * Set top-level `.param` values. As in ngspice numparam, subcircuit
   * expressions (default parameter values, `{...}` values and B-source
   * expressions) see them unless a subcircuit parameter or a `.param` inside
   * the subcircuit shadows the name. {@link parseAsync} records the deck's
   * top-level parameters here. Names are case-insensitive; later values win.
   */
  setParameters(values: Readonly<Record<string, number>>): void {
    for (const [name, value] of Object.entries(values)) this._parameters.set(name.toUpperCase(), value);
    this._parameterScope = undefined;
  }

  /** Top-level `.param` values visible inside subcircuits, keyed upper-case. */
  get parameters(): Record<string, number> {
    return Object.fromEntries(this._parameters);
  }

  /**
   * Instantiate a subcircuit (X-element).
   *
   * The subcircuit must have been previously registered via {@link addSubcircuit}.
   * Internal nodes are automatically prefixed with the instance name.
   *
   * @param name - Instance name (e.g., `'X1'`)
   * @param ports - Actual node names to connect to the subcircuit's ports
   * @param subcktName - Name of the subcircuit definition to instantiate
   * @param params - Parameter overrides for this instance
   */
  addSubcircuitInstance(
    name: string,
    ports: string[],
    subcktName: string,
    params?: Record<string, number>,
  ): void {
    for (const p of ports) this.nodeSet.add(p);
    this.descriptors.push({
      type: 'X', name, nodes: ports, modelName: subcktName, params,
    });
  }

  /**
   * Register a device model parameter card (`.model`).
   *
   * @param params - Model parameters including name, type (e.g., `'NPN'`, `'NMOS'`), and parameter values
   * @throws UnsupportedCircuitModelTypeError if no spice-ts device implements the model type
   */
  addModel(params: ModelParams): void {
    this.registerModel(params);
  }

  /** Store a model with its type upper-cased, rejecting unsupported types (#544). */
  private registerModel(params: ModelParams): void {
    const type = normalizeModelType(params.name, params.type);
    this._models.set(params.name, type === params.type ? params : { ...params, type });
  }

  /**
   * Add a simulation analysis command to the circuit.
   *
   * @param type - Analysis type: `'op'` (DC operating point), `'dc'` (DC sweep),
   *   `'tran'` (transient), or `'ac'` (AC small-signal)
   * @param params - Analysis-specific parameters (not required for `'op'`)
   */
  addAnalysis(type: 'op'): void;
  addAnalysis(type: 'dc', params: { source: string; start: number; stop: number; step: number; secondary?: DCSweepDimension }): void;
  addAnalysis(type: 'tran', params: { timestep: number; stopTime: number; startTime?: number; maxTimestep?: number; useInitialConditions?: boolean }): void;
  addAnalysis(type: 'ac', params: { variation: 'dec' | 'oct' | 'lin'; points: number; startFreq: number; stopFreq: number }): void;
  addAnalysis(type: 'noise', params: { outputNode: string; outputReferenceNode?: string; inputSource: string; variation: 'dec' | 'oct' | 'lin'; points: number; startFreq: number; stopFreq: number; pointsPerSummary?: number }): void;
  addAnalysis(type: 'sp', params: { variation: 'dec' | 'oct' | 'lin'; points: number; startFreq: number; stopFreq: number; noise?: boolean }): void;
  addAnalysis(type: 'disto', params: { variation: 'dec'; points: number; startFreq: number; stopFreq: number; f2OverF1?: number }): void;
  addAnalysis(type: 'tf', params:
    | { outputNode: string; inputSource: string }
    | { outputSource: string; inputSource: string }): void;
  addAnalysis(type: 'pz', params: { inputPositive: string; inputNegative: string; outputPositive: string; outputNegative: string; inputType: 'cur' | 'vol'; mode: 'pol' | 'zer' | 'pz' }): void;
  addAnalysis(type: 'sens', params: { outputNode: string; mode: 'dc' }): void;
  addAnalysis(type: 'sens', params: { outputNode: string; mode: 'ac'; variation: 'dec' | 'oct' | 'lin'; points: number; startFreq: number; stopFreq: number }): void;
  addAnalysis(type: string, params?: Record<string, unknown>): void {
    switch (type) {
      case 'op':
        this._analyses.push({ type: 'op' });
        break;
      case 'dc':
        if (params!.secondary !== undefined) {
          const secondary = params!.secondary as DCSweepDimension;
          if ((params!.source as string).toUpperCase() === secondary.source.toUpperCase()) {
            throw new InvalidCircuitError(`DC sweep source '${secondary.source}' is repeated`);
          }
        }
        this._analyses.push({
          type: 'dc',
          source: params!.source as string,
          start: params!.start as number,
          stop: params!.stop as number,
          step: params!.step as number,
          ...(params!.secondary === undefined
            ? {}
            : { secondary: { ...(params!.secondary as DCSweepDimension) } }),
        });
        break;
      case 'tran': {
        const tranCmd: { type: 'tran'; timestep: number; stopTime: number; startTime?: number; maxTimestep?: number; useInitialConditions?: boolean } = {
          type: 'tran',
          timestep: params!.timestep as number,
          stopTime: params!.stopTime as number,
        };
        if (params?.startTime !== undefined) tranCmd.startTime = params.startTime as number;
        if (params?.maxTimestep !== undefined) tranCmd.maxTimestep = params.maxTimestep as number;
        if (params?.useInitialConditions) tranCmd.useInitialConditions = true;
        this._analyses.push(tranCmd);
        break;
      }
      case 'ac':
        this._analyses.push({
          type: 'ac',
          variation: params!.variation as 'dec' | 'oct' | 'lin',
          points: params!.points as number,
          startFreq: params!.startFreq as number,
          stopFreq: params!.stopFreq as number,
        });
        break;
      case 'noise':
        if (this._steps.length > 0) {
          throw new InvalidCircuitError('.step cannot be combined with .noise');
        }
        if (params!.pointsPerSummary !== undefined
            && (!Number.isInteger(params!.pointsPerSummary)
              || (params!.pointsPerSummary as number) < 1)) {
          throw new InvalidCircuitError(
            'Invalid .noise points_per_summary; expected a positive integer',
          );
        }
        this._analyses.push({
          type: 'noise',
          outputNode: params!.outputNode as string,
          ...(params!.outputReferenceNode === undefined
            ? {}
            : { outputReferenceNode: params!.outputReferenceNode as string }),
          inputSource: params!.inputSource as string,
          variation: params!.variation as 'dec' | 'oct' | 'lin',
          points: params!.points as number,
          startFreq: params!.startFreq as number,
          stopFreq: params!.stopFreq as number,
          ...(params!.pointsPerSummary === undefined
            ? {}
            : { pointsPerSummary: params!.pointsPerSummary as number }),
        });
        break;
      case 'sp':
        if (this._steps.length > 0) {
          throw new InvalidCircuitError('.step cannot be combined with .sp');
        }
        if (this._analyses.some(existing => existing.type === 'sp')) {
          throw new InvalidCircuitError('Multiple .sp analyses are not supported');
        }
        this._analyses.push({
          type: 'sp',
          variation: params!.variation as 'dec' | 'oct' | 'lin',
          points: params!.points as number,
          startFreq: params!.startFreq as number,
          stopFreq: params!.stopFreq as number,
          noise: params!.noise === true,
        });
        break;
      case 'disto':
        if (this._steps.length > 0) {
          throw new InvalidCircuitError('.step cannot be combined with .disto');
        }
        if (this._analyses.some(existing => existing.type === 'disto')) {
          throw new InvalidCircuitError('Multiple .disto analyses are not supported');
        }
        if (params!.variation !== 'dec'
            || !Number.isInteger(params!.points) || (params!.points as number) < 1
            || !Number.isFinite(params!.startFreq) || (params!.startFreq as number) <= 0
            || !Number.isFinite(params!.stopFreq)
            || (params!.stopFreq as number) < (params!.startFreq as number)
            || (params!.f2OverF1 !== undefined
              && (!Number.isFinite(params!.f2OverF1)
                || (params!.f2OverF1 as number) <= 0
                || (params!.f2OverF1 as number) >= 1))) {
          throw new InvalidCircuitError('Invalid .disto dec sweep');
        }
        this._analyses.push({
          type: 'disto',
          variation: 'dec',
          points: params!.points as number,
          startFreq: params!.startFreq as number,
          stopFreq: params!.stopFreq as number,
          ...(params!.f2OverF1 === undefined
            ? {}
            : { f2OverF1: params!.f2OverF1 as number }),
        });
        break;
      case 'tf':
        this._analyses.push('outputSource' in params!
          ? {
            type: 'tf',
            outputSource: params.outputSource as string,
            inputSource: params.inputSource as string,
          }
          : {
            type: 'tf',
            outputNode: params!.outputNode as string,
            inputSource: params!.inputSource as string,
          });
        break;
      case 'pz':
        if (this._steps.length > 0) {
          throw new InvalidCircuitError('.step cannot be combined with .pz');
        }
        const analysis: PoleZeroAnalysis = {
          type: 'pz',
          inputPositive: params!.inputPositive as string,
          inputNegative: params!.inputNegative as string,
          outputPositive: params!.outputPositive as string,
          outputNegative: params!.outputNegative as string,
          inputType: params!.inputType as 'cur' | 'vol',
          mode: params!.mode as PoleZeroAnalysis['mode'],
        };
        assertSupportedPoleZero(analysis);
        this._poleZeroAnalyses.push(analysis);
        break;
      case 'sens': {
        if (this._steps.length > 0) {
          throw new InvalidCircuitError('.step cannot be combined with .sens');
        }
        if (this._analyses.some(existing => existing.type === 'sens')) {
          throw new InvalidCircuitError('Multiple .sens analyses are not supported');
        }
        const analysis = { type: 'sens', ...params } as SensitivityAnalysis;
        assertSupportedSensitivity(analysis);
        this._analyses.push(analysis);
        break;
      }
    }
  }

  /** Add a node voltage from `.ic` or `.nodeset`. */
  addInitialState(kind: 'ic' | 'nodeset', state: NodeInitialState): void {
    const target = kind === 'ic' ? this._initialConditions : this._nodeSets;
    const normalizedNode = state.node.toLowerCase();
    const existing = target.findIndex(entry => entry.node.toLowerCase() === normalizedNode);
    if (existing >= 0) target[existing] = state;
    else target.push(state);
  }

  /**
   * Add a .step parametric sweep directive.
   *
   * @param param - Device name to sweep (e.g., 'R1')
   * @param opts - Sweep configuration
   */
  addStep(param: string, opts: {
    mode?: 'lin' | 'dec' | 'oct';
    start?: number;
    stop?: number;
    step?: number;
    points?: number;
    values?: number[];
  }): void {
    if (this._steps.length > 0) {
      throw new InvalidCircuitError(
        'Multiple .step directives are not supported; nested or multi-dimensional stepping is unsupported',
      );
    }
    if (this._poleZeroAnalyses.length > 0) {
      throw new InvalidCircuitError('.step cannot be combined with .pz');
    }
    if (this._analyses.some(analysis => analysis.type === 'sens')) {
      throw new InvalidCircuitError('.step cannot be combined with .sens');
    }
    if (this._analyses.some(analysis => analysis.type === 'noise')) {
      throw new InvalidCircuitError('.step cannot be combined with .noise');
    }
    if (this._analyses.some(analysis => analysis.type === 'disto')) {
      throw new InvalidCircuitError('.step cannot be combined with .disto');
    }
    if (this._analyses.some(analysis => analysis.type === 'sp')) {
      throw new InvalidCircuitError('.step cannot be combined with .sp');
    }
    if (opts.values) {
      this._steps.push({ type: 'step', param, sweepMode: 'list', values: opts.values });
    } else {
      const sweepMode = opts.mode ?? 'lin';
      this._steps.push({
        type: 'step', param, sweepMode,
        start: opts.start, stop: opts.stop,
        increment: sweepMode === 'lin' ? opts.step : undefined,
        points: sweepMode !== 'lin' ? opts.points : undefined,
      });
    }
  }

  /**
   * Convert the circuit to an intermediate representation (IR).
   *
   * The IR is a flat, serialisable snapshot of every component with named ports,
   * typed parameters, and human-readable display values. It is suitable for
   * visualisation, export, or further transformation without running a simulation.
   *
   * @returns A {@link CircuitIR} with components and net names
   */
  toIR(): CircuitIR {
    return buildIR(this.descriptors, this._models);
  }

  /**
   * Serialize the programmatic circuit to a SPICE-like netlist.
   *
   * This is primarily used by external simulator backends that consume text
   * netlists. Raw subcircuit bodies are preserved exactly as registered.
   */
  toNetlist(): string {
    const lines: string[] = ['* spice-ts generated netlist'];

    const optionNames: Array<[keyof SimulationOptions, string, (value: unknown) => string]> = [
      ['bypass', 'bypass', String],
      ['rampTime', 'ramptime', String],
      ['abstol', 'abstol', String],
      ['vntol', 'vntol', String],
      ['reltol', 'reltol', String],
      ['gmin', 'gmin', String],
      ['maxIterations', 'itl1', String],
      ['maxTransientIterations', 'itl4', String],
      ['integrationMethod', 'method', value => value === 'trapezoidal' ? 'trap' : value === 'gear2' ? 'gear' : String(value)],
      ['trtol', 'trtol', String],
      ['chgtol', 'chgtol', String],
    ];
    const serializedOptions = optionNames.flatMap(([key, name, format]) => {
      const value = this._simulationOptions[key];
      return value === undefined ? [] : [`${name}=${format(value)}`];
    });
    if (this._temperature !== undefined) serializedOptions.push(`temp=${this._temperature}`);
    if (this._xspiceTrtol !== undefined) serializedOptions.push(`xtrtol=${this._xspiceTrtol}`);
    if (serializedOptions.length > 0) lines.push(`.options ${serializedOptions.join(' ')}`);

    for (const model of this._models.values()) {
      lines.push(formatModel(model));
    }
    for (const model of this._xspiceModels.values()) {
      lines.push(model.raw);
    }

    if (this._globalNodes.size > 0) lines.push(`.global ${this.globalNodes.join(' ')}`);
    // Top-level parameters only reach the output through subcircuit bodies.
    if (this._parameters.size > 0 && this._subcircuits.size > 0) lines.push(`.param ${formatParams(this.parameters)}`);
    for (const subckt of this._subcircuits.values()) {
      const params = formatSubcircuitParams(subckt.params);
      const header = `.subckt ${subckt.name} ${subckt.ports.join(' ')}${params ? ` ${params}` : ''}`;
      lines.push(header.trim());
      lines.push(...subckt.body);
      lines.push(`.ends ${subckt.name}`);
    }

    for (const desc of this.descriptors) {
      lines.push(formatDevice(desc));
    }

    if (this._initialConditions.length > 0) {
      lines.push(`.ic ${this._initialConditions.map(state => `V(${state.node})=${formatNumber(state.value)}`).join(' ')}`);
    }
    if (this._nodeSets.length > 0) {
      lines.push(`.nodeset ${this._nodeSets.map(state => `V(${state.node})=${formatNumber(state.value)}`).join(' ')}`);
    }

    for (const step of this._steps) {
      lines.push(formatStep(step));
    }

    for (const analysis of this._analyses) {
      lines.push(formatAnalysis(analysis));
    }
    for (const analysis of this._poleZeroAnalyses) {
      lines.push(formatAnalysis(analysis));
    }

    lines.push('.end');
    return lines.join('\n');
  }

  /**
   * Compile the circuit into a form ready for numerical simulation.
   *
   * Expands subcircuit instances, assigns node indices, instantiates device
   * models, and resolves model parameter cards.
   *
   * @returns A {@link CompiledCircuit} with device models and node/branch mappings
   * @throws Error if a referenced subcircuit or control source is undefined
   * @throws {@link CycleError} if subcircuit instances form a circular dependency
   */
  compile(guard?: ProtocolExecutionGuard): CompiledCircuit {
    // Pre-expand subcircuit instances into flat device descriptors
    const globalNodes = this.collectGlobalNodes(guard);
    const flatDescriptors = this.expandAllSubcircuits(globalNodes, guard);
    this.assertDeviceModelTypes(flatDescriptors);
    const expandedDescriptors = withRFPortNodes(this.expandPassiveParasitics(
      this.expandLossyTransmissionLines(flatDescriptors),
    ));
    guard?.maximum('maxComponents', expandedDescriptors.length, 'compile');
    if (
      expandedDescriptors.some(desc => desc.type === 'Z')
      && this._steps.some(step => step.param.toUpperCase() === 'TEMP')
    ) {
      throw new InvalidCircuitError("Unsupported bounded HFET step: 'TEMP'");
    }
    const hasNMF = expandedDescriptors.some(desc =>
      desc.type === 'Z' && this._models.get(desc.modelName!)?.type === 'NMF');
    if (hasNMF) {
      const unsupported = this._poleZeroAnalyses.length > 0
        ? 'pz'
        : this._analyses.find(analysis =>
          analysis.type !== 'op' && analysis.type !== 'dc' && analysis.type !== 'tran'
          && analysis.type !== 'ac')?.type;
      if (unsupported) {
        throw new InvalidCircuitError(
          `NMF MESFET supports only .op, .dc, .tran and .ac analyses; '.${unsupported}' is unsupported`,
        );
      }
    }

    const hasSwecLines = expandedDescriptors.some(desc => desc.type === 'Y' || desc.type === 'P');
    if (hasSwecLines) {
      // ngspice-47 TXL/CPL only define DC (series-resistance) and transient
      // behaviour; their AC load reuses the transient load.
      const unsupported = this._poleZeroAnalyses.length > 0
        ? 'pz'
        : this._analyses.find(analysis =>
          analysis.type !== 'op' && analysis.type !== 'dc' && analysis.type !== 'tran')?.type;
      if (unsupported) {
        throw new InvalidCircuitError(
          `TXL/CPL lossy lines (Y and P elements) support only .op, .dc and .tran analyses; '.${unsupported}' is unsupported`,
        );
      }
    }

    const hasBoundedVBIC = expandedDescriptors.some(desc =>
      desc.type === 'Q' && this._models.get(desc.modelName!)?.params.LEVEL === 4);
    if (hasBoundedVBIC) {
      const unsupportedStep = this._steps.find(step => step.param.toUpperCase() === 'TEMP');
      if (unsupportedStep) {
        throw new InvalidCircuitError("Unsupported bounded VBIC step: 'TEMP'");
      }
      // Bounded VBIC linearizes at the operating point (.ac/.pz) but has no
      // transient charge integration, noise sources, or distortion terms.
      const unsupported = this._analyses.find(analysis =>
        analysis.type !== 'op' && analysis.type !== 'dc' && analysis.type !== 'ac');
      if (unsupported) {
        throw new InvalidCircuitError(`Unsupported bounded VBIC analysis: '${unsupported.type}'`);
      }
    }

    // XSPICE A instances: their nodes follow from the code model's port table.
    const xspiceInstances = new Map<DeviceDescriptor, PreparedXspiceInstance>();
    for (const desc of expandedDescriptors) {
      if (desc.type !== 'A') continue;
      const prepared = prepareXspiceInstance(
        desc.xspice!,
        this._xspiceModels.get(desc.modelName!.toUpperCase()),
        this._models.has(desc.modelName!),
        GROUND_NODE,
      );
      desc.nodes = [...prepared.nodes];
      xspiceInstances.set(desc, prepared);
    }
    assertXspiceAnalyses(
      [...xspiceInstances.values()],
      [
        ...this._analyses.map(analysis => analysis.type),
        ...(this._poleZeroAnalyses.length > 0 ? ['pz'] : []),
      ],
    );

    // Only flattened device nodes belong in the matrix. In particular, a
    // .global name can override a formal port and leave its actual node unused.
    // Node names fold case as in ngspice (#728): the first spelling is kept.
    const globalNode = (name: string): string => globalNodes.get(name.toUpperCase()) ?? name;
    this.nodeSet.clear();
    for (const desc of expandedDescriptors) {
      for (const n of desc.nodes) {
        this.nodeSet.add(globalNode(n));
      }
    }
    const canonicalNode = (name: string): string => this.nodeSet.canonical(globalNode(name));

    // XSPICE digital nodes live in the event-driven network, not the matrix.
    // ngspice-47 would insert bridges where a digital node also touches an
    // analog device (evtcheck_nodes.c); that auto-bridging is not supported.
    const eventNetwork = buildXspiceEventNetwork([...xspiceInstances.values()]);
    if (eventNetwork) {
      const analogNodes = new Set([...this.nodeSet].map(n => n.toLowerCase()));
      for (const name of eventNetwork.network.nodeNames) {
        if (name === GROUND_NODE || analogNodes.has(name.toLowerCase())) {
          throw new InvalidCircuitError(
            `XSPICE digital node '${name}' is also an analog node; automatic analog/digital bridging is not supported`,
          );
        }
      }
    }

    const nodeNames = [...this.nodeSet].filter(n => n !== GROUND_NODE).sort();
    const nodeIndexMap = new Map<string, number>();
    nodeNames.forEach((name, i) => nodeIndexMap.set(name, i));
    nodeIndexMap.set(GROUND_NODE, -1);

    const nodeCount = nodeNames.length;
    let branchIndex = 0;
    const branchNames: string[] = [];

    const resolveNode = (name: string): number => {
      if (name === GROUND_NODE) return -1;
      return nodeIndexMap.get(canonicalNode(name))!;
    };

    const resolveWaveform = (wf?: Partial<SourceWaveform> & { dc?: number }): SourceWaveform => {
      if (!wf) return { type: 'dc', value: 0 };
      if (wf.type === 'ac') {
        return {
          type: 'ac',
          dc: wf.dc ?? 0,
          magnitude: wf.magnitude ?? 1,
          phase: wf.phase ?? 0,
          ...(wf.distortionF1 ? { distortionF1: { ...wf.distortionF1 } } : {}),
          ...(wf.distortionF2 ? { distortionF2: { ...wf.distortionF2 } } : {}),
        };
      }
      if (wf.type) return wf as SourceWaveform;
      const distortion = {
        ...(wf.distortionF1 ? { distortionF1: { ...wf.distortionF1 } } : {}),
        ...(wf.distortionF2 ? { distortionF2: { ...wf.distortionF2 } } : {}),
      };
      if (wf.dc !== undefined) return { type: 'dc', value: wf.dc, ...distortion };
      return { type: 'dc', value: 0, ...distortion };
    };

    const devices: DeviceModel[] = [];
    // Element names fold case as in ngspice: K, F/H, W and i() references (#754).
    const deviceMap = new CaseInsensitiveMap<DeviceModel>();
    // One random stream per compiled circuit for its TRNOISE/TRRANDOM sources (ngspice has one per process).
    const noiseContext = new TransientNoiseContext(this._simulationOptions.seed);
    const pendingCurrentSwitches: { device: CurrentSwitch; controlSource: string }[] = [];
    const pendingBehavioralSources: BehavioralSource[] = [];
    const ltraStates = new Map<string, LtraModelState>();
    // BSIM3 instances per ngspice model, in netlist order (b3v32temp.c pParam reuse, #700).
    const bsim3ModelInstances = new Map<string, BSIM3v3[]>();
    const pendingCouplings: DeviceDescriptor[] = [];

    for (const desc of expandedDescriptors) {
      guard?.checkpoint('compile:device');
      const nodeIndices = desc.nodes.map(resolveNode);
      const prevLength = devices.length;

      switch (desc.type) {
        case 'R': {
          const model = desc.modelName ? this.requireModel('Resistor', desc) : undefined;
          const resolved = resolveResistor(desc.name, desc.value, model, desc.params);
          // A zero-ohm resistor is an ideal voltage constraint, not infinite
          // conductance. Give it an MNA branch so its equation and current are
          // represented exactly. Stepped resistors also use branch form because
          // their value may cross zero without changing matrix topology.
          const usesBranch = resolved.resistance === 0 || this._steps.some(step =>
            step.param === desc.name || step.param.toUpperCase() === 'TEMP');
          const bi = usesBranch ? branchIndex++ : undefined;
          if (bi !== undefined) branchNames.push(desc.name);
          devices.push(new Resistor(desc.name, nodeIndices, resolved.resistance, bi, resolved.parameters));
          break;
        }
        case 'V': {
          const bi = branchIndex++;
          branchNames.push(desc.name);
          devices.push(new VoltageSource(
            desc.name, nodeIndices, bi, resolveWaveform(desc.waveform), desc.port, noiseContext,
          ));
          break;
        }
        case 'I':
          devices.push(new CurrentSource(
            desc.name, nodeIndices, resolveWaveform(desc.waveform), noiseContext, desc.multiplier,
          ));
          break;
        case 'C': {
          const model = desc.modelName ? this._models.get(desc.modelName) : undefined;
          if (desc.modelName && !model) {
            throw new InvalidCircuitError(`Capacitor '${desc.name}' references unknown model '${desc.modelName}'`);
          }
          const { value, unitValue } = resolveCapacitance(desc.value, model, desc.params);
          devices.push(new Capacitor(desc.name, nodeIndices, value, desc.ic, unitValue));
          break;
        }
        case 'L': {
          const model = desc.modelName ? this._models.get(desc.modelName) : undefined;
          if (desc.modelName && !model) {
            throw new InvalidCircuitError(`Inductor '${desc.name}' references unknown model '${desc.modelName}'`);
          }
          const { value, unitValue } = resolveInductance(desc.value, model, desc.params);
          const bi = branchIndex++;
          branchNames.push(desc.name);
          devices.push(new Inductor(desc.name, nodeIndices, bi, value, desc.ic, unitValue));
          break;
        }
        case 'K': {
          const indA = deviceMap.get(desc.coupledA!);
          const indB = deviceMap.get(desc.coupledB!);
          if (!(indA instanceof Inductor) || !(indB instanceof Inductor)) {
            // ngspice binds K after every instance exists (MUTsetup), so the
            // inductors may follow the K card; resolve those after the loop.
            pendingCouplings.push(desc);
            break;
          }
          devices.push(new MutualInductor(desc.name, indA, indB, desc.value!));
          break;
        }
        case 'T': {
          const firstBranch = branchIndex++;
          const secondBranch = branchIndex++;
          branchNames.push(`${desc.name}:1`, `${desc.name}:2`);
          devices.push(new TransmissionLine(
            desc.name,
            nodeIndices,
            firstBranch,
            secondBranch,
            desc.value!,
            desc.params!.TD,
          ));
          break;
        }
        case 'O': {
          const firstBranch = branchIndex++;
          const secondBranch = branchIndex++;
          branchNames.push(`${desc.name}:1`, `${desc.name}:2`);
          const modelName = desc.modelName!;
          let state = ltraStates.get(modelName);
          if (!state) {
            state = new LtraModelState(resolveLtraModel(this._models.get(modelName)!, {
              reltol: this._simulationOptions.reltol ?? 1e-3,
              abstol: this._simulationOptions.abstol ?? 1e-12,
            }));
            ltraStates.set(modelName, state);
          }
          devices.push(new LossyTransmissionLine(desc.name, nodeIndices, firstBranch, secondBranch, state));
          break;
        }
        case 'Y':
        case 'P': {
          const lines = desc.nodes.length / 2;
          const names = swecLineBranchNames(desc.name, desc.type, lines);
          const branches = names.map(() => branchIndex++);
          branchNames.push(...names);
          devices.push(createSwecLine(
            { name: desc.name, card: desc.type, nodes: nodeIndices, length: desc.params?.LEN },
            this._models.get(desc.modelName ?? ''),
            desc.modelName ?? '',
            branches,
          ));
          break;
        }
        case 'D': {
          const modelParams = desc.modelName ? this.requireModel('Diode', desc).params : {};
          const { RS: seriesResistanceOverride, ...instanceParams } = desc.params ?? {};
          const hasExpandedSeriesResistance = isPositiveFinite(modelParams.RS)
            && seriesResistanceOverride === 0;
          devices.push(new Diode(
            desc.name,
            nodeIndices,
            seriesResistanceOverride === undefined
              ? modelParams
              : { ...modelParams, RS: seriesResistanceOverride },
            hasExpandedSeriesResistance,
            instanceParams,
          ));
          break;
        }
        case 'Q': {
          const modelName = desc.modelName!;
          const model = this._models.get(modelName);
          if (!model && modelName !== '0') this.requireModel('BJT', desc);
          if (!model) {
            devices.push(new BJT(desc.name, nodeIndices, { polarity: 1 }, desc.params));
            break;
          }
          if (model.type !== 'NPN' && model.type !== 'PNP') {
            throw new Error(`Unsupported BJT model type: '${model.type}'`);
          }
          const modelParams = model.params;
          const polarity = model.type === 'PNP' ? -1 : 1;
          if (modelParams.LEVEL === 4) {
            // ngspice-47 vbic.c has no areab/areac instance parameters.
            const geometry = ['AREAB', 'AREAC'].filter(name => desc.params?.[name] !== undefined);
            if (geometry.length > 0) {
              throw new InvalidCircuitError(
                `VBIC '${desc.name}' does not accept instance parameters: ${geometry.join(', ')}`,
              );
            }
            devices.push(new VBIC(desc.name, nodeIndices, modelParams, polarity, bjtInstanceScale(desc.params)));
          } else {
            devices.push(new BJT(desc.name, nodeIndices, { ...modelParams, polarity }, desc.params));
          }
          break;
        }
        case 'J': {
          const model = this.requireModel('JFET', desc);
          if (model.type !== 'NJF' && model.type !== 'PJF') {
            throw new Error(`Unsupported JFET model type: '${model.type}'`);
          }
          // ngspice jfettemp.c/jfet2temp.c scale nothing at TEMP = TNOM = 27 C;
          // spice-ts has no JFET temperature law for any other value.
          const instanceTemperature = desc.params?.TEMP;
          if (instanceTemperature !== undefined && instanceTemperature !== NOMINAL_TEMPERATURE_C) {
            throw new UnsupportedTemperatureError(desc.name, instanceTemperature);
          }
          devices.push(new JFET(desc.name, nodeIndices, model.params, model.type === 'PJF' ? -1 : 1));
          break;
        }
        case 'Z': {
          const model = this.requireModel('Z-card', desc);
          devices.push(createZDevice(
            desc.name, nodeIndices, resolveZModel(model), desc.params, this._simulationOptions.gmin,
          ));
          break;
        }
        case 'B': {
          const compiledExpression = compileBehavioralExpression(desc.expression!);
          const { kind, params } = desc.behavioral!;
          if (kind === 'voltage') {
            const bi = branchIndex++;
            branchNames.push(desc.name);
            devices.push(new BehavioralVoltageSource(desc.name, nodeIndices, bi, compiledExpression, params));
          } else {
            devices.push(new BehavioralCurrentSource(desc.name, nodeIndices, compiledExpression, params));
          }
          // i() sources may be declared after the B-source; bind their branches below.
          if (compiledExpression.sources.length > 0) {
            pendingBehavioralSources.push(devices[devices.length - 1] as BehavioralSource);
          }
          break;
        }
        case 'M': {
          const model = this.requireModel('MOSFET', desc);
          if (isVdmosModelType(model.type)) {
            // Nodes were expanded to [D, G, S, D', G', S', B'] by expandPassiveParasitics.
            const { model: vdmosModel, warnings } = resolveVdmosModel(model);
            devices.push(new VDMOS(
              desc.name, nodeIndices, vdmosModel, vdmosInstanceParams(desc), warnings,
            ));
            break;
          }
          const modelParams = model.params;
          const polarity = model.type === 'PMOS' ? -1 : 1;
          const level = modelParams.LEVEL ?? 1;

          if (level === 49 || level === 8) {
            // #503/#594: VERSION=3.2.x runs the bsim3v32 revisions; 3.0/3.1 (BSIM3v0/v1) are not implemented.
            if (!isSupportedBsim3Version(model.version)) {
              throw new UnsupportedModelVersionError(
                desc.name, desc.modelName, level, model.version!, SUPPORTED_BSIM3_VERSIONS,
              );
            }
            // BSIM3v3 — 4-terminal
            const bulkNode = desc.nodes.length >= 4 ? desc.nodes[3] : desc.nodes[2]; // default bulk=source
            const nodeIdxs = [
              resolveNode(desc.nodes[0]),
              resolveNode(desc.nodes[1]),
              resolveNode(desc.nodes[2]),
              resolveNode(bulkNode),
            ];
            // Instance W/L/AD/AS/PD/PS/DELVTO/MULU0/M; b3set.c supplies the defaults.
            const bsim3 = new BSIM3v3(desc.name, nodeIdxs, modelParams, desc.params ?? {}, polarity, model.version);
            devices.push(bsim3);
            // A subcircuit-local card is a separate ngspice model per subcircuit instance.
            const modelName = model.name.toUpperCase();
            const scope = this._subcircuitModelNames.has(modelName)
              ? desc.name.slice(0, Math.max(0, desc.name.lastIndexOf('.'))) : '';
            const key = `${scope}\u0000${modelName}`;
            const group = bsim3ModelInstances.get(key);
            if (group) group.push(bsim3); else bsim3ModelInstances.set(key, [bsim3]);
          } else if (level === 6) {
            // MOS6 (Sakurai-Newton n-th power law) — 4-terminal, bulk defaults to source.
            const bulkNode = desc.nodes.length >= 4 ? desc.nodes[3] : desc.nodes[2];
            const nodeIdxs = [
              resolveNode(desc.nodes[0]),
              resolveNode(desc.nodes[1]),
              resolveNode(desc.nodes[2]),
              resolveNode(bulkNode),
            ];
            devices.push(new MOS6(
              desc.name, nodeIdxs,
              resolveMOS6Model(desc.modelName!, modelParams, polarity),
              desc.params ?? {},
            ));
          } else if (level === 4 || level === 5) {
            // BSIM1 (LEVEL=4) / BSIM2 (LEVEL=5); expandPassiveParasitics gave [D', G, S', B].
            const nodeIdxs = desc.nodes.map(resolveNode);
            devices.push(level === 4
              ? createBSIM1(desc.name, nodeIdxs, resolveBSIM1Model(desc.modelName!, modelParams, polarity), desc.params)
              : createBSIM2(desc.name, nodeIdxs, resolveBSIM2Model(desc.modelName!, modelParams, polarity), desc.params));
          } else if (level === 2) {
            // MOS2 (Grove-Frohman, ngspice mos2) — 4-terminal, bulk defaults to source.
            const bulkNode = desc.nodes.length >= 4 ? desc.nodes[3] : desc.nodes[2];
            const nodeIdxs = [
              resolveNode(desc.nodes[0]),
              resolveNode(desc.nodes[1]),
              resolveNode(desc.nodes[2]),
              resolveNode(bulkNode),
            ];
            devices.push(new MOS2(
              desc.name, nodeIdxs,
              resolveMOS2Model(desc.modelName!, modelParams, polarity),
              desc.params ?? {},
            ));
          } else if (level === 3 || level === 9) {
            // MOS3 / MOS9 (ngspice mos3, mos9); expandPassiveParasitics gave [D', G, S', B].
            devices.push(new MOS3(
              desc.name, desc.nodes.map(resolveNode),
              resolveMOS3Model(desc.modelName!, modelParams, polarity, level),
              desc.params ?? {},
            ));
          } else if (level === 1) {
            // Level 1 (ngspice mos1); bulk defaults to source.
            const bulkNode = desc.nodes.length >= 4 ? desc.nodes[3] : desc.nodes[2];
            const nodeIdxs = [
              resolveNode(desc.nodes[0]),
              resolveNode(desc.nodes[1]),
              resolveNode(desc.nodes[2]),
              resolveNode(bulkNode),
            ];
            devices.push(new MOSFET(desc.name, nodeIdxs, { ...modelParams, ...desc.params, polarity }));
          } else {
            // #530: never evaluate an unimplemented level (MOS3, BSIM1/2, ...) with Level-1 equations.
            throw new UnsupportedModelLevelError(desc.name, desc.modelName, level, SUPPORTED_MOSFET_LEVELS);
          }
          break;
        }
        case 'G': {
          devices.push(new VCCS(desc.name, nodeIndices, desc.value!));
          break;
        }
        case 'E': {
          const bi = branchIndex++;
          branchNames.push(desc.name);
          devices.push(new VCVS(desc.name, nodeIndices, bi, desc.value!));
          break;
        }
        case 'F': {
          const ctrlName = desc.controlSource!;
          const ctrlDev = deviceMap.get(ctrlName);
          if (!ctrlDev || ctrlDev.branches.length === 0) {
            throw new Error(
              `CCCS '${desc.name}' references unknown or branchless source '${ctrlName}'`,
            );
          }
          devices.push(new CCCS(desc.name, nodeIndices, ctrlDev.branches[0], desc.value!));
          break;
        }
        case 'H': {
          const ctrlName = desc.controlSource!;
          const ctrlDev = deviceMap.get(ctrlName);
          if (!ctrlDev || ctrlDev.branches.length === 0) {
            throw new Error(
              `CCVS '${desc.name}' references unknown or branchless source '${ctrlName}'`,
            );
          }
          const bi = branchIndex++;
          branchNames.push(desc.name);
          devices.push(new CCVS(desc.name, nodeIndices, ctrlDev.branches[0], bi, desc.value!));
          break;
        }
        case 'S':
        case 'W': {
          const type = desc.type === 'S' ? 'SW' : 'CSW';
          const model = this.requireModel(desc.type === 'S' ? 'Switch' : 'Current switch', desc);
          const { model: switchModel, warnings } = resolveSwitchModel(
            type, model.params, this._simulationOptions.gmin ?? DEVICE_GMIN,
          );
          const initiallyOn = desc.params?.ON === 1;
          if (desc.type === 'S') {
            devices.push(new VoltageSwitch(desc.name, nodeIndices, switchModel, initiallyOn, warnings));
          } else {
            // The controlling source may be declared after the switch; bind its branch below.
            const device = new CurrentSwitch(desc.name, nodeIndices, -1, switchModel, initiallyOn, warnings);
            pendingCurrentSwitches.push({ device, controlSource: desc.controlSource! });
            devices.push(device);
          }
          break;
        }
        case 'A': {
          const prepared = xspiceInstances.get(desc)!;
          const device = createXspiceDevice(prepared, resolveNode, branchName => {
            branchNames.push(branchName);
            return branchIndex++;
          }, eventNetwork?.analogHalves.get(prepared));
          if (device) devices.push(device);
          break;
        }
        default:
          throw new Error(`Device type '${desc.type}' not yet implemented`);
      }

      if (devices.length > prevLength) {
        deviceMap.set(desc.name, devices[devices.length - 1]);
      }
    }

    for (const desc of pendingCouplings) {
      const indA = deviceMap.get(desc.coupledA!);
      const indB = deviceMap.get(desc.coupledB!);
      if (!(indA instanceof Inductor) || !(indB instanceof Inductor)) {
        throw new Error(
          `K-element '${desc.name}' references unknown or non-inductor device(s): ${desc.coupledA}, ${desc.coupledB}`,
        );
      }
      devices.push(new MutualInductor(desc.name, indA, indB, desc.value!));
      deviceMap.set(desc.name, devices[devices.length - 1]);
    }

    if (eventNetwork) devices.push(eventNetwork.network);
    bindXspiceSources(devices, deviceMap);
    for (const instances of bsim3ModelInstances.values()) BSIM3v3.linkBsim3v32SizeRecordReuse(instances);
    for (const { device, controlSource } of pendingCurrentSwitches) {
      const control = deviceMap.get(controlSource);
      if (!control || !(control instanceof VoltageSource)) {
        throw new InvalidCircuitError(
          `W-element '${device.name}' references unknown or non-voltage-source control '${controlSource}'`,
        );
      }
      device.bindControlBranch(control.branches[0]);
    }
    bindBehavioralControlBranches(pendingBehavioralSources, deviceMap);

    if (this._temperature !== undefined && this._temperature !== NOMINAL_TEMPERATURE_C) {
      this.applyCircuitTemperature(this._temperature, expandedDescriptors, devices);
    }

    return {
      devices, nodeCount, branchCount: branchNames.length,
      nodeNames, nodeIndexMap, branchNames,
      analyses: this._analyses, poleZeroAnalyses: this._poleZeroAnalyses, models: this._models,
      subcircuits: this._subcircuits,
      steps: this._steps,
      simulationOptions: {
        ...this._simulationOptions,
        // ngspice cktdojob.c: with 'A' devices present, trtol above 1 becomes
        // the `xtrtol` variable (set by `.options XTRTOL=`) or else 1.
        ...(xspiceInstances.size > 0 && (this._simulationOptions.trtol ?? DEFAULT_OPTIONS.trtol) > 1
          ? { trtol: this._xspiceTrtol ?? 1 }
          : {}),
      },
      initialConditions: this._initialConditions.map(state => ({ ...state })),
      nodeSets: this._nodeSets.map(state => ({ ...state })),
    };
  }

  /**
   * Evaluate the compiled devices at a non-nominal `.options TEMP` like ngspice.
   * Only devices whose temperature model follows ngspice-47 are accepted:
   * resistors (TC1/TC2 around TNOM), the bounded VBIC (vbictemp.c mapping),
   * B sources (asrctemp.c tc1/tc2 and `temper`), diodes (diotemp.c), the
   * Gummel-Poon BJT (bjttemp.c), MOS level 1 (mos1temp.c) and BSIM3 (b3temp.c,
   * b3v32temp.c). Every other temperature-dependent element is rejected instead of silently
   * running at 27 C.
   */
  private applyCircuitTemperature(
    temperature: number,
    descriptors: DeviceDescriptor[],
    devices: DeviceModel[],
  ): void {
    const unsupported = (subject: string): InvalidCircuitError => new InvalidCircuitError(
      `.options TEMP=${temperature} is unsupported for ${subject}: `
      + `only resistors, bounded VBIC devices and B sources follow the ngspice temperature model`,
    );
    const noise = this._analyses.find(analysis => analysis.type === 'noise');
    if (noise) throw unsupported("'.noise' (noise sources are evaluated at 27 C)");

    for (const desc of descriptors) {
      if (desc.type === 'R' && (desc.params?.TEMP !== undefined || desc.params?.DTEMP !== undefined)) {
        throw unsupported(`resistor '${desc.name}' with an instance TEMP/DTEMP`);
      }
      if (desc.type === 'C' || desc.type === 'L') {
        const model = desc.modelName ? this._models.get(desc.modelName) : undefined;
        const params = { ...model?.params, ...desc.params };
        if (params.TEMP === undefined && ((params.TC1 ?? 0) !== 0 || (params.TC2 ?? 0) !== 0)) {
          throw unsupported(`temperature-coefficient ${desc.type === 'C' ? 'capacitor' : 'inductor'} '${desc.name}'`);
        }
      }
    }

    for (const device of devices) {
      if (device instanceof Resistor || device instanceof VBIC || device instanceof BehavioralSource
        || device instanceof Diode || device instanceof BJT || device instanceof MOSFET
        || device instanceof BSIM3v3) {
        device.setTemperature(temperature);
      } else if (device.isNonlinear) {
        throw new UnsupportedTemperatureError(device.name, temperature);
      }
    }
  }

  /** Top-level `.param` values as a prototype-free variable record for subcircuit scopes. */
  private parameterScope(): Record<string, number> {
    this._parameterScope ??= Object.assign(Object.create(null) as Record<string, number>, this.parameters);
    return this._parameterScope;
  }

  /** Collect top-level and reachable subcircuit `.global` declarations. */
  private collectGlobalNodes(guard?: ProtocolExecutionGuard): Map<string, string> {
    const globals = new Map(this._globalNodes);
    // ngspice removes unused definitions before collecting globals. Discover
    // the reachable definitions first, so declarations are independent of
    // instance order and take effect before any parent port is mapped.
    const pending = this.descriptors.filter(desc => desc.type === 'X').map(desc => desc.modelName!);
    const visited = new Set<string>();
    while (pending.length > 0) {
      guard?.checkpoint('compile:device');
      const name = pending.pop()!.toUpperCase();
      if (visited.has(name)) continue;
      visited.add(name);
      const def = this._subcircuits.get(name);
      if (!def) continue; // Expansion reports the undefined-subcircuit error.
      for (const { tokens } of tokenizeNetlist(def.body.join('\n'))) {
        if (tokens[0]?.toUpperCase() === '.GLOBAL') {
          for (const node of tokens.slice(1)) {
            const key = node.toUpperCase();
            if (node !== GROUND_NODE && !globals.has(key)) globals.set(key, node);
          }
        } else if (tokens[0]?.[0].toUpperCase() === 'X') {
          pending.push(tokens[locateSubcircuitCall(tokens).nameIndex]);
        }
      }
    }
    return globals;
  }

  /** Expand X instances; non-X descriptors pass through unchanged. */
  private expandAllSubcircuits(globalNodes: ReadonlyMap<string, string>, guard?: ProtocolExecutionGuard): DeviceDescriptor[] {
    const result: DeviceDescriptor[] = [];
    for (const desc of this.descriptors) {
      guard?.checkpoint('compile:device');
      if (desc.type === 'X') {
        const expanded = this.expandSubcircuit(
          desc.name,
          desc.nodes,
          desc.modelName!,
          desc.params ?? {},
          new Set<string>(),
          globalNodes,
          guard,
          1,
        );
        result.push(...expanded);
      } else {
        result.push(desc);
      }
      guard?.maximum('maxComponents', result.length, 'compile');
    }
    return result;
  }

  /**
   * Validate O/LTRA instances after subcircuit expansion. Model lookup happens
   * here, not at parse time, because O cards in uncalled subcircuits may name
   * undefined models.
   */
  private expandLossyTransmissionLines(descriptors: DeviceDescriptor[]): DeviceDescriptor[] {
    let hasLossyLine = false;
    for (const desc of descriptors) {
      if (desc.type !== 'O') continue;
      hasLossyLine = true;
      const [, inputReference, , outputReference] = desc.nodes;
      if (inputReference.toUpperCase() !== outputReference.toUpperCase()) {
        throw new Error(`Unsupported LTRA '${desc.name}': both ports must use a common reference node`);
      }
      const model = this._models.get(desc.modelName!);
      if (!model) throw new InvalidCircuitError(`LTRA '${desc.name}' references unknown model '${desc.modelName}'`);
      resolveLtraModel(model);
    }
    if (hasLossyLine) {
      // The LTRA small-signal response is not a polynomial in s, which the
      // G + sC frequency-domain assembly cannot represent.
      const unsupported = this._poleZeroAnalyses.length > 0
        ? 'pz'
        : this._analyses.find(analysis => !['op', 'dc', 'tran', 'tf'].includes(analysis.type))?.type;
      if (unsupported) {
        throw new InvalidCircuitError(`LTRA lossy lines support only .op, .dc, .tf and .tran analyses; '.${unsupported}' is unsupported`);
      }
    }
    return descriptors;
  }

  private expandPassiveParasitics(descriptors: DeviceDescriptor[]): DeviceDescriptor[] {
    const result: DeviceDescriptor[] = [];

    for (const desc of descriptors) {
      if (desc.type === 'C') {
        const model = desc.modelName ? this._models.get(desc.modelName) : undefined;
        if (desc.modelName && !model) {
          throw new InvalidCircuitError(`Capacitor '${desc.name}' references unknown model '${desc.modelName}'`);
        }
        const resolved = resolveCapacitorModel(desc.value, model, desc.params);
        if (hasCapacitorParasitics(resolved)) {
          result.push(...this.expandCapacitorDescriptor(desc, resolved));
        } else {
          result.push(desc);
        }
        continue;
      }

      if (desc.type === 'L') {
        const model = desc.modelName ? this._models.get(desc.modelName) : undefined;
        if (desc.modelName && !model) {
          throw new InvalidCircuitError(`Inductor '${desc.name}' references unknown model '${desc.modelName}'`);
        }
        const resolved = resolveInductorModel(desc.value, model, desc.params);
        if (hasInductorParasitics(resolved)) {
          result.push(...this.expandInductorDescriptor(desc, resolved));
        } else {
          result.push(desc);
        }
        continue;
      }

      if (desc.type === 'D') {
        const model = desc.modelName ? this._models.get(desc.modelName) : undefined;
        const seriesResistance = desc.params?.RS ?? model?.params.RS;
        const junctionCapacitance = model ? diodeZeroBiasCapacitance(desc.name, model.params) : undefined;
        const sidewallCapacitance = model?.params.CJSW ?? model?.params.CJP;
        const effectiveArea = (desc.params?.AREA ?? 1) * (desc.params?.M ?? 1);
        const effectivePerimeter = (desc.params?.PJ ?? 0) * (desc.params?.M ?? 1);
        const transitTime = desc.params?.TT ?? model?.params.TT;
        const hasJunctionCharge = isPositiveFinite(junctionCapacitance)
          || (isPositiveFinite(sidewallCapacitance) && effectivePerimeter > 0)
          || isPositiveFinite(transitTime);
        if (isPositiveFinite(seriesResistance) && hasJunctionCharge) {
          const [anode, cathode] = desc.nodes;
          const junction = internalNodeName(desc.name, 'rs');
          result.push({
            type: 'R',
            name: `${desc.name}.RS`,
            nodes: [anode, junction],
            value: seriesResistance / effectiveArea,
          });
          result.push({
            ...desc,
            nodes: [junction, cathode],
            params: { ...desc.params, RS: 0 },
          });
        } else {
          result.push(desc);
        }
        continue;
      }

      if (desc.type === 'Q') {
        const model = this._models.get(desc.modelName!);
        const isVBIC = (model?.type === 'NPN' || model?.type === 'PNP') && model.params.LEVEL === 4;
        if (desc.nodes.length > 4) {
          // ngspice-47 accepts a fifth (thermal) node only for VBIC/HICUM.
          throw new InvalidCircuitError(isVBIC
            ? `Unsupported VBIC thermal node on '${desc.name}': self-heating (5-terminal instance) is not implemented`
            : `BJT '${desc.name}' has a thermal node, but only VBIC (LEVEL=4) instances accept a fifth terminal`);
        }
        // VBIC and the Gummel-Poon BJT both stamp the substrate terminal
        // (ngspice bjtload.c substrate junction); omitted, it is ground.
        const terminals = isVBIC ? desc.nodes : desc.nodes.slice(0, 4);
        // ngspice-47 scales every series conductance by AREA*M (bjttemp.c
        // area, bjtload.c m; vbicload.c SCALE), i.e. divides the resistance.
        const instanceScale = bjtInstanceScale(desc.params);
        if (model?.type === 'NPN' || model?.type === 'PNP') {
          if (model.params.LEVEL === 4) {
            const polarity = model.type === 'PNP' ? -1 : 1;
            const params = resolveVBICParams(model.params, polarity);
            let [collector, base, emitter] = terminals;
            // Omitted substrate is ground, as in ngspice.
            const substrate = terminals[3] ?? GROUND_NODE;
            let collectorExternal = collector;
            let baseExternal = base;
            let emitterInternal = emitter;
            let substrateInternal = substrate;
            if (params.RCX > 0) {
              collectorExternal = internalNodeName(desc.name, 'cx');
              result.push({
                type: 'R', name: `${desc.name}.RCX`, nodes: [collector, collectorExternal],
                value: params.RCX / instanceScale,
              });
            }
            if (params.RBX > 0) {
              baseExternal = internalNodeName(desc.name, 'bx');
              result.push({
                type: 'R', name: `${desc.name}.RBX`, nodes: [base, baseExternal],
                value: params.RBX / instanceScale,
              });
            }
            if (params.RE > 0) {
              emitterInternal = internalNodeName(desc.name, 'ei');
              result.push({
                type: 'R', name: `${desc.name}.RE`, nodes: [emitter, emitterInternal],
                value: params.RE / instanceScale,
              });
            }
            if (params.RS > 0) {
              substrateInternal = internalNodeName(desc.name, 'si');
              result.push({
                type: 'R', name: `${desc.name}.RS`, nodes: [substrate, substrateInternal],
                value: params.RS / instanceScale,
              });
            }
            result.push({
              ...desc,
              nodes: [
                collectorExternal,
                internalNodeName(desc.name, 'ci'),
                baseExternal,
                internalNodeName(desc.name, 'bi'),
                emitterInternal,
                internalNodeName(desc.name, 'bp'),
                substrateInternal,
                ...(vbicNodeCount(params) > 7
                  ? [internalNodeName(desc.name, 'xf1'), internalNodeName(desc.name, 'xf2')]
                  : []),
              ],
            });
            continue;
          }
          let [collector, base, emitter] = terminals;
          // ngspice-47 bjtload.c: with RBM != RB the base resistance depends on
          // the bias, so the device stamps it on a fifth (external base) node.
          const variableBaseResistance = hasBiasDependentBaseResistance(model.params);
          const externalBase = base;
          for (const [parameter, terminal] of [
            ['RC', collector], ['RB', base], ['RE', emitter],
          ] as const) {
            const resistance = model.params[parameter];
            if (!isPositiveFinite(resistance)) continue;
            const internal = internalNodeName(desc.name, parameter.toLowerCase());
            if (parameter === 'RB' && variableBaseResistance) {
              base = internal;
              continue;
            }
            result.push({
              type: 'R', name: `${desc.name}.${parameter}`, nodes: [terminal, internal],
              value: resistance / instanceScale,
            });
            if (parameter === 'RC') collector = internal;
            else if (parameter === 'RB') base = internal;
            else emitter = internal;
          }
          result.push({
            ...desc,
            nodes: variableBaseResistance && base !== externalBase
              ? [collector, base, emitter, terminals[3] ?? GROUND_NODE, externalBase]
              : [collector, base, emitter, ...terminals.slice(3)],
          });
        } else {
          result.push({ ...desc, nodes: terminals });
        }
        continue;
      }

      if (desc.type === 'J') {
        const modelName = desc.modelName!;
        const model = this._models.get(modelName);
        if (!model) throw new InvalidCircuitError(`JFET '${desc.name}' references unknown model '${modelName}'`);
        if (model.type !== 'NJF' && model.type !== 'PJF') {
          throw new Error(`Unsupported JFET model type: '${model.type}'`);
        }
        const params = resolveNJFETParams(model.params);
        let [drain, gate, source] = desc.nodes;
        if (params.RD > 0) {
          const drainPrime = internalNodeName(desc.name, 'rd');
          result.push({
            type: 'R', name: `${desc.name}.RD`, nodes: [drain, drainPrime], value: params.RD,
          });
          drain = drainPrime;
        }
        if (params.RS > 0) {
          const sourcePrime = internalNodeName(desc.name, 'rs');
          result.push({
            type: 'R', name: `${desc.name}.RS`, nodes: [source, sourcePrime], value: params.RS,
          });
          source = sourcePrime;
        }
        result.push({ ...desc, nodes: [drain, gate, source] });
        continue;
      }

      if (desc.type === 'M') {
        const model = this._models.get(desc.modelName ?? '');
        if (model && isVdmosModelType(model.type)) {
          result.push(this.expandVdmosDescriptor(desc, model));
          continue;
        }
        const level = model?.params.LEVEL;
        if (model && (level === 4 || level === 5)) {
          // BSIM1/BSIM2 (b1set.c/b2set.c): RSH*NRD and RSH*NRS in front of prime nodes.
          const kind = level === 4 ? 'BSIM1' : 'BSIM2';
          const instance = resolveClassicBsimInstance(kind, desc.name, desc.params);
          const series = classicBsimSeriesResistances(model.params.RSH ?? 0, instance);
          let [drain, gate, source] = desc.nodes;
          const bulk = desc.nodes[3] ?? source;
          if (series.drain !== 0) {
            const prime = internalNodeName(desc.name, 'drain');
            result.push({ type: 'R', name: `${desc.name}.RD`, nodes: [drain, prime], value: series.drain });
            drain = prime;
          }
          if (series.source !== 0) {
            const prime = internalNodeName(desc.name, 'source');
            result.push({ type: 'R', name: `${desc.name}.RS`, nodes: [source, prime], value: series.source });
            source = prime;
          }
          result.push({ ...desc, nodes: [drain, gate, source, bulk] });
          continue;
        }
        if (model && (level === 8 || level === 49) && isSupportedBsim3Version(model.version)) {
          // BSIM3, every revision (b3set.c/b3v32set.c, acmMod = 0): RSH*NRD and RSH*NRS,
          // NRD = NRS = 1 square by default, in front of drain/source prime nodes (#691).
          const series = bsim3SeriesResistances(desc.name, model.params, desc.params);
          let [drain, gate, source] = desc.nodes;
          const bulk = desc.nodes[3] ?? source;
          if (series.drain !== 0) {
            const prime = internalNodeName(desc.name, 'drain');
            result.push({ type: 'R', name: `${desc.name}.RD`, nodes: [drain, prime], value: series.drain });
            drain = prime;
          }
          if (series.source !== 0) {
            const prime = internalNodeName(desc.name, 'source');
            result.push({ type: 'R', name: `${desc.name}.RS`, nodes: [source, prime], value: series.source });
            source = prime;
          }
          result.push({ ...desc, nodes: [drain, gate, source, bulk] });
          continue;
        }
        if (model && (level === 3 || level === 9)) {
          // mos3set.c/mos9set.c: RD/RS (or RSH*NRD, RSH*NRS) in front of prime nodes, conductance M/R.
          const series = mos3SeriesResistances(model.params, desc.params);
          let [drain, gate, source] = desc.nodes;
          const bulk = desc.nodes[3] ?? source;
          if (series.drain !== 0) {
            const prime = internalNodeName(desc.name, 'drain');
            result.push({ type: 'R', name: `${desc.name}.RD`, nodes: [drain, prime], value: series.drain });
            drain = prime;
          }
          if (series.source !== 0) {
            const prime = internalNodeName(desc.name, 'source');
            result.push({ type: 'R', name: `${desc.name}.RS`, nodes: [source, prime], value: series.source });
            source = prime;
          }
          result.push({ ...desc, nodes: [drain, gate, source, bulk] });
          continue;
        }
        if (model && (level === undefined || level === 1)) {
          // MOS1 (mos1set.c/mos1temp.c): RD/RS in front of the drain/source prime nodes, or
          // RSH*NRD / RSH*NRS (one square by default) when RD/RS are not given (#719). An open
          // terminal (#757) keeps its prime node but gets no resistor.
          const series = mos1SeriesResistances(model.params, desc.params);
          let [drain, gate, source] = desc.nodes;
          const bulk = desc.nodes[3] ?? source;
          if (series.drain === 0 && series.source === 0) {
            result.push(desc);
            continue;
          }
          if (series.drain !== 0) {
            const prime = internalNodeName(desc.name, 'drain');
            if (Number.isFinite(series.drain)) {
              result.push({ type: 'R', name: `${desc.name}.RD`, nodes: [drain, prime], value: series.drain });
            }
            drain = prime;
          }
          if (series.source !== 0) {
            const prime = internalNodeName(desc.name, 'source');
            if (Number.isFinite(series.source)) {
              result.push({ type: 'R', name: `${desc.name}.RS`, nodes: [source, prime], value: series.source });
            }
            source = prime;
          }
          result.push({ ...desc, nodes: [drain, gate, source, bulk] });
          continue;
        }
      }

      if (desc.type === 'Z') {
        const modelName = desc.modelName!;
        const model = this._models.get(modelName);
        if (!model) throw new InvalidCircuitError(`Z-card '${desc.name}' references unknown model '${modelName}'`);
        const expansion = expandZDevice(
          desc.name, [desc.nodes[0], desc.nodes[1], desc.nodes[2]], resolveZModel(model), desc.params,
          suffix => internalNodeName(desc.name, suffix),
        );
        for (const resistor of expansion.resistors) result.push({ type: 'R', ...resistor });
        result.push({ ...desc, nodes: expansion.nodes });
        continue;
      }

      result.push(desc);
    }

    return result;
  }

  /**
   * Give a VDMOS instance its inner nodes (vdmosset.c): D'/G'/S' behind
   * RD/RG/RS and the body diode anode B' behind RB, each equal to the external
   * node when its resistance is zero. The resistors are stamped by the device,
   * because quasi saturation makes RD bias dependent.
   */
  private expandVdmosDescriptor(desc: DeviceDescriptor, model: ModelParams): DeviceDescriptor {
    if (desc.nodes.length !== 3) {
      throw new InvalidCircuitError(
        `VDMOS '${desc.name}' has ${desc.nodes.length} terminals; only the 3-terminal (D G S) form is supported`
        + ' (the 5-terminal thermal form needs the self-heating network, which is not implemented)',
      );
    }
    const { model: resolved } = resolveVdmosModel(model);
    const [drain, gate, source] = desc.nodes;
    const inner = (resistance: number, terminal: string, suffix: string) =>
      (resistance > 0 ? internalNodeName(desc.name, suffix) : terminal);
    return {
      ...desc,
      nodes: [
        drain, gate, source,
        inner(resolved.rd, drain, 'drain'),
        inner(resolved.rg, gate, 'gate'),
        inner(resolved.rs, source, 'source'),
        inner(resolved.diode.rb, source, 'body_diode'),
      ],
    };
  }

  private expandCapacitorDescriptor(
    desc: DeviceDescriptor,
    model: ResolvedCapacitorModel,
  ): DeviceDescriptor[] {
    const [p, n] = desc.nodes;
    const result: DeviceDescriptor[] = [];

    if (isPositiveFinite(model.parallelResistance)) {
      result.push({
        type: 'R',
        name: `${desc.name}.RLEAK`,
        nodes: [p, n],
        value: model.parallelResistance,
      });
    }

    let left = p;
    if (isPositiveFinite(model.seriesInductance)) {
      const right = internalNodeName(desc.name, 'esl');
      result.push({
        type: 'L',
        name: `${desc.name}.ESL`,
        nodes: [left, right],
        value: model.seriesInductance,
      });
      left = right;
    }

    if (isPositiveFinite(model.seriesResistance)) {
      const right = internalNodeName(desc.name, 'esr');
      result.push({
        type: 'R',
        name: `${desc.name}.ESR`,
        nodes: [left, right],
        value: model.seriesResistance,
      });
      left = right;
    }

    result.push({
      type: 'C',
      name: desc.name,
      nodes: [left, n],
      value: model.capacitance,
      ic: desc.ic,
    });

    return result;
  }

  private expandInductorDescriptor(
    desc: DeviceDescriptor,
    model: ResolvedInductorModel,
  ): DeviceDescriptor[] {
    const [p, n] = desc.nodes;
    const result: DeviceDescriptor[] = [];

    if (isPositiveFinite(model.parallelResistance)) {
      result.push({
        type: 'R',
        name: `${desc.name}.RPAR`,
        nodes: [p, n],
        value: model.parallelResistance,
      });
    }

    if (isPositiveFinite(model.parallelCapacitance)) {
      result.push({
        type: 'C',
        name: `${desc.name}.CPAR`,
        nodes: [p, n],
        value: model.parallelCapacitance,
      });
    }

    let left = p;
    if (isPositiveFinite(model.seriesResistance)) {
      const right = internalNodeName(desc.name, 'rser');
      result.push({
        type: 'R',
        name: `${desc.name}.RSER`,
        nodes: [left, right],
        value: model.seriesResistance,
      });
      left = right;
    }

    result.push({
      type: 'L',
      name: desc.name,
      nodes: [left, n],
      value: model.inductance,
      ic: desc.ic,
    });

    return result;
  }

  /**
   * Recursively expand a single subcircuit instance into flat device descriptors.
   *
   * @param instanceName  e.g. "X1" or "X0.X1" for nested
   * @param connectedPorts  actual node names connected to this instance's ports
   * @param subcktName  name of the subcircuit definition to instantiate
   * @param instanceParams  parameter overrides from the X line
   * @param visited  set of subcircuit names currently being expanded (cycle detection)
   */
  /**
   * Resolve a device's `.model` card, raising {@link InvalidCircuitError} when
   * it is undefined. ngspice refuses such instances ("Unable to find definition
   * of model"); falling back to defaults would silently simulate a different device.
   */
  /**
   * Reject instances whose model belongs to another device kind (e.g. an M
   * card naming an NPN model), before any device-specific expansion (#544).
   * Unknown model names are left to the per-device resolution paths.
   */
  private assertDeviceModelTypes(descriptors: readonly DeviceDescriptor[]): void {
    for (const desc of descriptors) {
      if (!desc.modelName) continue;
      const model = this._models.get(desc.modelName);
      if (model) assertDeviceModelType(desc.type, desc.name, desc.modelName, model.type);
    }
  }

  private requireModel(kind: string, desc: DeviceDescriptor): ModelParams {
    const model = this._models.get(desc.modelName ?? '');
    if (!model) {
      throw new InvalidCircuitError(`${kind} '${desc.name}' references unknown model '${desc.modelName}'`);
    }
    return model;
  }

  /**
   * ngspice-47 inp2l.c / inp2c.c applied to an expanded subcircuit card: a
   * value-less L/C line is ignored with a warning. Returns true to drop it.
   * The warning is recorded once even when compile() runs repeatedly.
   */
  private dropInvalidPassiveInstance(
    devName: string,
    tokens: readonly string[],
    mapNode: (node: string) => string,
    kind: 'C' | 'L',
  ): boolean {
    const expanded = [devName, ...tokens.slice(1).map(node => mapNode(node))];
    const warning = invalidPassiveInstanceLine(expanded, kind);
    if (warning === undefined) return false;
    if (!this._parseWarnings.includes(warning)) this._parseWarnings.push(warning);
    return true;
  }

  private expandSubcircuit(
    instanceName: string,
    connectedPorts: string[],
    subcktName: string,
    instanceParams: Record<string, number>,
    visited: Set<string>,
    globalNodes: ReadonlyMap<string, string>,
    guard?: ProtocolExecutionGuard,
    depth = 1,
  ): DeviceDescriptor[] {
    guard?.maximum('maxSubcircuitDepth', depth, 'compile');
    const key = subcktName.toUpperCase();

    if (visited.has(key)) {
      throw new CycleError([...visited, key]);
    }

    const def = this._subcircuits.get(key);
    if (!def) {
      throw new Error(`Undefined subcircuit '${subcktName}'`);
    }

    if (connectedPorts.length !== def.ports.length) {
      throw new Error(
        `Subcircuit '${subcktName}' expects ${def.ports.length} port(s) but ${connectedPorts.length} provided`,
      );
    }

    // Build port-to-node mapping
    const portMap = new Map<string, string>();
    for (let i = 0; i < def.ports.length; i++) {
      portMap.set(def.ports[i].toUpperCase(), connectedPorts[i]);
    }

    // ngspice numparam scope: top-level .params, shadowed by the subcircuit's
    // parameters and the .params of its body.
    const localParams: Record<string, number> = Object.create(this.parameterScope()) as Record<string, number>;
    const overrides = new Map(Object.entries(instanceParams).map(([k, v]) => [k.toUpperCase(), v]));
    // Defaults are evaluated in declaration order after the instance
    // overrides, so `p2={p1*2}` follows an overridden p1 (ngspice-47).
    for (const [k, value] of Object.entries(def.params)) {
      const name = k.toUpperCase();
      const override = overrides.get(name);
      if (override !== undefined) {
        localParams[name] = override;
      } else if (typeof value === 'number') {
        localParams[name] = value;
      } else {
        try {
          localParams[name] = evaluateExpression(value, localParams);
        } catch (error) {
          throw new Error(
            `Subcircuit '${subcktName}' (instance '${instanceName}') parameter '${k}=${value}': ${(error as Error).message}`,
          );
        }
      }
    }
    const declared = new Set(Object.keys(def.params).map(k => k.toUpperCase()));
    for (const [name, value] of overrides) {
      if (!declared.has(name)) localParams[name] = value;
    }

    // Map a node name from the subcircuit body to the actual circuit node
    const mapNode = (bodyNode: string): string => {
      if (bodyNode === GROUND_NODE) return GROUND_NODE;
      const upper = bodyNode.toUpperCase();
      // A .global node is the top-level net, even when it names a port.
      const globalNode = globalNodes.get(upper);
      if (globalNode !== undefined) return globalNode;
      // If it's a port, map to the connected node
      if (portMap.has(upper)) return portMap.get(upper)!;
      // Otherwise it's an internal node — prefix with instance name
      return `${instanceName}.${bodyNode}`;
    };

    // Evaluate {expr} in a token using merged parameters
    // Handles both standalone {expr} and key={expr} patterns
    const evalToken = (token: string): string => {
      if (token.startsWith('{') && token.endsWith('}')) {
        const expr = token.slice(1, -1);
        return evaluateExpression(expr, localParams).toString();
      }
      const eqIdx = token.indexOf('=');
      if (eqIdx > 0) {
        const val = token.slice(eqIdx + 1);
        if (val.startsWith('{') && val.endsWith('}')) {
          const expr = val.slice(1, -1);
          return token.slice(0, eqIdx + 1) + evaluateExpression(expr, localParams).toString();
        }
      }
      return token;
    };

    const result: DeviceDescriptor[] = [];

    // Tokenize body lines
    const parsedLines = tokenizeNetlist(def.body.join('\n'));

    for (const { tokens, lineNumber, raw } of parsedLines) {
      guard?.checkpoint('compile:device');
      if (tokens.length === 0) continue;
      const first = tokens[0].toUpperCase();

      // Handle .model inside subcircuit — register locally AND globally
      if (first === '.MODEL') {
        const modelParams = parseTransmissionLineModelCard(tokens, 0)
          ?? parseModelCard(tokens, 0, message => this.addParseWarning(message));
        // Register in the circuit's global model map so compile() can find it
        this.registerModel(modelParams);
        this._subcircuitModelNames.add(modelParams.name.toUpperCase());
        continue;
      }

      // Handle .param inside subcircuit body
      if (first === '.PARAM') {
        const paramContent = tokens.slice(1).join(' ');
        const eqIdx = paramContent.indexOf('=');
        if (eqIdx > 0) {
          const name = paramContent.slice(0, eqIdx).trim().toUpperCase();
          let valStr = paramContent.slice(eqIdx + 1).trim();
          if (valStr.startsWith('{') && valStr.endsWith('}')) {
            valStr = valStr.slice(1, -1);
          }
          try {
            localParams[name] = evaluateExpression(valStr, localParams);
          } catch {
            localParams[name] = parseNumber(valStr);
          }
        }
        continue;
      }

      // Skip other dot commands (like .ends that leaked, etc.)
      if (first.startsWith('.')) continue;

      const devName = `${instanceName}.${tokens[0]}`;
      const devType = tokens[0][0].toUpperCase();

      switch (devType) {
        case 'R': {
          const evaluatedTokens = tokens.map(t => evalToken(t));
          const parsed = parseResistorElement(evaluatedTokens, lineNumber, raw);
          result.push({
            type: 'R', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            value: parsed.value,
            modelName: parsed.modelName,
            params: parsed.params,
          });
          break;
        }
        case 'C': {
          if (this.dropInvalidPassiveInstance(devName, tokens, mapNode, 'C')) break;
          const evaluatedTokens = tokens.map(t => evalToken(t));
          const parsed = parsePassiveElement(evaluatedTokens, 3, 'C');
          // IC= is the initial condition, as on a top-level card.
          const { IC: ic, ...params } = parsed.params;
          result.push({
            type: 'C', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            value: parsed.value,
            modelName: parsed.modelName,
            params,
            ...(ic === undefined ? {} : { ic }),
          });
          break;
        }
        case 'L': {
          if (this.dropInvalidPassiveInstance(devName, tokens, mapNode, 'L')) break;
          const evaluatedTokens = tokens.map(t => evalToken(t));
          const parsed = parsePassiveElement(evaluatedTokens, 3, 'L');
          // IC= is the initial condition, as on a top-level card.
          const { IC: ic, ...params } = parsed.params;
          result.push({
            type: 'L', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            value: parsed.value,
            modelName: parsed.modelName,
            params,
            ...(ic === undefined ? {} : { ic }),
          });
          break;
        }
        case 'V': {
          const mappedTokens = [devName, mapNode(tokens[1]), mapNode(tokens[2])];
          // Evaluate expressions in remaining tokens
          for (let i = 3; i < tokens.length; i++) {
            mappedTokens.push(evalToken(tokens[i]));
          }
          if (hasSourceMultiplier(mappedTokens, 3)) throw new Error(VOLTAGE_SOURCE_MULTIPLIER_ERROR);
          const { tokens: sourceTokens, port } = extractRFPort(mappedTokens, 3);
          const waveform = parseSourceWaveform(sourceTokens, 3);
          result.push({
            type: 'V', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            waveform,
            ...(port ? { port } : {}),
          });
          break;
        }
        case 'I': {
          const mappedTokens = [devName, mapNode(tokens[1]), mapNode(tokens[2])];
          for (let i = 3; i < tokens.length; i++) {
            mappedTokens.push(evalToken(tokens[i]));
          }
          const { tokens: sourceTokens, multiplier } = extractSourceMultiplier(mappedTokens, 3);
          const waveform = parseSourceWaveform(sourceTokens, 3);
          result.push({
            type: 'I', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            waveform,
            ...(multiplier === undefined ? {} : { multiplier }),
          });
          break;
        }
        case 'O': {
          if (tokens.length !== 6) {
            throw new Error(`Unsupported LTRA O-card '${tokens.join(' ')}'`);
          }
          if (tokens[2].toUpperCase() !== tokens[4].toUpperCase()) {
            throw new Error(`Unsupported LTRA '${devName}': both ports must use a common reference node`);
          }
          result.push({
            type: 'O',
            name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3]), mapNode(tokens[4])],
            modelName: tokens[5],
          });
          break;
        }
        case 'Y':
        case 'P': {
          const parsed = devType === 'Y'
            ? (() => {
              const line = parseTxlLine(tokens, lineNumber);
              return { inputs: [line.input], outputs: [line.output], modelName: line.modelName, length: line.length };
            })()
            : parseCplLines(tokens, lineNumber);
          result.push({
            type: devType,
            name: devName,
            nodes: [...parsed.inputs.map(mapNode), ...parsed.outputs.map(mapNode)],
            modelName: parsed.modelName,
            ...(parsed.length === undefined ? {} : { params: { LEN: parsed.length } }),
          });
          break;
        }
        case 'D': {
          const modelName = tokens[3];
          const evaluatedTokens = tokens.map(t => evalToken(t));
          result.push({
            type: 'D', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            modelName,
            params: { ...parseDiodeInstanceParams(evaluatedTokens, 4) },
          });
          break;
        }
        case 'Q': {
          // AREA/M may be {params}; node and model tokens are never braced.
          const instance = parseBJTInstance(tokens.map(t => evalToken(t)), lineNumber);
          const nodes = [instance.collector, instance.base, instance.emitter];
          if (instance.substrate !== undefined) nodes.push(instance.substrate);
          if (instance.thermal !== undefined) nodes.push(instance.thermal);
          const params = bjtInstanceDescriptorParams(instance.params);
          result.push({
            type: 'Q', name: devName,
            nodes: nodes.map(mapNode),
            modelName: instance.modelName,
            ...(params ? { params } : {}),
          });
          break;
        }
        case 'J': {
          // TEMP may be a {param}; node and model tokens are never braced.
          const instance = parseJFETInstance(tokens.map(t => evalToken(t)), lineNumber);
          result.push({
            type: 'J', name: devName,
            nodes: [instance.drain, instance.gate, instance.source].map(mapNode),
            modelName: instance.modelName,
            ...(instance.params ? { params: { ...instance.params } } : {}),
          });
          break;
        }
        case 'Z': {
          const evaluatedTokens = tokens.map(t => evalToken(t));
          const parsed = parseZInstance(evaluatedTokens, lineNumber, raw);
          result.push({
            type: 'Z',
            name: devName,
            nodes: parsed.nodes.map(mapNode),
            modelName: parsed.modelName,
            params: parsed.params,
          });
          break;
        }
        case 'M': {
          let modelName: string;
          let instanceParamStart: number;
          let bulkNode: string | undefined;
          if (tokens[5] && !tokens[5].includes('=')) {
            bulkNode = mapNode(tokens[4]);
            modelName = tokens[5];
            instanceParamStart = 6;
          } else {
            modelName = tokens[4];
            instanceParamStart = 5;
          }
          // Evaluate {expr} in instance params
          const evaluatedTokens = tokens.map(t => evalToken(t));
          const mParams = parseInstanceParams(evaluatedTokens, instanceParamStart);
          const nodes = bulkNode
            ? [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3]), bulkNode]
            : [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3])];
          result.push({
            type: 'M', name: devName, nodes, modelName, params: mParams,
          });
          break;
        }
        case 'E': {
          const valStr = evalToken(tokens[5]);
          result.push({
            type: 'E', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3]), mapNode(tokens[4])],
            value: parseNumber(valStr),
          });
          break;
        }
        case 'G': {
          const valStr = evalToken(tokens[5]);
          result.push({
            type: 'G', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3]), mapNode(tokens[4])],
            value: parseNumber(valStr),
          });
          break;
        }
        case 'B': {
          // ngspice's numparam front end substitutes parameters into B expressions.
          const card = parseBehavioralSourceCard(substituteBehavioralParameters(raw, localParams), lineNumber);
          result.push(behavioralDescriptor(
            devName,
            mapNode(card.nodes[0]),
            mapNode(card.nodes[1]),
            card.kind,
            mapBehavioralNodes(card.expression, mapNode, source => `${instanceName}.${source}`),
            card.params,
          ));
          break;
        }
        case 'H': {
          const valStr = evalToken(tokens[4]);
          result.push({
            type: 'H', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            controlSource: `${instanceName}.${tokens[3]}`,
            value: parseNumber(valStr),
          });
          break;
        }
        case 'F': {
          const valStr = evalToken(tokens[4]);
          result.push({
            type: 'F', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            controlSource: `${instanceName}.${tokens[3]}`,
            value: parseNumber(valStr),
          });
          break;
        }
        case 'K': {
          // ngspice prefixes the coupled inductor names with the instance path,
          // so a K card only reaches inductors of its own instance (#739).
          if (tokens.length < 4) {
            throw new ParseError(`K-element '${tokens[0]}' needs two inductors and a coupling`, lineNumber, raw);
          }
          result.push({
            type: 'K', name: devName, nodes: [],
            value: parseNumber(evalToken(tokens[3])),
            coupledA: `${instanceName}.${tokens[1]}`,
            coupledB: `${instanceName}.${tokens[2]}`,
          });
          break;
        }
        case 'S':
        case 'W': {
          const instance = parseSwitchInstance(tokens, lineNumber);
          result.push({
            type: devType, name: devName,
            nodes: instance.nodes.map(mapNode),
            modelName: instance.modelName,
            ...(instance.controlSource === undefined
              ? {} : { controlSource: `${instanceName}.${instance.controlSource}` }),
            ...(instance.initiallyOn ? { params: { ON: 1 } } : {}),
          });
          break;
        }
        case 'X': {
          // Nested subcircuit instance — recursively expand
          const call = locateSubcircuitCall(tokens);
          const nestedSubcktName = tokens[call.nameIndex];
          const nestedPorts = tokens.slice(1, call.nameIndex).map(mapNode);
          const evaluatedTokens = tokens.map(t => evalToken(t));
          const nestedParams = parseInstanceParams(evaluatedTokens, call.paramStart);

          const newVisited = new Set(visited);
          newVisited.add(key);

          const nested = this.expandSubcircuit(
            devName,
            nestedPorts,
            nestedSubcktName,
            nestedParams,
            newVisited,
            globalNodes,
            guard,
            depth + 1,
          );
          result.push(...nested);
          break;
        }
        default:
          throw new ParseError(`Unsupported device card: '${devType}'`, lineNumber, raw);
      }
      guard?.maximum('maxComponents', result.length, 'compile');
    }

    return result;
  }
}
