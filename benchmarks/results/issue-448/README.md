# Issue #448: NHFET level-5 `hfet-inverter` transient vs ngspice-47

Receipt: `report.json` (regenerate with `npx tsx benchmarks/results/issue-448/verify.ts --output benchmarks/results/issue-448/report.json`, check with `--check` after `pnpm -C packages/core build`).
Machine: Apple M5 Pro, macOS (Darwin 27.0.0 arm64), Node 22, Homebrew ngspice-47.

## Root cause of the ~2.27 V error

The error comes from the ngspice-47 reference, not from the spice-ts HFET1 equations.

`src/spicelib/devices/hfet1/hfetload.c` declares `int inverse=FALSE;` once at the top of
`HFETAload` and never resets it inside the instance loop. When the first instance in load order
has `vds < 0`, every HFET1 instance loaded after it in that Newton iteration is treated as inverted.
Its drain current is negated, Cgs/Cgd are swapped, and the companion current uses a negated vds,
even when that instance's own vds is positive.

In the unchanged fixture ngspice evaluates the `adrv` drivers before the `aload` loads. The
inverted state then reaches the loads, and ngspice converges to a non-physical point:
v(3) = v(4) ~ -0.275 V and i(vdd) ~ 1.3 nA. Each depletion load in that state has VGS = 0 and
VDS ~ 2.27 V, and on its own it carries ~0.55 mA.

Evidence (all in `report.json`, `ngspiceInstanceOrderSensitivity`):

| t = 0 operating point | v(3) | v(4) | i(vdd) |
|---|---|---|---|
| ngspice-47, unchanged fixture | -0.27545 V | -0.27554 V | 1.32e-9 A |
| ngspice-47, `z2` line moved above `z1` (electrically identical) | 1.95569 V | 0.20634 V | -5.755e-4 A |
| spice-ts, unchanged fixture | 1.95569 V | 0.20634 V | -5.755e-4 A |

A local diagnostic build of ngspice-47 makes one change to `hfetload.c`: it resets `inverse = FALSE;`
at the top of the per-instance loop. That build gives the same result for both line orders, and it
matches the Homebrew ngspice-47 bit-for-bit on the single-device sweep `hfet-reverse-iv.cir`, where
the flag cannot leak. The diagnostic build is not used in any committed receipt.

## Model fix in this change (order independent)

`hfetload.c` also calls `hfeta(..., vds>0 ? vgs : vgd, vds, ...)` after it has already negated
`vds`. As a result, inverse operation is always evaluated at the external VGS with |VDS|. spice-ts
used VGD, so its inverse-mode current did not match ngspice-47 on a single device.
`hfet-reverse-iv.cir` is the identical-netlist evidence:

| single-device `i(vd)` vs ngspice-47 | abs max | abs RMS | rel max |
|---|---|---|---|
| before (main 9b21238) | 1.828e-3 A | 7.16e-4 A | 69.8 |
| after | 1.066e-6 A | 2.11e-7 A | 6.3e-4 |

## Identical-netlist fixture numbers (Homebrew ngspice-47, published aggregate basis)

| signal | before abs max / RMS | after abs max / RMS |
|---|---|---|
| v(3) | 2.2312 / 1.2393 V | 2.2312 / 1.2339 V |
| v(4) | 2.2723 / 1.6112 V | 2.2723 / 1.6148 V |
| i(vdd) | 3.720e-3 / 1.004e-3 A | 3.720e-3 / 1.002e-3 A |
| i(vin) | 1.559e-3 / 2.151e-4 A | 1.559e-3 / 2.142e-4 A |

This stays a published loss. spice-ts does not emulate the order-dependent flag.

## Diagnostic: unchanged fixture vs ngspice-47 with the flag reset (not a published result)

| signal | before abs max / RMS | after abs max / RMS |
|---|---|---|
| v(3) | 0.0505 / 0.0158 V | 0.0504 / 0.0159 V |
| v(4) | 1.0401 / 0.2406 V | 1.0382 / 0.2352 V |
| i(vdd) | 2.368e-4 / 4.30e-5 A | 2.303e-4 / 4.20e-5 A |

The remaining v(4) error sits on one rising edge (1.07–1.09 ns, about 1 V per 5 ps), where spice-ts
lags by about 15 ps. The single-inverter DC transfer curve matches ngspice to below 1 uV between
VIN = 0 and 1 V, so this residual comes from transient charge integration. For voltage-dependent
capacitances, the engine's trapezoidal history is built from the static Jacobian at the new iterate
rather than from stored per-capacitor charge/current. That is outside the HFET device files.

`ngspice/mesa-oscillator` is unaffected: its spice-ts vs ngspice-47 per-signal metrics are
byte-identical before and after this change (no shared code path).
