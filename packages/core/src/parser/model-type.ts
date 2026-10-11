import { ParseError } from '../errors.js';

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
  'LTRA',
]);

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
