# BSIM3 RSH × NRD/NRS series resistance (#691)

ngspice-47 `b3set.c` / `b3v32set.c` (acmMod = 0) default the instance `NRD` and `NRS` to 1 square and put `RSH × NRD` and `RSH × NRS` in front of internal drain/source prime nodes whenever the product is non-zero; `b3ld.c` stamps `m × drainConductance`, so `M` divides the resistance. Before this change spice-ts dropped `RSH`, `NRD` and `NRS` for every BSIM3 revision without a warning.

spice-ts now inserts the same series resistors for LEVEL=8/49 (3.3.0 and every 3.2.x revision) in `Circuit.expandPassiveParasitics`, the same way BSIM1/BSIM2 do (`bsim3SeriesResistances` in `packages/core/src/devices/bsim3v3-params.ts`). A card with `ACM` ≠ 0 (ngspice's ACM resistance/junction model, which also changes the NRD/NRS defaults to 0) is now rejected with `UNSUPPORTED_MODEL_PARAMETER` instead of being simulated as ACM = 0.

## Reproduce

    pnpm install --frozen-lockfile && pnpm -C packages/core build
    pnpm exec tsx benchmarks/bsim3-rsh-691/probe.ts --output benchmarks/bsim3-rsh-691/after.json   # needs ngspice-47 on PATH
    pnpm -C packages/core exec vitest run src/devices/bsim3v3-series-resistance.test.ts

`before.json` is the same script against main `dc7cc4a3`'s build.

## Results (ngspice-47, identical decks, `VD d 0 ±2.5`, `VG g 0 ±2.5`, `M1 d g 0 0 MOD L=0.25u W=40u …`, `.op`)

| Case | ngspice-47 i(vd) | main dc7cc4a3 | rel. err | this branch | rel. err |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nmod 3.2.2, default NRD = NRS = 1 | -2.16714305e-02 | -2.37799406e-02 | 9.7e-02 | -2.16714306e-02 | 8.4e-10 |
| Nmod 3.2.2, NRD=0 NRS=0 | -2.37799406e-02 | -2.37799406e-02 | 2.9e-16 | -2.37799406e-02 | 2.9e-16 |
| Nmod 3.2.2, M=2 | -4.33428611e-02 | -4.75598813e-02 | 9.7e-02 | -4.33428611e-02 | 8.4e-10 |
| Nmod 3.2.2, NRD=2 NRS=0.5 | -2.24490681e-02 | -2.37799406e-02 | 5.9e-02 | -2.24490681e-02 | 1.2e-11 |
| Nmod 3.2.2, NRD=0 NRS=3 | -1.87951068e-02 | -2.37799406e-02 | 2.7e-01 | -1.87951068e-02 | 7.7e-10 |
| Nmod VERSION=3.3.0, default | -2.16714305e-02 | -2.37799406e-02 | 9.7e-02 | -2.16714306e-02 | 8.4e-10 |
| Nmod VERSION=3.2.4, default | -2.16714305e-02 | -2.37799406e-02 | 9.7e-02 | -2.16714306e-02 | 8.4e-10 |
| Pmod 3.2.2, default | 9.88967761e-03 | 1.02581772e-02 | 3.7e-02 | 9.88967761e-03 | 9.5e-12 |

The existing BSIM3 parity receipts do not move: `benchmarks/bsim3v32-594/compare.ts` 7576/7576 within 1% (43/43 cases, transient errors unchanged), `benchmarks/bsim3-dc-589/compare.ts` every op and sweep point within 1%, `benchmarks/bsim3-charge-626/compare.ts` 6696/6696 AC entries (31/31 cases). Their cards have no RSH, or (the #594 TSMC instances) set `NRD=0 NRS=0`.

Corpus: the only committed fixtures with a LEVEL=8/49 card and RSH > 0 are corpus-f `tcl-testbench2` and `tcl-testbench4`, which stay unsupported because every transistor sets `NQSMOD=1` (#692). No corpus outcome is claimed to change here.
