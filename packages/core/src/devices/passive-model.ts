import type { ModelParams } from '../types.js';

const DEFAULT_TEMP_C = 27;
const EPSILON_0 = 8.854214871e-12;
const EPSILON_SIO2 = 3.4531479969e-11;
const MU_0 = 1.25663706143592e-6;

export interface ResolvedPassiveValue {
  value: number;
  params: Record<string, number>;
}

export interface ResolvedCapacitorModel extends ResolvedPassiveValue {
  capacitance: number;
  seriesResistance: number;
  seriesInductance: number;
  parallelResistance: number;
}

export interface ResolvedInductorModel extends ResolvedPassiveValue {
  inductance: number;
  seriesResistance: number;
  parallelResistance: number;
  parallelCapacitance: number;
}

function mergedParams(
  model: ModelParams | undefined,
  instanceParams: Record<string, number> | undefined,
): Record<string, number> {
  return { ...(model?.params ?? {}), ...(instanceParams ?? {}) };
}

function scale(params: Record<string, number>): number {
  return params.SCALE ?? 1;
}

function multiplicity(params: Record<string, number>): number {
  return params.M ?? 1;
}

function multiplicityDivisor(params: Record<string, number>): number {
  const m = multiplicity(params);
  return m === 0 ? 1 : m;
}

function parallelScale(params: Record<string, number>): number {
  const value = scale(params) * multiplicity(params);
  return value === 0 ? 1 : value;
}

function temperatureFactor(params: Record<string, number>): number {
  const tnom = params.TNOM ?? DEFAULT_TEMP_C;
  const temp = params.TEMP ?? (DEFAULT_TEMP_C + (params.DTEMP ?? 0));
  const delta = temp - tnom;
  const tc1 = params.TC1 ?? 0;
  const tc2 = params.TC2 ?? 0;
  return 1 + tc1 * delta + tc2 * delta * delta;
}

function modelTypeMatches(model: ModelParams | undefined, expected: string): boolean {
  if (!model) return true;
  return model.type.toUpperCase() === expected;
}

function finitePositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function firstParam(params: Record<string, number>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = params[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function scaledCapSeries(value: number | undefined, params: Record<string, number>): number {
  if (!finitePositive(value)) return 0;
  return value / parallelScale(params);
}

function scaledCapParallelResistance(value: number | undefined, params: Record<string, number>): number {
  if (!finitePositive(value)) return Infinity;
  return value / parallelScale(params);
}

function scaledInductorSeriesResistance(value: number | undefined, params: Record<string, number>): number {
  if (!finitePositive(value)) return 0;
  return value * scale(params) / multiplicityDivisor(params);
}

function scaledInductorParallelResistance(value: number | undefined, params: Record<string, number>): number {
  if (!finitePositive(value)) return Infinity;
  return value / multiplicityDivisor(params);
}

function scaledInductorParallelCapacitance(value: number | undefined, params: Record<string, number>): number {
  if (!finitePositive(value)) return 0;
  return value * scale(params) * multiplicityDivisor(params);
}

function conductanceToResistance(value: number | undefined): number | undefined {
  return finitePositive(value) ? 1 / value : undefined;
}

function lossFrequency(params: Record<string, number>): number | undefined {
  return firstParam(params, ['FREQ', 'F', 'QFREQ']);
}

function resolveCapacitorSeriesResistance(
  capacitance: number,
  params: Record<string, number>,
): number {
  const explicit = firstParam(params, ['ESR', 'RSER', 'RS']);
  if (explicit !== undefined) return scaledCapSeries(explicit, params);

  const freq = lossFrequency(params);
  if (!finitePositive(freq) || !finitePositive(capacitance)) return 0;

  const omega = 2 * Math.PI * freq;
  const df = firstParam(params, ['DF', 'D', 'TAND', 'TANDELTA']);
  if (finitePositive(df)) {
    return df / (omega * capacitance);
  }

  const q = firstParam(params, ['Q']);
  if (finitePositive(q)) {
    return 1 / (omega * capacitance * q);
  }

  return 0;
}

function resolveInductorSeriesResistance(
  inductance: number,
  params: Record<string, number>,
): number {
  const explicit = firstParam(params, ['RSER', 'RS', 'R', 'DCR', 'RDC', 'ESR']);
  if (explicit !== undefined) return scaledInductorSeriesResistance(explicit, params);

  const freq = lossFrequency(params);
  const q = firstParam(params, ['Q']);
  if (!finitePositive(freq) || !finitePositive(q) || !finitePositive(inductance)) return 0;

  return 2 * Math.PI * freq * inductance / q;
}

function resolveCapacitorParallelResistance(params: Record<string, number>): number {
  const explicit = firstParam(params, ['RPAR', 'RP', 'RSHUNT', 'RLEAK', 'LEAKR', 'RLEAKAGE', 'LEAK']);
  const fromConductance = conductanceToResistance(firstParam(params, ['GPAR', 'GLEAK']));
  return scaledCapParallelResistance(explicit ?? fromConductance, params);
}

function resolveInductorParallelResistance(params: Record<string, number>): number {
  const explicit = firstParam(params, ['RPAR', 'RP', 'RCORE', 'RLOSS']);
  const fromConductance = conductanceToResistance(firstParam(params, ['GPAR', 'GCORE', 'GLOSS']));
  return scaledInductorParallelResistance(explicit ?? fromConductance, params);
}

function resolveInductorParallelCapacitance(
  inductance: number,
  params: Record<string, number>,
): number {
  const explicit = firstParam(params, ['CPAR', 'CP', 'CAP', 'CSELF', 'CW', 'C']);
  if (explicit !== undefined) return scaledInductorParallelCapacitance(explicit, params);

  const srf = firstParam(params, ['SRF', 'FR', 'FSELF']);
  if (!finitePositive(srf) || !finitePositive(inductance)) return 0;

  const omega = 2 * Math.PI * srf;
  return 1 / (omega * omega * inductance);
}

export function resolveCapacitorModel(
  instanceValue: number | undefined,
  model: ModelParams | undefined,
  instanceParams?: Record<string, number>,
): ResolvedCapacitorModel {
  if (!modelTypeMatches(model, 'C')) {
    throw new Error(`Model '${model!.name}' has type '${model!.type}', expected C for capacitor`);
  }

  const params = mergedParams(model, instanceParams);
  const m = multiplicity(params);
  const s = scale(params);

  let cNom: number;
  if (instanceValue !== undefined) {
    cNom = instanceValue * s * m;
  } else if (params.CAP !== undefined) {
    cNom = params.CAP * s * m;
  } else {
    const length = params.L ?? params.DEFL ?? 0;
    const width = params.W ?? params.DEFW ?? 1e-6;
    const effectiveLength = length - (params.SHORT ?? 0);
    const effectiveWidth = width - (params.NARROW ?? 0);
    const thick = params.THICK ?? 0;
    const cj = params.CJ ?? (thick !== 0
      ? (params.DI !== undefined ? params.DI * EPSILON_0 : EPSILON_SIO2) / thick
      : 0);
    const cjsw = params.CJSW ?? 0;

    cNom = (
      cj * effectiveLength * effectiveWidth
      + 2 * cjsw * (effectiveLength + effectiveWidth)
    ) * s * m;
  }

  const capacitance = cNom * temperatureFactor(params);
  return {
    value: capacitance,
    capacitance,
    seriesResistance: resolveCapacitorSeriesResistance(capacitance, params),
    seriesInductance: scaledCapSeries(firstParam(params, ['ESL', 'LSER', 'LS']), params),
    parallelResistance: resolveCapacitorParallelResistance(params),
    params,
  };
}

export function resolveCapacitance(
  instanceValue: number | undefined,
  model: ModelParams | undefined,
  instanceParams?: Record<string, number>,
): ResolvedPassiveValue {
  const resolved = resolveCapacitorModel(instanceValue, model, instanceParams);
  return { value: resolved.capacitance, params: resolved.params };
}

export function resolveInductorModel(
  instanceValue: number | undefined,
  model: ModelParams | undefined,
  instanceParams?: Record<string, number>,
): ResolvedInductorModel {
  if (!modelTypeMatches(model, 'L')) {
    throw new Error(`Model '${model!.name}' has type '${model!.type}', expected L for inductor`);
  }

  const params = mergedParams(model, instanceParams);
  const m = multiplicity(params);
  const s = scale(params);
  const divisor = multiplicityDivisor(params);

  let lNom: number;
  if (instanceValue !== undefined) {
    lNom = instanceValue * s / divisor;
  } else if (params.IND !== undefined) {
    lNom = params.IND * s / divisor;
  } else if (params.L !== undefined) {
    lNom = params.L * s / divisor;
  } else if (params.LENGTH !== undefined && params.LENGTH !== 0) {
    const nt = params.NT ?? 0;
    const mu = params.MU ?? 1;
    if (params.DIA !== undefined) {
      lNom = (
        mu * MU_0 * nt * nt * Math.PI * params.DIA * params.DIA
        / (4 * params.LENGTH)
      ) * s / divisor;
    } else {
      lNom = (
        mu * MU_0 * nt * nt * (params.CSECT ?? 0)
        / params.LENGTH
      ) * s / divisor;
    }
  } else {
    lNom = 0;
  }

  const inductance = lNom * temperatureFactor(params);
  return {
    value: inductance,
    inductance,
    seriesResistance: resolveInductorSeriesResistance(inductance, params),
    parallelResistance: resolveInductorParallelResistance(params),
    parallelCapacitance: resolveInductorParallelCapacitance(inductance, params),
    params,
  };
}

export function resolveInductance(
  instanceValue: number | undefined,
  model: ModelParams | undefined,
  instanceParams?: Record<string, number>,
): ResolvedPassiveValue {
  const resolved = resolveInductorModel(instanceValue, model, instanceParams);
  return { value: resolved.inductance, params: resolved.params };
}
