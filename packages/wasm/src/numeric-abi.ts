export const NUMERIC_WASM_LIMITS = Object.freeze({
  maxSourceBytes: 65_536,
  maxComponents: 256,
  maxSystemOrder: 64,
  maxResultPoints: 4096,
  memoryPages: 3,
} as const);

export interface NumericWasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  __heap_base: WebAssembly.Global;
  abi_version(): number;
  max_order(): number;
  solve_f64(order: number, matrixPointer: number, rhsPointer: number): number;
}

export async function validateNumericWasmModule(module: WebAssembly.Module): Promise<void> {
  if (WebAssembly.Module.imports(module).length !== 0) {
    throw new Error('The numeric WebAssembly module must not import host capabilities');
  }
  assertNumericWasmAbi((await WebAssembly.instantiate(module)).exports as NumericWasmExports);
}

export function assertNumericWasmAbi(exports: NumericWasmExports): void {
  if (!(exports.memory instanceof WebAssembly.Memory)
    || !(exports.__heap_base instanceof WebAssembly.Global)
    || exports.abi_version?.() !== 1
    || exports.max_order?.() !== NUMERIC_WASM_LIMITS.maxSystemOrder
    || typeof exports.solve_f64 !== 'function'
    || exports.memory.buffer.byteLength !== NUMERIC_WASM_LIMITS.memoryPages * 65_536) {
    throw new Error('The numeric WebAssembly module ABI is incompatible');
  }
}
