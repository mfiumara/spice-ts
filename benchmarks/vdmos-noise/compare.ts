#!/usr/bin/env tsx
/** Run through spice-heavy: identical decks, ngspice-47 print-all source spectra. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simulate } from '../../packages/core/src/simulate.js';
import { InvalidCircuitError } from '../../packages/core/src/errors.js';

async function main(): Promise<void> {
  if (!execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).includes('ngspice-47')) {
    throw new Error('This reference requires ngspice-47');
  }
  const decks = ['unsupported', 'flicker', 'pchan', 'self-heating'];
  const update = process.argv.includes('--update');
  const cases = [];
  for (const name of decks) {
    const path = fileURLToPath(new URL(`${name}.cir`, import.meta.url));
    const deck = readFileSync(path, 'utf8');
    const stdout = execFileSync('ngspice', ['-b', path], { encoding: 'utf8' });
    const vectors: Record<string, number[]> = {};
    let columns: string[] = [];
    for (const line of stdout.split('\n')) {
      if (/^Index\s+frequency/.test(line)) columns = line.trim().split(/\s+/).slice(1);
      else if (/^\d+\s/.test(line)) {
        const [point, ...row] = line.trim().split(/\s+/).map(Number);
        columns.forEach((column, index) => {
          // Indexed assignment also handles frequency repeated in print-all tables.
          (vectors[column] ??= [])[point] = row[index];
        });
      }
    }
    if (!vectors.onoise_spectrum?.length || !vectors.inoise_spectrum?.length
      || Object.values(vectors).some(values => values.length !== vectors.frequency?.length || values.some(v => !Number.isFinite(v)))) {
      throw new Error(`ngspice did not produce complete finite noise spectra for ${name}`);
    }
    cases.push({ name, vectors });
    if (!update) {
      if (name === 'self-heating') {
        try { await simulate(deck); }
        catch (error) {
          if (!(error instanceof InvalidCircuitError) || !error.message.includes('self-heating small-signal coupling')) throw error;
          console.log(JSON.stringify({ name, unsupported: error.message, ngspiceOutput: vectors.onoise_spectrum,
            ngspiceInput: vectors.inoise_spectrum }));
          continue;
        }
        throw new Error('Self-heating unexpectedly accepted; update its parity assertion');
      }
      const result = (await simulate(deck)).noise!;
      const output = result.outputNoiseDensity;
      const input = result.inputNoiseDensity;
      if (output.length !== vectors.frequency.length || input.length !== vectors.frequency.length) {
        throw new Error(`${name}: point count mismatch`);
      }
      const maxRelative = Math.max(...output.map((value, i) => Math.abs(value / vectors.onoise_spectrum[i] - 1)),
        ...input.map((value, i) => Math.abs(value / vectors.inoise_spectrum[i] - 1)));
      console.log(JSON.stringify({ name, frequencies: result.frequencies, ngspiceOutput: vectors.onoise_spectrum,
        output, ngspiceInput: vectors.inoise_spectrum, input, maxRelative }));
      if (!Number.isFinite(maxRelative) || maxRelative > 1e-4) throw new Error(`${name}: noise parity exceeds 0.01%`);
    }
  }
  if (update) {
    writeFileSync(new URL('reference.json', import.meta.url), `${JSON.stringify({ engine: 'ngspice-47', cases }, null, 2)}\n`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
