/**
 * ngspice-47 analog/ota/{cfunc.mod,ifspec.ifs} (Public Domain, Seth Hillbrand).
 * Source: https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/src/xspice/icm/analog/ota/
 * The model is linear: there are parameter bounds, but no output clipping.
 */
import type { DeviceModel } from '../device.js';
import { flag, real, STATIC, type CodeModelBehavior, type ResolvedXspiceParams } from './models.js';
import type { XspiceCodeModelSpec } from './spec.js';
import type { XspiceInputPort } from './xspice-device.js';

export const OTA_SPEC: XspiceCodeModelSpec = {
  name: 'ota',
  connections: [
    { name: 'inp', direction: 'inout', defaultType: 'gd', allowedTypes: ['gd'], vector: false, nullAllowed: false },
    { name: 'out', direction: 'inout', defaultType: 'g', allowedTypes: ['g'], vector: false, nullAllowed: false },
  ],
  params: [
    ...Object.entries({ gm: 1e-3, rout: 1e12, rin: 1e12, en: 0, in_noise: 0, enk: 0, ink: 0, incm: 0, incmk: 0 })
      .map(([name, value]) => ({
        name, type: 'real' as const, defaultValue: [value], limits: [name === 'gm' ? 1e-15 : 0, undefined] as const,
        vector: false, nullAllowed: true,
      })),
    { name: 'noise_programmatic', type: 'boolean', defaultValue: [true], vector: false, nullAllowed: true },
  ],
};

function ota(params: ResolvedXspiceParams): CodeModelBehavior {
  const gm = real(params, 'gm');
  const gin = 1 / real(params, 'rin');
  const gout = 1 / real(params, 'rout');
  return {
    stateful: false,
    ac: STATIC,
    load({ inputs, outputs, partials }) {
      outputs[0] = gin * inputs[0];
      outputs[1] = gm * inputs[0] + gout * inputs[1];
      partials[0] = gin;
      partials[1] = 0;
      partials[2] = gm;
      partials[3] = gout;
    },
  };
}

export const OTA_BEHAVIORS = new Map([['ota', ota]] as const);

/** Independent current sources consumed by the noise solver (A^2/Hz). */
interface OtaNoiseSource {
  readonly positive: number;
  readonly negative: number;
  readonly currentPowerDensity: (frequency: number) => number;
}

const sources = new WeakMap<DeviceModel, readonly OtaNoiseSource[]>();

/** Register cm_ota's eight independent sources; rin/rout themselves are noiseless. */
export function registerOtaNoise(device: DeviceModel, params: ResolvedXspiceParams, ports: readonly XspiceInputPort[]): void {
  if (!flag(params, 'noise_programmatic')) return;
  const [inp, out] = ports;
  const pair = (positive: number, negative: number, amplitude: number, corner: number): OtaNoiseSource[] => [
    { positive, negative, currentPowerDensity: () => amplitude * amplitude },
    { positive, negative, currentPowerDensity: frequency => corner > 0 && frequency > 0 ? amplitude * amplitude * corner / frequency : 0 },
  ];
  sources.set(device, [
    ...pair(out.positive, out.negative, real(params, 'en') * real(params, 'gm'), real(params, 'enk')),
    ...pair(inp.positive, inp.negative, real(params, 'in_noise'), real(params, 'ink')),
    ...pair(inp.positive, -1, real(params, 'incm'), real(params, 'incmk')),
    ...pair(inp.negative, -1, real(params, 'incm'), real(params, 'incmk')),
  ]);
}

export function otaNoiseSources(device: DeviceModel): readonly OtaNoiseSource[] {
  return sources.get(device) ?? [];
}
