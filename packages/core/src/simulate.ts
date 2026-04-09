import { Circuit } from './circuit.js';
import type { CompiledCircuit } from './circuit.js';
import { parse } from './parser/index.js';
import type { SimulationOptions, SimulationWarning, TransientStep, ACPoint } from './types.js';
import { resolveOptions } from './types.js';
import { solveDCOperatingPoint } from './analysis/dc.js';
import { solveTransient } from './analysis/transient.js';
import { solveAC } from './analysis/ac.js';
import type { SimulationResult } from './results.js';
import { InvalidCircuitError } from './errors.js';

export async function simulate(
  input: string | Circuit,
  options?: SimulationOptions,
): Promise<SimulationResult> {
  const circuit = typeof input === 'string' ? parse(input) : input;
  const compiled = circuit.compile();
  const warnings: SimulationWarning[] = [];

  validateCircuit(compiled, warnings);

  const result: SimulationResult = { warnings };

  for (const analysis of compiled.analyses) {
    switch (analysis.type) {
      case 'op': {
        const opts = resolveOptions(options);
        const { result: dcResult } = solveDCOperatingPoint(compiled, opts);
        result.dc = dcResult;
        break;
      }
      case 'dc': {
        // DC sweep — will be implemented later
        break;
      }
      case 'tran': {
        const opts = resolveOptions(options, analysis.stopTime);
        const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
        result.transient = solveTransient(compiled, analysis, opts, dcAsm.solution);
        break;
      }
      case 'ac': {
        const opts = resolveOptions(options);
        const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
        result.ac = solveAC(compiled, analysis, opts, dcAsm.solution);
        break;
      }
    }
  }

  return result;
}

export async function* simulateStream(
  input: string | Circuit,
  options?: SimulationOptions,
): AsyncIterableIterator<TransientStep | ACPoint> {
  // Will be implemented in Task 16
  throw new Error('simulateStream not yet implemented');
}

function validateCircuit(compiled: CompiledCircuit, warnings: SimulationWarning[]): void {
  if (compiled.nodeCount === 0) {
    throw new InvalidCircuitError('Circuit has no nodes');
  }
  if (compiled.analyses.length === 0) {
    throw new InvalidCircuitError('No analysis command specified');
  }
}
