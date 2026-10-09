# Advanced demo parity

The four advanced showcase demos use the exact netlists exported by
`advanced-demos.ts`. They were compared with the repository comparison harness
against native ngspice-47; the harness aligns ngspice onto the spice-ts frequency
or time grid with linear interpolation. AC results compare complex waveforms;
transient results compare real waveforms.

Reference command:

    ngspice -b -r <temporary-rawfile> <demo.cir>

Reference version:

    ngspice-47 (KLU build)

Results:

| Demo / signal | Netlist SHA-256 | Accepted points | Rejected points | Max absolute error | RMS absolute error | Max relative error | RMS relative error | Relative points excluded |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Series RLC Resonance `V(out)` | `6148b86a105c8a9c6e9c63849b561e47e5b41aee8e6f2654ac5cda179ddcdbdb` | 300 | 1 | 1.5018023623477313e-14 V | 2.525655055787886e-15 V | 5.193837132277615e-15 | 1.0502484362226137e-15 | 0 |
| Common-Source AC Gain `V(out)` | `bff079998316c3cd5be8ff1584870b57ef26ced73076ff141fb6de814e9bc30e` | 700 | 1 | 1.0116185666931292e-10 V | 1.0116185666931217e-10 V | 3.683948009708582e-10 | 3.683948009708593e-10 | 0 |
| Passive Notch Filter `V(out)` | `3614ca388b7ca960e161ae46ce13a2aad9332c41d1f120cbb38e249ce6283d97` | 300 | 1 | 1.904314177205826e-15 V | 5.543570290729444e-16 V | 2.6624070432496774e-13 | 1.592097827952444e-14 | 0 |
| Op-Amp Differentiator `V(in)` | `1ce3dadefb7f841188e77c49c416cc237c3ad0cf9f474c68edb0fbc75ba1274d` | 12185 | 0 | 1.3072876114961218e-14 V | 9.738264955474075e-16 V | 1.463734417994658e-12 | 3.564382720727414e-14 | 0 |
| Op-Amp Differentiator `V(out)` | `1ce3dadefb7f841188e77c49c416cc237c3ad0cf9f474c68edb0fbc75ba1274d` | 12185 | 0 | 9.42500985489092e-4 V | 4.6692933360586e-5 V | 9.170327455141932e-1 | 1.803405434052545e-1 | 401 |

Accepted points are spice-ts grid points inside the ngspice reference range;
rejected points are out-of-range points excluded before comparison. One endpoint
per logarithmic sweep is rejected because floating-point grid generation puts it
just outside the reference range. Relative error excludes reference magnitudes at
or below `1e-15`.

The differentiator's absolute waveform agreement is close, but its relative
`V(out)` error is poor near zero: max 0.917 and RMS 0.180, with 401 zero-reference
points excluded. This loss is preserved while its focused browser parity test
uses the shared showcase transient limits (2 mV max, 0.5 mV RMS). These are
measured results, not claims about other op-amp, MOSFET, or
RLC circuits. The BJT common-emitter and full-wave rectifier items in issue #30
remain unfinished and are not claimed by these demos.
