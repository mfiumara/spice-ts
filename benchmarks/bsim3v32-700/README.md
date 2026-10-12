# BSIM3v32 3.2 / 3.2.2 size-record (`pParam`) reuse (#700)

ngspice-47 `b3v32temp.c` keeps one size-dependent record (`pParam`) per distinct instance (L, W) of a model. For revisions 3.2 and 3.2.2 the line that points `pParam` at a matched record (`pParam = here->pParam; /*bug-fix */`) is guarded by `BSIM3v32intVersion > BSIM3v32V322`, so an instance whose geometry already has a record keeps `pParam` at the most recently *allocated* record. Its instance copies `vth0`, `vfb`, `vfbzb` (each plus DELVTO) and `u0temp` (times MULU0) then come from that other geometry; everything `b3v32ld.c` reads through `here->pParam` stays its own. ngspice prepends each new instance to its model's list (`cktcrte.c`), so the loop visits instances in reverse netlist order.

The exact condition: an instance diverges from its own record when its geometry was already seen (later in the netlist) and the last newly-seen geometry before it in that reverse walk is a different one. For `a, b, a` the first `a` reads `b`'s record; for `a, b, a, a` the first `a` still reads `b`'s record even though the instance before it is an `a`. 3.2.3, 3.2.4 and 3.3.0 are not affected.

Before this change spice-ts always used the instance's own record (documented as not ported in `benchmarks/bsim3v32-594/README.md`). It now reproduces the reuse: `Circuit.compile` groups BSIM3 instances by ngspice model, in netlist order (a subcircuit-local `.model` is a separate ngspice model per subcircuit instance, `x1:name`), and `BSIM3v3.linkBsim3v32SizeRecordReuse` walks each group in reverse and hands the reused instances the donor geometry; `computeBsim3Size` takes the copies from it. The link survives `.options TEMP` (b3v32temp.c reruns at the circuit temperature with the same order).

Not covered: `tconst` (NQS only; NQSMOD=1 is rejected, #692), and the `here->cgso/cgdo` copies, which `b3v32ld.c` overwrites from `here->pParam` before AC uses them. For a model used both in an outer subcircuit and inside a nested one, spice-ts scopes subcircuit-local models by the device's immediate parent instance.

## Reproduce

    pnpm install --frozen-lockfile && pnpm -C packages/core build
    pnpm exec tsx benchmarks/bsim3v32-700/probe.ts --output benchmarks/bsim3v32-700/after.json   # needs ngspice-47 on PATH
    pnpm -C packages/core exec vitest run src/devices/bsim3v32-size-reuse.test.ts

`before.json` is the same script against main `4b58c417`'s build. Every case is one identical `.op` deck (TSMC 0.25u `Nmod`/`Pmod` cards from corpus-f, binned VTH0/U0/K1, `VG = ±1.5 V`, `VD<k> = ±1.2 V` per transistor, geometries a = `L=0.25u W=40u`, b = `L=0.3u W=10u`, c = `L=0.25u W=20u`), run through `ngspice -b` (numdgt = 15) and spice-ts `simulate()`.

## Results (ngspice-47 i(vd<k>), rows that differ)

| Case | Device | ngspice-47 | main 4b58c417 | rel. err | this branch | rel. err |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Nmod 3.2.2 a,b,a | M0 a | -8.59431431e-3 | -7.66044081e-3 | 1.1e-1 | -8.59431431e-3 | 9.5e-11 |
| Nmod 3.2.2 a,b,a,b | M1 b | -1.73652204e-3 | -1.97819697e-3 | 1.4e-1 | -1.73652204e-3 | 1.7e-14 |
| Nmod 3.2.2 a,b,a,a | M0 a | -8.59431431e-3 | -7.66044081e-3 | 1.1e-1 | -8.59431431e-3 | 9.5e-11 |
| Nmod 3.2.2 a,a,b,c,b | M2 b | -1.74363822e-3 | -1.97819697e-3 | 1.3e-1 | -1.74363822e-3 | 3.9e-14 |
| Nmod 3.2 a,b,a,b | M1 b | -1.73652204e-3 | -1.97819697e-3 | 1.4e-1 | -1.73652204e-3 | 1.7e-14 |
| Nmod 3.2.2 a,b,a DELVTO=0.05 on M0 | M0 a | -8.02214644e-3 | -7.12055210e-3 | 1.1e-1 | -8.02214644e-3 | 9.3e-11 |
| Nmod 3.2.2 a,b,a, a's in subcircuits | X0 a | -8.59431431e-3 | -7.66044081e-3 | 1.1e-1 | -8.59431431e-3 | 9.5e-11 |
| Nmod 3.2.2 a,b,a local model, X1 and X2 | X1.M0 a | -8.59431431e-3 | -7.66044081e-3 | 1.1e-1 | -8.59431431e-3 | 9.5e-11 |
| Nmod 3.2.2 a,b,a local model, X1 and X2 | X2.M0 a | -8.59431431e-3 | -7.66044081e-3 | 1.1e-1 | -8.59431431e-3 | 9.5e-11 |
| Nmod+Pmod 3.2.2 interleaved | M0 NM a | -8.59431431e-3 | -7.66044081e-3 | 1.1e-1 | -8.59431431e-3 | 9.5e-11 |
| Nmod+Pmod 3.2.2 interleaved | M1 PM b | 6.55376871e-4 | 6.61668147e-4 | 9.6e-3 | 6.55376871e-4 | 1.5e-13 |

The other 35 rows (the instances that use their own record, and the VERSION = 3.2.4 / 3.3.0 controls) are within 1.2e-10 on both builds; worst row over all 46: 1.4e-1 on main, 1.2e-10 on this branch. Full rows: `before.json`, `after.json`.

Existing receipts do not move: `benchmarks/bsim3v32-594/compare.ts` 7576/7576 within 1% (43/43 cases, transient v(out) 2.77e-4, q(vdd) 2.75e-4 of peak), the same as before; its decks have distinct geometries per model. The corpus-f decks with VERSION = 3.2.2 cards (`tcl-testbench2`, `tcl-testbench4`) stay unsupported because of `NQSMOD=1` (#692).
