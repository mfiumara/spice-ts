import type { ModelParams } from '../types.js';
import { resolveHFET1Model, type HFET1Model } from './hfet1-model.js';
import { resolveMESAModel, type MESAModel } from './mesa-model.js';

/** Z-card model families: ngspice HFETA (`NHFET`) and MESA (`NMF`). */
export type ResolvedZModel =
  | { kind: 'hfet'; model: HFET1Model }
  | { kind: 'mesa'; model: MESAModel };

export function resolveZModel(model: ModelParams): ResolvedZModel {
  switch (model.type) {
    case 'NHFET':
      return { kind: 'hfet', model: resolveHFET1Model(model) };
    case 'NMF':
      return { kind: 'mesa', model: resolveMESAModel(model) };
    default:
      throw new Error(`Unsupported Z-card model type: '${model.type}'`);
  }
}
