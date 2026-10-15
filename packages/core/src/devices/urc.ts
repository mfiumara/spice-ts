import { InvalidCircuitError, ParseError } from '../errors.js';
import type { ModelParams } from '../types.js';
import { parseNumber } from '../parser/tokenizer.js';

export interface UrcDevice {
  type: string;
  name: string;
  nodes: string[];
  value?: number;
  modelName?: string;
  params?: Record<string, number>;
}

const MODEL_KEYS = new Set(['K', 'FMAX', 'RPERL', 'CPERL', 'ISPERL', 'RSPERL']);

/** Shared by model cards and U cards, including subcircuit bodies. */
export function parseUrcParams(tokens: string[], line: number, model = false): Record<string, number> {
  const raw = tokens.join(' ');
  const fields = (model ? raw.replace(/[()]/g, ' ') : raw).replace(/\s*=\s*/g, '=').trim().split(/\s+/).filter(Boolean);
  const params: Record<string, number> = {};
  for (const field of fields) {
    const [rawKey, value, extra] = field.toUpperCase().split('=');
    // ngspice spells URClumps as N; accept LUMPS as an API/netlist alias.
    const key = !model && rawKey === 'N' ? 'LUMPS' : rawKey;
    if (!(model ? MODEL_KEYS.has(key) : key === 'L' || key === 'LUMPS') || !value || extra !== undefined || key in params) {
      throw new ParseError(`Unsupported or duplicate URC parameter '${field}'`, line, raw);
    }
    let number: number;
    try { number = parseNumber(value); } catch {
      throw new ParseError(`Invalid URC parameter '${field}'`, line, raw);
    }
    if (!Number.isFinite(number) || number < 0
      || (['K', 'FMAX', 'RPERL', 'L', 'LUMPS'].includes(key) && number === 0)
      || (key === 'K' && number <= 1)
      || (key === 'LUMPS' && (!Number.isInteger(number) || number > 1000))) {
      throw new ParseError(`Invalid URC parameter '${field}'`, line, raw);
    }
    params[key] = number;
  }
  if (!model && params.L === undefined) throw new ParseError('URC requires L', line, raw);
  return params;
}

/** ngspice-47 urcsetup.c: symmetric geometric RC ladder, 2N resistors / 2N-1 shunts. */
export function expandUrc(name: string, nodes: string[], params: Record<string, number>, model: ModelParams): {
  devices: UrcDevice[]; model?: ModelParams;
} {
  const p = model.params.K ?? 1.5;
  const length = params.L;
  const r0 = length * (model.params.RPERL ?? 1000);
  const c0 = length * (model.params.CPERL ?? 1e-12);
  const wnorm = (model.params.FMAX ?? 1e9) * r0 * c0 * 2 * Math.PI;
  const lumps = params.LUMPS ?? (wnorm < 35 ? 3 : Math.trunc(Math.max(3,
    Math.log(wnorm * ((p - 1) / p) ** 2) / Math.log(p))));
  if (!Number.isFinite(lumps) || lumps < 1 || lumps > 1000) {
    throw new InvalidCircuitError(`URC '${name}' requires between 1 and 1000 lumps`);
  }
  const r1 = r0 * (p - 1) / (2 * p ** lumps - 2);
  const denominator = p ** (lumps - 1) * (p + 1) - 2;
  const c1 = c0 * (p - 1) / denominator;
  if (![r0, c0, r1, c1, p ** lumps].every(Number.isFinite) || r1 <= 0) {
    throw new InvalidCircuitError(`URC '${name}' ladder values are outside the finite numeric range`);
  }
  const diode = model.params.ISPERL !== undefined;
  const diodeModel: ModelParams | undefined = diode ? {
    name: `${name}:diodemod`, type: 'D', params: {
      CJO: c1, IS: length * model.params.ISPERL * (p - 1) / denominator,
      RS: length * lumps * (model.params.RSPERL ?? 0),
    },
  } : undefined;
  const devices: UrcDevice[] = [];
  let [left, right] = nodes;
  for (let i = 1; i <= lumps; i++) {
    const lo = i === lumps ? `${name}:hi${i}` : `${name}:lo${i}`;
    const hi = `${name}:hi${i}`;
    const area = p ** (i - 1);
    devices.push({ type: 'R', name: `${name}:rlo${i}`, nodes: [left, lo], value: area * r1 },
      { type: 'R', name: `${name}:rhi${i}`, nodes: [hi, right], value: area * r1 });
    for (const [side, node] of (i === lumps ? [['lo', lo]] : [['lo', lo], ['hi', hi]])) {
      devices.push(diodeModel
        ? { type: 'D', name: `${name}:d${side}${i}`, nodes: [node, nodes[2]], modelName: diodeModel.name, params: { AREA: area } }
        : { type: 'C', name: `${name}:c${side}${i}`, nodes: [node, nodes[2]], value: area * c1 });
    }
    left = lo;
    right = hi;
  }
  return { devices, model: diodeModel };
}
