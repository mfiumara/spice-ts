/**
 * Interface specifications of the XSPICE code models spice-ts implements,
 * transcribed from the ngspice-47 `ifspec.ifs` files (src/xspice/icm/analog).
 * The port table decides how an A-card's connection tokens are read, and the
 * parameter table how a `.model` card's values are parsed, exactly as ngspice
 * MIF_INP2A and MIFgetMod use them.
 */

/** Analog port types spice-ts can stamp (XSPICE `%v`, `%vd`, `%i`, `%id`, `%vnam`). */
export type XspiceAnalogPortType = 'v' | 'vd' | 'i' | 'id' | 'vnam';

/** Every port type the XSPICE grammar accepts after a `%`. */
export const XSPICE_PORT_TYPES: ReadonlySet<string> = new Set([
  'v', 'vd', 'i', 'id', 'vnam', 'g', 'gd', 'h', 'hd', 'd',
]);

export interface XspiceConnectionSpec {
  readonly name: string;
  readonly direction: 'in' | 'out' | 'inout';
  readonly defaultType: string;
  readonly allowedTypes: readonly string[];
  readonly vector: boolean;
  /** Inclusive [min, max] port count of a vector connection; max undefined = unbounded. */
  readonly vectorBounds?: readonly [number | undefined, number | undefined];
  readonly nullAllowed: boolean;
}

export type XspiceParamType = 'real' | 'int' | 'boolean' | 'string';
export type XspiceParamValue = number | boolean | string;

export interface XspiceParamSpec {
  readonly name: string;
  readonly type: XspiceParamType;
  /** Default element values; undefined means the parameter has no default. */
  readonly defaultValue?: readonly XspiceParamValue[];
  /** Inclusive value limits; out-of-range values are clamped with a warning (MIFmParam). */
  readonly limits?: readonly [number | undefined, number | undefined];
  readonly vector: boolean;
  /** Vector size is tied to this connection's port count. */
  readonly sizeFromConnection?: string;
  /** Inclusive [min, max] element count of a vector parameter. */
  readonly vectorBounds?: readonly [number | undefined, number | undefined];
  readonly nullAllowed: boolean;
}

export interface XspiceCodeModelSpec {
  readonly name: string;
  readonly connections: readonly XspiceConnectionSpec[];
  readonly params: readonly XspiceParamSpec[];
}

const ANALOG_IN = ['v', 'vd', 'i', 'id', 'vnam'] as const;
const ANALOG_OUT = ['v', 'vd', 'i', 'id'] as const;

function input(name: string, vector = false, vectorBounds?: readonly [number | undefined, number | undefined]): XspiceConnectionSpec {
  return {
    name, direction: 'in', defaultType: 'v', allowedTypes: ANALOG_IN, vector, nullAllowed: false,
    ...(vectorBounds ? { vectorBounds } : {}),
  };
}

function output(name: string): XspiceConnectionSpec {
  return { name, direction: 'out', defaultType: 'v', allowedTypes: ANALOG_OUT, vector: false, nullAllowed: false };
}

function real(
  name: string,
  defaultValue: number | undefined,
  extra: Partial<Pick<XspiceParamSpec, 'limits' | 'vector' | 'sizeFromConnection' | 'vectorBounds' | 'nullAllowed'>> = {},
): XspiceParamSpec {
  return {
    name,
    type: 'real',
    ...(defaultValue === undefined ? {} : { defaultValue: [defaultValue] }),
    vector: false,
    nullAllowed: true,
    ...extra,
  };
}

function boolean(name: string, defaultValue: boolean): XspiceParamSpec {
  return { name, type: 'boolean', defaultValue: [defaultValue], vector: false, nullAllowed: true };
}

/** gain/ifspec.ifs */
const GAIN: XspiceCodeModelSpec = {
  name: 'gain',
  connections: [input('in'), output('out')],
  params: [
    real('in_offset', 0), real('gain', 1), real('out_offset', 0),
    real('noise_voltage', 0), real('noise_current', 0),
    real('noise_corner', 0), real('noise_exponent', 1),
  ],
};

/** summer/ifspec.ifs */
const SUMMER: XspiceCodeModelSpec = {
  name: 'summer',
  connections: [input('in', true, [2, undefined]), output('out')],
  params: [
    real('in_offset', 0, { vector: true, sizeFromConnection: 'in' }),
    real('in_gain', 1, { vector: true, sizeFromConnection: 'in' }),
    real('out_gain', 1), real('out_offset', 0),
  ],
};

