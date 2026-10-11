import { InvalidCircuitError } from '../errors.js';
import { cplMatrixValues } from '../parser/transmission-line-parser.js';
import type { ModelParams } from '../types.js';
import { CplLines, computeCplCoefficients, cplMatricesFromUpperTriangles } from './cpl.js';
import type { DeviceModel } from './device.js';
import { TxlLine, computeTxlCoefficients } from './txl.js';

/**
 * Builds ngspice-47 SWEC lossy lines from Y (TXL) and P (CPL) cards, with
 * ngspice's model routing: a TXL model whose R/L exceeds 1.6e9 is created as
 * a CPL model (inpdomod.c), and a Y card that references a CPL model becomes
 * a single-conductor CPL instance (inp2y.c).
 */

/** inpdomod.c: TXL models with R/L above this become CPL models. */
const TXL_TO_CPL_RATIO = 1.6e9;

export interface SwecLineInstance {
  name: string;
  /** 'Y' for a TXL card, 'P' for a CPL card. */
  card: 'Y' | 'P';
  /** Resolved node indices: [in_1..in_n, out_1..out_n] (-1 for ground). */
  nodes: number[];
  /** Instance `len` override. */
  length?: number;
}

/** Branch names a SWEC line instance with `lines` conductors needs, in device order. */
export function swecLineBranchNames(name: string, card: 'Y' | 'P', lines: number): string[] {
  if (card === 'Y' && lines === 1) return [`${name}:1`, `${name}:2`];
  return [
    ...Array.from({ length: lines }, (_unused, m) => `${name}:1_${m}`),
    ...Array.from({ length: lines }, (_unused, m) => `${name}:2_${m}`),
  ];
}

/** Whether ngspice simulates this model as CPL (CPL card, or TXL card with R/L > 1.6e9). */
export function isCplModel(model: ModelParams): boolean {
  if (model.type === 'CPL') return true;
  if (model.type !== 'TXL') return false;
  const R = model.params.R ?? 0;
  const L = model.params.L ?? 0;
  return L !== 0 && R / L > TXL_TO_CPL_RATIO;
}

function lossyLineError(name: string, modelName: string, message: string): InvalidCircuitError {
  return new InvalidCircuitError(`Lossy line '${name}' model '${modelName}': ${message}`);
}

function requireScalar(name: string, model: ModelParams, key: string, description: string): number {
  const value = model.params[key];
  if (value === undefined) throw lossyLineError(name, model.name, `lossy line ${description} not given`);
  if (!Number.isFinite(value)) throw lossyLineError(name, model.name, `${key} must be finite`);
  return value;
}

const DESCRIPTIONS: Record<string, string> = {
  R: 'series resistance',
  G: 'parallel conductance',
  L: 'series inductance',
  C: 'parallel capacitance',
};

/** Create the TXL or CPL device for one Y/P instance. */
export function createSwecLine(
  instance: SwecLineInstance,
  model: ModelParams | undefined,
  modelName: string,
  branches: number[],
): DeviceModel {
  const { name, card } = instance;
  if (!model) {
    throw new InvalidCircuitError(`Lossy line '${name}' references unknown model '${modelName}'`);
  }
  const lines = instance.nodes.length / 2;
  if (model.type !== 'TXL' && model.type !== 'CPL') {
    throw lossyLineError(name, model.name, `incorrect model type '${model.type}' (expected TXL or CPL)`);
  }

  if (!isCplModel(model)) {
    if (card === 'P') {
      throw lossyLineError(name, model.name, 'incorrect model type: a P card needs a CPL model');
    }
    for (const key of ['R', 'G', 'L', 'C']) requireScalar(name, model, key, DESCRIPTIONS[key]);
    const modelLength = model.params.LENGTH;
    if (modelLength === undefined) throw lossyLineError(name, model.name, 'lossy line length must be given');
    const length = instance.length ?? modelLength;
    const { R, L, G, C } = model.params;
    return new TxlLine(
      name,
      instance.nodes,
      branches[0],
      branches[1],
      computeTxlCoefficients(R, L, G, C, length),
      R * length,
    );
  }

  const vectors: Record<string, number[]> = {};
  for (const key of ['R', 'G', 'L', 'C']) {
    const values = model.type === 'CPL'
      ? cplMatrixValues(model, key)
      : model.params[key] === undefined ? undefined : [model.params[key]];
    if (values === undefined) throw lossyLineError(name, model.name, `lossy line ${DESCRIPTIONS[key]} not given`);
    vectors[key] = values;
  }
  const modelLength = model.params.LENGTH;
  if (modelLength === undefined) throw lossyLineError(name, model.name, 'lossy line length must be given');
  const length = instance.length ?? modelLength;
  const matrices = cplMatricesFromUpperTriangles(lines, {
    R: vectors.R, L: vectors.L, G: vectors.G, C: vectors.C,
  });
  return new CplLines(name, instance.nodes, branches, computeCplCoefficients(matrices, length), length);
}
