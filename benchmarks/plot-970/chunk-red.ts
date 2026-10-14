import assert from 'node:assert/strict';
import { compareExecutions } from './.reference/baseline-compare.js';
import type { EngineExecution } from '../corpus/classic/report.js';
const grid = Array.from({ length: 30000 }, (_, index) => index % 15000);
const execution: EngineExecution = { status: 'success', convergence: 'converged', analyses: [{ type: 'dc', plotName: 'dc1', series: { grid, signals: { 'v(out)': grid.map(re => ({ re, im: 0 })) } } }] };
const metric = compareExecutions(execution, execution)[0].metrics;
console.log(JSON.stringify(metric.grid));
assert.equal(metric.grid.alignedPoints, 30000);
