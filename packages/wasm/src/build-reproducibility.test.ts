import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { SpiceWorkerManifestV1 } from './index.js';

const sourceDirectory = new URL('./', import.meta.url);
const distDirectory = new URL('../dist/', import.meta.url);

async function builtManifest(): Promise<SpiceWorkerManifestV1> {
  return JSON.parse(await readFile(new URL('manifest.json', distDirectory), 'utf8')) as SpiceWorkerManifestV1;
}

function buildPins(manifest: SpiceWorkerManifestV1): string[] {
  return [
    manifest.engineBuildId,
    manifest.worker.sha256,
    manifest.numericWasm?.engineBuildId,
    manifest.numericWasm?.sha256,
  ].filter((pin): pin is string => typeof pin === 'string');
}

describe('build reproducibility (#412)', () => {
  it('keeps build-specific worker pins out of tracked source files', async () => {
    const manifest = await builtManifest();
    const pins = buildPins(manifest);
    expect(pins.length).toBeGreaterThan(0);

    const files = (await readdir(sourceDirectory)).filter(name => name.endsWith('.ts'));
    for (const name of files) {
      const source = await readFile(new URL(name, sourceDirectory), 'utf8');
      for (const pin of pins) {
        expect(source.includes(pin), `${name} embeds build pin ${pin}`).toBe(false);
      }
    }
  });

  it('pins the bundled facade to the worker build it was produced with', async () => {
    const manifest = await builtManifest();
    const facade = await readFile(new URL('index.js', distDirectory), 'utf8');
    for (const pin of buildPins(manifest)) {
      expect(facade.includes(pin), `dist/index.js is missing build pin ${pin}`).toBe(true);
    }
    expect(facade.includes(String(manifest.numericWasm?.byteLength))).toBe(true);
  });
});
