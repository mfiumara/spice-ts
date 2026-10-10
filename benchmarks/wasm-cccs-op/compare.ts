#!/usr/bin/env tsx
import { runWasmOpComparison } from '../wasm-op-compare.js';

runWasmOpComparison({
  scriptUrl: import.meta.url,
  name: 'wasm-cccs-op',
  benchScript: 'cccs-op',
  baselineRevision: '62690c3d7a172aedf4b1cc23678d15c6c5a953c7',
  baseline: { workerJs: 407419, indexJs: 42990, denseSolverWasm: 3275 },
  scopeLoss: 'The bounded backend supports only five-token linear F elements in OP and rejects CCCS AC, DC, transient, POLY, behavioral, and nonlinear forms.',
  stampLoss: 'TypeScript still performs bounded parsing, branch resolution, and stamps existing R/I/V primitives; each CCCS stamp and dense solve executes inside the verified WebAssembly artifact.',
});
