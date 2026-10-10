# Dense numeric WebAssembly artifact

`dense-solver.wasm` is the checked-in numeric kernel used by the bounded `spice-ts-wasm` backend. Package builds copy and hash this artifact. They do not require a native compiler and do not regenerate it implicitly.

The artifact was built with Homebrew LLVM/LLD 23.1.3:

    PATH="/opt/homebrew/opt/llvm/bin:/opt/homebrew/opt/lld/bin:$PATH" \
      clang --target=wasm32 -Oz -nostdlib -fno-builtin \
      -Wl,--no-entry \
      -Wl,--export=solve_f64 \
      -Wl,--export=abi_version \
      -Wl,--export=max_order \
      -Wl,--export=__heap_base \
      -Wl,--export-memory \
      -Wl,--initial-memory=196608 \
      -Wl,--max-memory=196608 \
      -Wl,--strip-all \
      -o native/dense-solver.wasm native/dense-solver.c

Expected artifact:

- byte length: 1190
- SHA-256: `2698aaebf38373941e481b64b62294252cc4dd93bc90f7bfe1571f227815f003`
- imports: none
- memory: fixed at 3 WebAssembly pages (196608 bytes)
- ABI version: 1
- maximum order: 64

The kernel performs deterministic dense f64 Gaussian elimination with partial pivoting. Equal pivot magnitudes retain the lowest row index. It has no WASI, filesystem, network, clock, randomness, shared memory, threads, SIMD, or memory growth.
