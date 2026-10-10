import { InvalidCircuitError } from '../errors.js';
import type { PoleZeroAnalysis } from '../types.js';

export const BOUNDED_POLE_ZERO_FORM = '.pz input 0 output 0 {cur|vol} {pol|pz}';

/** Enforce the deliberately bounded pole-zero analysis supported by the native solver. */
export function assertSupportedPoleZero(analysis: PoleZeroAnalysis): void {
  if (
    analysis.inputNegative !== '0'
    || analysis.outputNegative !== '0'
    || (analysis.inputType !== 'cur' && analysis.inputType !== 'vol')
    || (analysis.mode !== 'pol' && analysis.mode !== 'pz')
  ) {
    throw new InvalidCircuitError(
      `Unsupported .pz form; expected '${BOUNDED_POLE_ZERO_FORM}'`,
    );
  }
}