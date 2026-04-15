import type { CircuitIR, IRComponent, IRPort, ComponentType } from './types.js';
import type { SourceWaveform, ModelParams } from '../types.js';
import { GROUND_NODE } from '../types.js';

/**
 * Device descriptor — mirrors the private interface in circuit.ts.
 * Duplicated here to avoid exposing circuit internals.
 */
export interface DeviceDescriptor {
  type: string;
  name: string;
  nodes: string[];
  value?: number;
  waveform?: Partial<SourceWaveform> & { dc?: number };
  modelName?: string;
  params?: Record<string, number>;
  controlSource?: string;
}

/* ------------------------------------------------------------------ */
/*  Port mapping tables                                               */
/* ------------------------------------------------------------------ */

const TWO_TERMINAL = ['p', 'n'] as const;

const PORT_NAMES: Record<string, readonly string[]> = {
  R: TWO_TERMINAL,
  C: TWO_TERMINAL,
  L: TWO_TERMINAL,
  V: TWO_TERMINAL,
  I: TWO_TERMINAL,
  D: ['anode', 'cathode'],
  Q: ['collector', 'base', 'emitter'],
  // M handled specially (3 or 4 nodes)
  E: ['ctrlP', 'ctrlN', 'outP', 'outN'],
  G: ['ctrlP', 'ctrlN', 'outP', 'outN'],
  H: ['outP', 'outN'],
  F: ['outP', 'outN'],
  // X handled specially (variable port count)
};

/* ------------------------------------------------------------------ */
/*  SI formatting                                                     */
/* ------------------------------------------------------------------ */

const SI_PREFIXES: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'u'],
  [1e-9, 'n'],
  [1e-12, 'p'],
  [1e-15, 'f'],
];

function formatSI(value: number, suffix = ''): string {
  if (value === 0) return `0${suffix}`;
  const abs = Math.abs(value);
  for (const [threshold, prefix] of SI_PREFIXES) {
    if (abs >= threshold * 0.9999) {
      const scaled = value / threshold;
      // Avoid trailing zeros: use toPrecision then strip
      const num = Number.isInteger(scaled) ? String(scaled) : parseFloat(scaled.toPrecision(4)).toString();
      return `${num}${prefix}${suffix}`;
    }
  }
  // Smaller than femto — use scientific notation
  return `${value.toExponential()}${suffix}`;
}

/* ------------------------------------------------------------------ */
/*  Waveform flattening                                               */
/* ------------------------------------------------------------------ */

function flattenWaveform(wf: Partial<SourceWaveform> & { dc?: number } | undefined): Record<string, number | string> {
  if (!wf) {
    return { waveform: 'dc', dc: 0 };
  }

  const typed = wf as Record<string, unknown>;

  // Has an explicit type field (DCSource, SinSource, PulseSource, ACSource)
  if (typed.type) {
    switch (typed.type) {
      case 'dc':
        return { waveform: 'dc', dc: (typed.value as number) ?? 0 };
      case 'sin': {
        const result: Record<string, number | string> = {
          waveform: 'sin',
          offset: typed.offset as number,
          amplitude: typed.amplitude as number,
          frequency: typed.frequency as number,
        };
        if (typed.delay !== undefined) result.delay = typed.delay as number;
        if (typed.damping !== undefined) result.damping = typed.damping as number;
        if (typed.phase !== undefined) result.phase = typed.phase as number;
        return result;
      }
      case 'pulse': {
        return {
          waveform: 'pulse',
          v1: typed.v1 as number,
          v2: typed.v2 as number,
          delay: typed.delay as number,
          rise: typed.rise as number,
          fall: typed.fall as number,
          width: typed.width as number,
          period: typed.period as number,
        };
      }
      case 'ac': {
        return {
          waveform: 'ac',
          magnitude: typed.magnitude as number,
          phase: typed.phase as number,
        };
      }
      default:
        return { waveform: 'dc', dc: 0 };
    }
  }

  // No type but has dc value
  if (typed.dc !== undefined) {
    return { waveform: 'dc', dc: typed.dc as number };
  }

  // Fallback
  return { waveform: 'dc', dc: 0 };
}

/* ------------------------------------------------------------------ */
/*  Display value formatting                                          */
/* ------------------------------------------------------------------ */

function waveformDisplayValue(params: Record<string, number | string>): string {
  switch (params.waveform) {
    case 'dc':
      return `DC ${params.dc}`;
    case 'sin':
      return `SIN ${params.amplitude} ${formatSI(params.frequency as number)}Hz`;
    case 'pulse':
      return `PULSE ${params.v1}/${params.v2}`;
    case 'ac':
      return `AC ${params.magnitude}`;
    default:
      return 'DC 0';
  }
}

