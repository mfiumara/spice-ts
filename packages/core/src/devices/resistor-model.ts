import { InvalidCircuitError } from '../errors.js';
import type { ModelParams } from '../types.js';
import type { ResistorParameters } from './resistor.js';

/** ngspice RESsetup default instance width and length (10 um). */
const DEFAULT_GEOMETRY = 10e-6;

/** ngspice-47 restemp.c fallback when no resistance is given: 1 mOhm. */
const DEFAULT_RESISTANCE = 1e-3;

/** ngspice-47 resparam.c RESMIN: smallest nonzero instance resistance magnitude. */
const RESISTANCE_MIN = 1e-12;

/** Instance parameters a `.model R` card may default (ngspice inpgmod.c instance defaults). */
const MODEL_INSTANCE_DEFAULTS: Record<string, string> = {
  RESISTANCE: 'R', AC: 'AC', TC: 'TC1', SCALE: 'SCALE', NOISY: 'NOISY', NOISE: 'NOISY',
};

export interface ResolvedResistor {
  /** Nominal resistance before temperature, `SCALE` and `M` (ngspice RESresist). */
  resistance: number;
  parameters: ResistorParameters;
}

/**
 * Resolve a resistor instance against its optional `.model R` card the way
 * ngspice-47 RESupdate_conduct does: an explicit value wins, then
 * `RSH * (L - 2*SHORT) / (W - 2*NARROW)` when `L*W*RSH > 0`, then the model `R`.
 * Instance `TC1`/`TC2`/`TCE` override the model's; any `TCE` selects the
 * exponential `1.01^(TCE*dT)` temperature factor.
 *
 * With none of those, ngspice warns and uses 1 mOhm (restemp.c). A given value
 * with `0 < |R| < 1e-12` is clamped to `+/-1e-12` (resparam.c RES_RESIST). An
 * exact zero stays zero: spice-ts stamps it as an exact branch constraint,
 * where ngspice uses 1e-12 Ohm; the two differ by at most 1e-12 * I volts.
 */
export function resolveResistor(
  name: string,
  instanceValue: number | undefined,
  model: ModelParams | undefined,
  instanceParams: Record<string, number> = {},
): ResolvedResistor {
  if (model && model.type.toUpperCase() !== 'R') {
    throw new InvalidCircuitError(
      `Resistor '${name}' references model '${model.name}' of type '${model.type}', expected R`,
    );
  }
  const card = model?.params ?? {};
  const defaults: Record<string, number> = {};
  for (const [key, target] of Object.entries(MODEL_INSTANCE_DEFAULTS)) {
    if (card[key] !== undefined) defaults[target] = card[key];
  }
  const instance = { ...defaults, ...instanceParams };

  const warnings: string[] = [];
  let resistance = instanceValue ?? instance.R;
  if (resistance !== undefined && resistance !== 0 && Math.abs(resistance) < RESISTANCE_MIN) {
    resistance = Math.sign(resistance) * RESISTANCE_MIN;
    warnings.push(
      `Value of resistor ${name} is too small, set to ${resistance.toExponential(6)}`,
    );
  }
  if (resistance === undefined) {
    const length = instance.L ?? card.L ?? DEFAULT_GEOMETRY;
    const width = instance.W ?? card.DEFW ?? card.W ?? DEFAULT_GEOMETRY;
    const sheet = card.RSH ?? 0;
    const modelResistance = card.R ?? card.RES;
    if (length * width * sheet > 0) {
      resistance = (length - 2 * (card.SHORT ?? card.DLR ?? 0))
        / (width - 2 * (card.NARROW ?? card.DW ?? 0))
        * sheet;
    } else if (modelResistance !== undefined && modelResistance > 0) {
      resistance = modelResistance;
    } else {
      resistance = DEFAULT_RESISTANCE;
      warnings.push(`${name}: resistance too low or not given, set to 1 mOhm`);
    }
  }

  return {
    resistance,
    parameters: {
      tc1: instance.TC1 ?? card.TC1 ?? card.TC1R,
      tc2: instance.TC2 ?? card.TC2 ?? card.TC2R,
      tce: instance.TCE ?? card.TCE,
      tnom: instance.TNOM ?? card.TNOM,
      multiplier: instance.M,
      scale: instance.SCALE,
      acResistance: instance.AC,
      noisy: instance.NOISY === undefined ? undefined : instance.NOISY !== 0,
      flickerCoefficient: card.KF,
      warnings,
    },
  };
}
