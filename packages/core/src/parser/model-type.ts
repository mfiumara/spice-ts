import { ModelTypeMismatchError, ParseError, UnsupportedCircuitModelTypeError } from '../errors.js';

/**
 * `.model` types that a spice-ts device consumes. Every other type is rejected
 * at parse time: storing it would let an instance that references the card
 * simulate with no model at all (issue #509).
 */
export const SUPPORTED_MODEL_TYPES: ReadonlySet<string> = new Set([
  'D',
  'NPN', 'PNP',
  'NJF',
  'NMOS', 'PMOS',
  'VDMOS', 'VDMOSN', 'VDMOSP',
  'NHFET', 'NMF',
  'C', 'L',
  'LTRA', 'TXL', 'CPL',
]);

/**
 * Model types each model-referencing semiconductor instance accepts, keyed by
 * SPICE instance letter (ngspice-47 rejects an instance whose model belongs to
 * another device kind). Every listed type is in {@link SUPPORTED_MODEL_TYPES}.
 */
export const DEVICE_MODEL_TYPES: Readonly<Record<string, readonly string[]>> = {
  D: ['D'],
  Q: ['NPN', 'PNP'],
  J: ['NJF'],
  M: ['NMOS', 'PMOS', 'VDMOS', 'VDMOSN', 'VDMOSP'],
  Z: ['NHFET', 'NMF'],
};

/**
 * Upper-case and validate a model registered outside the netlist parser
 * (Circuit API, subcircuit body, JSON protocol). Returns the normalized type.
 */
export function normalizeModelType(modelName: string, modelType: string): string {
  const upper = modelType.toUpperCase();
  if (!SUPPORTED_MODEL_TYPES.has(upper)) {
    throw new UnsupportedCircuitModelTypeError(modelName, upper, [...SUPPORTED_MODEL_TYPES]);
  }
  return upper;
}

/** Throw unless `modelType` belongs to the device kind of instance letter `kind`. */
export function assertDeviceModelType(
  kind: string,
  deviceName: string,
  modelName: string,
  modelType: string,
): void {
  const expected = DEVICE_MODEL_TYPES[kind];
  if (expected && !expected.includes(modelType)) {
    throw new ModelTypeMismatchError(deviceName, kind, modelName, modelType, expected);
  }
}

/**
 * Thrown when a `.model` card declares a type that no spice-ts device
 * implements (for example `SW`, `CSW` or `PJF`).
 */
export class UnsupportedModelTypeError extends ParseError {
  /** Stable machine-readable error code. */
  readonly code = 'UNSUPPORTED_MODEL_TYPE';

  constructor(
    /** Model name as written on the `.model` card */
    public readonly modelName: string,
    /** Upper-cased model type from the `.model` card */
    public readonly modelType: string,
    line: number,
    context: string,
  ) {
    super(
      `.model '${modelName}' has unsupported type '${modelType}'`
        + ` (supported: ${[...SUPPORTED_MODEL_TYPES].join(', ')})`,
      line,
      context,
    );
    this.name = 'UnsupportedModelTypeError';
  }
}

/** Throw unless a tokenized `.model` card names a supported model type. */
export function assertSupportedModelType(tokens: string[], line: number, context: string): void {
  const modelName = tokens[1] ?? '';
  const modelType = tokens[2]?.toUpperCase();
  if (!modelName || !modelType || modelType === '(') {
    throw new ParseError(`.model '${modelName}' is missing its model type`, line, context);
  }
  if (!SUPPORTED_MODEL_TYPES.has(modelType)) {
    throw new UnsupportedModelTypeError(modelName, modelType, line, context);
  }
}
