import type { ModelParams } from '../types.js';

export const LTRA_LADDER_SECTIONS = 8;

export interface ResolvedLtraModel {
  resistancePerLength: number;
  inductancePerLength: number;
  capacitancePerLength: number;
  length: number;
}

export interface LtraPrimitive {
  type: 'R' | 'L' | 'C';
  name: string;
  nodes: [string, string];
  value: number;
}

function requireFinite(
  params: Record<string, number>,
  name: string,
  predicate: (value: number) => boolean,
): number {
  const value = params[name];
  if (value === undefined || !Number.isFinite(value) || !predicate(value)) {
    throw new Error(`Unsupported LTRA model: ${name} must be ${name === 'R' ? 'non-negative' : 'positive and finite'}`);
  }
  return value;
}

export function resolveLtraModel(model: ModelParams): ResolvedLtraModel {
  if (model.type !== 'LTRA') {
    throw new Error(`Unsupported lossy transmission-line model type '${model.type}'`);
  }
  const conductance = model.params.G ?? 0;
  if (!Number.isFinite(conductance) || conductance !== 0) {
    throw new Error('Unsupported LTRA model: only G=0 is supported');
  }
  return {
    resistancePerLength: requireFinite(model.params, 'R', value => value >= 0),
    inductancePerLength: requireFinite(model.params, 'L', value => value > 0),
    capacitancePerLength: requireFinite(model.params, 'C', value => value > 0),
    length: requireFinite(model.params, 'LEN', value => value > 0),
  };
}

/** Expand the bounded common-reference RLC line into a fixed distributed pi ladder. */
export function expandLtraLadder(
  name: string,
  input: string,
  output: string,
  reference: string,
  model: ResolvedLtraModel,
): LtraPrimitive[] {
  const result: LtraPrimitive[] = [];
  const dx = model.length / LTRA_LADDER_SECTIONS;
  const boundaries = Array.from({ length: LTRA_LADDER_SECTIONS + 1 }, (_unused, index) => {
    if (index === 0) return input;
    if (index === LTRA_LADDER_SECTIONS) return output;
    return `${name}.__ltra.n${index}`;
  });

  for (let index = 0; index <= LTRA_LADDER_SECTIONS; index++) {
    const endpointScale = index === 0 || index === LTRA_LADDER_SECTIONS ? 0.5 : 1;
    result.push({
      type: 'C',
      name: `${name}.C${index}`,
      nodes: [boundaries[index], reference],
      value: model.capacitancePerLength * dx * endpointScale,
    });
  }

  for (let index = 1; index <= LTRA_LADDER_SECTIONS; index++) {
    const from = boundaries[index - 1];
    const to = boundaries[index];
    const resistance = model.resistancePerLength * dx;
    const inductorInput = resistance === 0 ? from : `${name}.__ltra.rl${index}`;
    if (resistance > 0) {
      result.push({
        type: 'R',
        name: `${name}.R${index}`,
        nodes: [from, inductorInput],
        value: resistance,
      });
    }
    result.push({
      type: 'L',
      name: `${name}.L${index}`,
      nodes: [inductorInput, to],
      value: model.inductancePerLength * dx,
    });
  }

  return result;
}
