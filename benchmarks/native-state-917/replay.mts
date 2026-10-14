// SPDX-License-Identifier: MIT
// Identical numeric block replay. Not a claim of identical full-system ordering.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { SparseMatrix } from '../../packages/core/src/solver/sparse-matrix.js';
import { toCsc } from '../../packages/core/src/solver/csc-matrix.js';
import { GilbertPeierlsSolver } from '../../packages/core/src/solver/gilbert-peierls.js';
interface NativeRow { stage: string; scale: number; diag: number; matrix: number[]; }
const trace: NativeRow[] = JSON.parse(gunzipSync(readFileSync('benchmarks/native-state-917/base-native.json.gz')).toString());
const loaded = trace.find(r => r.stage === 'loaded' && r.scale === 0.001 && r.diag === 0)!;
const matrix = new SparseMatrix(3);
loaded.matrix.forEach((v, i) => { if (v !== 0) matrix.add(Math.floor(i / 3), i % 3, v); });
const { csc } = toCsc(matrix);
const solver = new GilbertPeierlsSolver();
solver.analyzePattern(csc);
let error: string | null = null;
try { solver.factorize(csc); } catch (e) { error = String(e); }
const receipt = { matrix: loaded.matrix, rowSums: [0, 1, 2].map(r => loaded.matrix.slice(r * 3, r * 3 + 3).reduce((a, b) => a + b, 0)), error };
writeFileSync('benchmarks/native-state-917/replay.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