function buildDisplayValue(
  desc: DeviceDescriptor,
  componentParams: Record<string, number | string>,
): string | undefined {
  switch (desc.type) {
    case 'R':
      return formatSI(desc.value ?? 0);
    case 'C':
      return formatSI(desc.value ?? 0, 'F');
    case 'L':
      return formatSI(desc.value ?? 0, 'H');
    case 'V':
    case 'I':
      return waveformDisplayValue(componentParams);
    case 'D':
    case 'Q':
      return desc.modelName ?? undefined;
    case 'M': {
      let display = desc.modelName ?? '';
      if (desc.params?.W !== undefined || desc.params?.L !== undefined) {
        const parts: string[] = [];
        if (desc.params?.W !== undefined) parts.push(`W=${formatSI(desc.params.W)}`);
        if (desc.params?.L !== undefined) parts.push(`L=${formatSI(desc.params.L)}`);
        display += ` ${parts.join(' ')}`;
      }
      return display.trim() || undefined;
    }
    case 'E':
    case 'G':
    case 'H':
    case 'F':
      return desc.value !== undefined ? String(desc.value) : undefined;
    case 'X':
      return desc.modelName ?? undefined;
    default:
      return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  Port building                                                     */
/* ------------------------------------------------------------------ */

function buildPorts(desc: DeviceDescriptor): IRPort[] {
  if (desc.type === 'M') {
    const names = desc.nodes.length >= 4
      ? ['drain', 'gate', 'source', 'bulk']
      : ['drain', 'gate', 'source'];
    return desc.nodes.map((net, i) => ({ name: names[i], net }));
  }

  if (desc.type === 'X') {
    return desc.nodes.map((net, i) => ({ name: `port${i + 1}`, net }));
  }

  if (desc.type === 'E' || desc.type === 'G') {
    // SPICE order: outP outN ctrlP ctrlN
    // Symbol order: ctrlP ctrlN outP outN (inputs left, output right)
    const [outP, outN, ctrlP, ctrlN] = desc.nodes;
    return [
      { name: 'ctrlP', net: ctrlP },
      { name: 'ctrlN', net: ctrlN },
      { name: 'outP', net: outP },
      { name: 'outN', net: outN },
    ];
  }

  const names = PORT_NAMES[desc.type];
  if (names) {
    return desc.nodes.map((net, i) => ({ name: names[i] ?? `port${i + 1}`, net }));
  }

  // Fallback for unknown types
  return desc.nodes.map((net, i) => ({ name: `port${i + 1}`, net }));
}

/* ------------------------------------------------------------------ */
/*  Param building                                                    */
/* ------------------------------------------------------------------ */

function buildParams(
  desc: DeviceDescriptor,
  models: Map<string, ModelParams>,
): Record<string, number | string | boolean> {
  switch (desc.type) {
    case 'R':
      return { resistance: desc.value ?? 0 };
    case 'C':
      return { capacitance: desc.value ?? 0 };
    case 'L':
      return { inductance: desc.value ?? 0 };
    case 'V':
    case 'I':
      return flattenWaveform(desc.waveform);
    case 'D':
      return { modelName: desc.modelName ?? '' };
    case 'Q': {
      const model = desc.modelName ? models.get(desc.modelName) : undefined;
      const bjtType = model ? model.type.toLowerCase() : 'npn';
      return { modelName: desc.modelName ?? '', type: bjtType };
    }
    case 'M': {
      const model = desc.modelName ? models.get(desc.modelName) : undefined;
      const channelType = model
        ? (model.type.toUpperCase().startsWith('P') ? 'p' : 'n')
        : 'n';
      const result: Record<string, number | string | boolean> = {
        modelName: desc.modelName ?? '',
        channelType,
      };
      if (desc.params) {
        for (const [k, v] of Object.entries(desc.params)) {
          result[k] = v;
        }
      }
      return result;
    }
    case 'E':
      return { gain: desc.value ?? 0 };
    case 'G':
      return { gm: desc.value ?? 0 };
    case 'H':
      return { gain: desc.value ?? 0, controlSource: desc.controlSource ?? '' };
    case 'F':
      return { gain: desc.value ?? 0, controlSource: desc.controlSource ?? '' };
    case 'X': {
      const result: Record<string, number | string | boolean> = {
        subcircuit: desc.modelName ?? '',
      };
      if (desc.params) {
        for (const [k, v] of Object.entries(desc.params)) {
          result[k] = v;
        }
      }
      return result;
    }
    default:
      return {};
  }
}

/* ------------------------------------------------------------------ */
/*  Main builder                                                      */
/* ------------------------------------------------------------------ */

/**
 * Build an intermediate representation (IR) from device descriptors and model definitions.
 *
 * @param descriptors - Flat list of device descriptors from the Circuit class
 * @param models - Model parameter cards (`.model`)
 * @returns A {@link CircuitIR} with components and net names
 */
export function buildIR(
  descriptors: DeviceDescriptor[],
  models: Map<string, ModelParams>,
): CircuitIR {
  const components: IRComponent[] = [];
  const netSet = new Set<string>();

  for (const desc of descriptors) {
    const ports = buildPorts(desc);
    const params = buildParams(desc, models);
    const displayValue = buildDisplayValue(desc, params as Record<string, number | string>);

    const component: IRComponent = {
      type: desc.type as ComponentType,
      id: desc.name,
      name: desc.name,
      ports,
      params,
    };

    if (displayValue !== undefined) {
      component.displayValue = displayValue;
    }

    components.push(component);

    // Collect nets (exclude ground)
    for (const port of ports) {
      if (port.net !== GROUND_NODE) {
        netSet.add(port.net);
      }
    }
  }

  const nets = [...netSet].sort();

  return { components, nets };
}
