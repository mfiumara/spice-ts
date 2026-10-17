import type { CompiledCircuit } from '../circuit.js';
import { InvalidCircuitError } from '../errors.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { CurrentSource } from '../devices/current-source.js';

/** A reversible device refresh; node/branch identities must remain unchanged. */
export function temperatureExpressionTarget(compiled: CompiledCircuit, sourceNames: string[] = []): {
  set(celsius: number): void;
  restore(): void;
} | undefined {
  const recompile = compiled.recompileAtTemperature;
  if (!recompile) return undefined;
  const original = compiled.devices;
  const preservedSources = new Set(sourceNames.map(name => name.toUpperCase()));
  return {
    set(celsius) {
      const evaluated = recompile(celsius);
      if (evaluated.nodeNames.join('\0') !== compiled.nodeNames.join('\0')
          || evaluated.branchNames.join('\0') !== compiled.branchNames.join('\0')
          || evaluated.devices.length !== original.length
          || evaluated.devices.some((device, index) => device.name !== original[index].name)) {
        throw new InvalidCircuitError('TEMPER expressions must not change circuit topology');
      }
      evaluated.devices.forEach((device, index) => {
        const previous = compiled.devices[index];
        // A nested DC source sweep is independent of numparam evaluation.
        if (preservedSources.has(device.name.toUpperCase())
            && (device instanceof VoltageSource || device instanceof CurrentSource)
            && (previous instanceof VoltageSource || previous instanceof CurrentSource)) {
          device.waveform = previous.waveform;
        }
        device.beginOperatingPoint?.();
      });
      // Device-list identity keys the Newton/linear-stamp caches. Replacing
      // the list, rather than mutating it, prevents retaining stale devices.
      compiled.devices = evaluated.devices;
    },
    restore() { compiled.devices = original; },
  };
}