/** mult/ifspec.ifs */
const MULT: XspiceCodeModelSpec = {
  name: 'mult',
  connections: [input('in', true, [2, undefined]), output('out')],
  params: [
    real('in_offset', 0, { vector: true, sizeFromConnection: 'in' }),
    real('in_gain', 1, { vector: true, sizeFromConnection: 'in' }),
    real('out_gain', 1), real('out_offset', 0),
  ],
};

/** divide/ifspec.ifs */
const DIVIDE: XspiceCodeModelSpec = {
  name: 'divide',
  connections: [input('num'), input('den'), output('out')],
  params: [
    real('num_offset', 0), real('num_gain', 1),
    real('den_offset', 0), real('den_gain', 1),
    real('den_lower_limit', 1e-10, { limits: [1e-10, undefined] }),
    real('den_domain', 1e-16),
    boolean('fraction', false),
    real('out_gain', 1), real('out_offset', 0),
  ],
};

/** pwl/ifspec.ifs */
const PWL: XspiceCodeModelSpec = {
  name: 'pwl',
  connections: [input('in'), output('out')],
  params: [
    real('x_array', undefined, { vector: true, vectorBounds: [2, undefined], nullAllowed: false }),
    real('y_array', undefined, { vector: true, vectorBounds: [2, undefined], nullAllowed: false }),
    real('input_domain', 0.01, { limits: [1e-12, 0.5] }),
    boolean('fraction', true),
    boolean('limit', false),
  ],
};

/** limit/ifspec.ifs */
const LIMIT: XspiceCodeModelSpec = {
  name: 'limit',
  connections: [input('in'), output('out')],
  params: [
    real('in_offset', 0), real('gain', 1),
    real('out_lower_limit', undefined), real('out_upper_limit', undefined),
    real('limit_range', 1e-6), boolean('fraction', false),
  ],
};

/** int/ifspec.ifs */
const INT: XspiceCodeModelSpec = {
  name: 'int',
  connections: [input('in'), output('out')],
  params: [
    real('in_offset', 0), real('gain', 1),
    real('out_lower_limit', undefined), real('out_upper_limit', undefined),
    real('limit_range', 1e-6), real('out_ic', 0),
  ],
};

/** d_dt/ifspec.ifs */
const D_DT: XspiceCodeModelSpec = {
  name: 'd_dt',
  connections: [input('in'), output('out')],
  params: [
    real('out_offset', 0), real('gain', 1),
    real('out_lower_limit', undefined), real('out_upper_limit', undefined),
    real('limit_range', 1e-6),
  ],
};

/** Implemented code models keyed by lower-case ngspice Spice_Model_Name. */
export const XSPICE_CODE_MODEL_SPECS: ReadonlyMap<string, XspiceCodeModelSpec> = new Map(
  [GAIN, SUMMER, MULT, DIVIDE, PWL, LIMIT, INT, D_DT].map(spec => [spec.name, spec]),
);

/**
 * Every code model shipped with ngspice-47 (analog, digital, spice2poly,
 * table, tlines, xtradev and xtraevt libraries). A `.model` card of one of
 * these types that spice-ts does not implement raises
 * {@link UnsupportedCodeModelError} instead of being stored and simulated
 * without a device.
 */
export const NGSPICE_XSPICE_CODE_MODELS: ReadonlySet<string> = new Set([
  // analog
  'astate', 'climit', 'd_dt', 'delay', 'divide', 'filesource', 'gain', 'hyst', 'ilimit', 'int',
  'limit', 'mult', 'multi_input_pwl', 'oneshot', 'ota', 'pwl', 'pwlts', 's_xfer', 'sine', 'slew',
  'square', 'summer', 'triangle', 'xfer',
  // digital
  'adc_bridge', 'bidi_bridge', 'd_and', 'd_buffer', 'd_cosim', 'd_dff', 'd_dlatch', 'd_fdiv',
  'd_genlut', 'd_inverter', 'd_jkff', 'd_lut', 'd_nand', 'd_nor', 'd_open_c', 'd_open_e', 'd_or',
  'd_osc', 'd_process', 'd_pulldown', 'd_pullup', 'd_pwm', 'd_ram', 'd_source', 'd_srff',
  'd_srlatch', 'd_state', 'd_tff', 'd_tristate', 'd_xnor', 'd_xor', 'dac_bridge',
  // spice2poly, table, tlines
  'spice2poly', 'table2d', 'table3d', 'cpline', 'cpmlin', 'mlin', 'msopen', 'tline',
  // xtradev
  'aswitch', 'capacitoric', 'cmeter', 'core', 'inductoric', 'lcouple', 'lmeter', 'memristor',
  'potentiometer', 'pswitch', 'seegen', 'sidiode', 'zener',
  // xtraevt
  'd_to_real', 'real_delay', 'real_gain', 'real_to_v',
]);
