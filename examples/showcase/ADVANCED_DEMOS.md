# Advanced demo parity

The two advanced showcase demos use the exact netlists exported by
`advanced-demos.ts`. Both were compared with the repository comparison harness
against native ngspice-47; the harness aligns ngspice onto the spice-ts frequency
grid with linear interpolation and compares the complex `V(out)` waveform.

Reference command:

    ngspice -b -r <temporary-rawfile> <demo.cir>

Reference version:

    ngspice-47 (KLU build)

Results:

| Demo | Netlist SHA-256 | Matched points | Max absolute error | RMS absolute error | Max relative error | RMS relative error |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Series RLC Resonance | `6148b86a105c8a9c6e9c63849b561e47e5b41aee8e6f2654ac5cda179ddcdbdb` | 300 | 1.5018023623477313e-14 V | 2.525655055787886e-15 V | 5.193837132277615e-15 | 1.0502484362226137e-15 |
| Common-Source AC Gain | `bff079998316c3cd5be8ff1584870b57ef26ced73076ff141fb6de814e9bc30e` | 700 | 1.0116185666931292e-10 V | 1.0116185666931217e-10 V | 3.683948009708582e-10 | 3.683948009708593e-10 |

One endpoint per logarithmic sweep is excluded because floating-point grid
generation puts it just outside the reference range. No zero-valued reference
samples were excluded. These are measured results, not claims about other
MOSFET or RLC circuits.
