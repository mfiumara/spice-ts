import { InvalidCircuitError } from '../errors.js';
import type { PoleZeroAnalysis } from '../types.js';

export const POLE_ZERO_FORM = '.pz in+ in- out+ out- {cur|vol} {pol|zer|pz}';

/** Enforce the ngspice-47 `.pz` directive shape supported by the native solver. */
export function assertSupportedPoleZero(analysis: PoleZeroAnalysis): void {
  const nodes = [
    analysis.inputPositive,
    analysis.inputNegative,
    analysis.outputPositive,
    analysis.outputNegative,
  ];
  if (
    !nodes.every(node => typeof node === 'string' && node.length > 0)
    || (analysis.inputType !== 'cur' && analysis.inputType !== 'vol')
    || (analysis.mode !== 'pol' && analysis.mode !== 'zer' && analysis.mode !== 'pz')
  ) {
    throw new InvalidCircuitError(
      `Unsupported .pz form; expected '${POLE_ZERO_FORM}'`,
    );
  }
}
