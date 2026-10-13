// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { simulate } from '../../packages/core/src/simulate.js';
import type { SimulationResult } from '../../packages/core/src/results.js';

const bytes = readFileSync(process.argv[2]);
const inputSha256 = createHash('sha256').update(bytes).digest('hex');
const nodes = ['node1', 'node2', 'node3', 'node4', 'node5'];
type Plot = { kind: string; x: number[]; vectors: Record<string, number[] | number[][]> };
function extract(result: SimulationResult): Plot[] {
  const plots: Plot[] = [];
  if (result.ac) {
    const ac = result.ac;
    plots.push({ kind: 'ac', x: Array.from(ac.frequencies), vectors: Object.fromEntries(nodes.map(node =>
      [`v(${node})`, ac.voltage(node).map(v => [v.magnitude * Math.cos(v.phase * Math.PI / 180), v.magnitude * Math.sin(v.phase * Math.PI / 180)])])) });
  }
  if (result.transient) {
    const tran = result.transient;
    plots.push({ kind: 'tran', x: Array.from(tran.time), vectors: Object.fromEntries(nodes.map(node =>
      [`v(${node})`, Array.from(tran.voltage(node))])) });
  }
  return plots;
}
try {
  const result = await simulate(bytes.toString('utf8'));
  const plots = result.control ? result.control.runs.flatMap(run => extract(run.result)) : extract(result);
  console.log(JSON.stringify({ status: 'success', inputSha256, plots, warnings: result.warnings,
    measurements: result.control?.measurements ?? [] }));
} catch (error) {
  const e = error as Error & { code?: string; codeModel?: string; line?: number };
  console.log(JSON.stringify({ status: e.code === 'UNSUPPORTED_XSPICE_CODE_MODEL' ? 'unsupported' : 'failed',
    inputSha256, error: { name: e.name, message: e.message, code: e.code, model: e.codeModel, line: e.line }, plots: [] }));
}
