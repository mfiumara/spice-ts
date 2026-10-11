# S/W switches vs ngspice-47 (issue #507)

Reproducible parity evidence for the S (`.model SW`) and W (`.model CSW`)
switches. Sources and licences: `benchmarks/SOURCES.md`, section
"S/W switches, issue #507".

    pnpm exec tsx benchmarks/switches-507/compare.ts

The script needs `ngspice` on PATH (ngspice-47 was used). It runs every
fixture through both engines on the same netlist text and writes
`report.json`.

## Fixtures

| Fixture | Analysis | What it covers |
|---|---|---|
| `switches-manual-p92.cir` | `.tran 2us 5ms` | ngspice manual example, byte-identical upstream (CRLF). SW with VH>0, ON/OFF flags starting inside the window, CSW. |
| `hysteresis.cir` | `.tran 2u 2m` | SW with VH>0 and VH<0 (negative-hysteresis quirks, ON flag), CSW with a 1 nF load. |
| `ac-closed.cir` | `.ac` | SW closed at the operating point (2 V > VT). |
| `ac-window.cir` | `.ac` | SW `ON` flag (closed at the OP, HYST_ON) and SW `OFF` flag inside the window (vc = 0.9 V, VT = 1, VH = 0.2). |
| `ac-csw.cir` | `.ac` | CSW closed at the operating point (2 mA > IT). |
| `noise-sw.cir`, `noise-csw.cir` | `.noise` | SW / CSW closed at the operating point, ROFF comparable to the load so the switch noise matters. |

## Small-signal behaviour (AC, noise, pole-zero)

Before AC, noise and pole-zero ngspice loads every device once in
MODEINITSMSIG. `swload.c` / `cswload.c` then set state0 to CKTstate1.
CKTstate1 is not advanced during an operating point, so it is still 0
(REALLY_OFF). SWacLoad, SWpzLoad and SWnoise / CSWnoise therefore use ROFF,
even when the operating point closed the switch. spice-ts does the same.
The fixture results below show this directly: with RON the AC decks would give
0.5 / 0.428571 / 0.5, and the noise decks 4.07e-12 V/rtHz.

`.pz` is covered by the unit test `places the .pz pole with ROFF` in
`packages/core/src/devices/switch.test.ts` (`.pz o 0 o 0 cur pol`: ngspice-47
pole -1.00100e+03, spice-ts -1001). `.pz vol` accepts only R/L/C in spice-ts.

## Results (ngspice-47, from `report.json`)

Small signal:

| Fixture | Vector | ngspice-47 | spice-ts | max rel err |
|---|---|---|---|---|
| `ac-closed.cir` | vm(o) | 0.999000999 | 0.999000999000999 | 1.0e-12 |
| `ac-window.cir` | vm(o) | 0.998003992 | 0.998003992015968 | 1.6e-11 |
| `ac-csw.cir` | vm(o) | 0.999000999 | 0.999000999000999 | 1.0e-12 |
| `noise-sw.cir` | onoise / inoise | 2.87889442e-09 / 5.75778883e-09 | 2.878895e-09 / 5.75779e-09 | 1.7e-7 |
| `noise-csw.cir` | onoise / inoise | 3.52591117e-09 / 4.7012149e-09 | 3.525912e-09 / 4.701216e-09 | 1.7e-7 |

The 1.7e-7 noise residual is the Boltzmann constant: spice-ts uses the exact
SI value 1.380649e-23, ngspice CONSTboltz is 1.38064852e-23. The ratio is
3.5e-7 in power, 1.7e-7 in density. It is the same for resistor noise.

Transient. `atNgspicePoints` is the max |spice-ts - ngspice| in volts with
spice-ts interpolated onto the ngspice timepoints. `atSpiceTsPoints/peak` is
the corpus-harness view: ngspice interpolated onto the spice-ts timepoints,
divided by the ngspice peak.

| Fixture | Vector | atNgspicePoints (V) | atSpiceTsPoints / peak |
|---|---|---|---|
| p92 | v(1) | 5.6e-16 | 2.8e-16 |
| p92 | v(10) | 2.0e-16 | 0.865 |
| p92 | v(2) | 5.0e-16 | 2.5e-16 |
| p92 | v(20) | 2.0e-16 | 0.615 |
| p92 | v(30) | 2.0e-16 | 0.532 |
| p92 | v(40) | 1.8e-10 | 0.708 |
| hysteresis | v(c) | 4.0e-09 | 2.0e-09 |
| hysteresis | v(o1) | 2.0e-16 | 0.740 |
| hysteresis | v(o2) | 2.0e-16 | 0.739 |
| hysteresis | v(o3) | 0.072 | 0.317 |

Losses and why:

- The harness-view numbers (0.53 to 0.87) are not level errors. A switch
  edge is a step. spice-ts puts a timepoint at the edge, inside one ngspice
  step. Interpolating ngspice linearly across that step gives a large
  difference at that one spice-ts point. At the ngspice timepoints the
  switched levels agree to 1e-16 V. These losses are published as is; the
  harness metric is not changed for this device.
- `hysteresis.cir` v(o3) differs by 0.072 V at one ngspice timepoint
  (600.56 us). The CSW control crosses IT+IH = 1.2 mA exactly at 600 us.
  ngspice closes the switch at its 600.56 us step and takes a 2 us step into
  the 10 us RC transient of the 1 nF load (0.571 V at 600.56 us). spice-ts
  closes it at 600.04 us and resolves the RC with small steps. Both settle to
  2/11 V. CSW never limits the timestep in ngspice (CSWctrlvalue is not
  stored), so the edge lands wherever the step grid puts it in each engine.
  This is a timestep difference, not a model difference, and it is reported
  as a loss.
