#!/usr/bin/env tsx
import { runWasmOpComparison } from '../wasm-op-compare.js';

runWasmOpComparison({
  scriptUrl: import.meta.url,
  name: 'wasm-vccs-op',
  benchScript: 'vccs-op',
  baselineRevision: 'fe3913014703a3c5771415a7b402e22c7a6ecc57',
  baseline: { workerJs: 402948, indexJs: 42937, denseSolverWasm: 2900 },
  scopeLoss: 'The bounded backend supports only six-token linear G elements in OP and rejects VCCS AC, transient, POLY, behavioral, and nonlinear forms.',
  stampLoss: 'TypeScript still performs bounded parsing and stamps existing R/I/V primitives; each VCCS stamp and dense solve executes inside the verified WebAssembly artifact.',
});
