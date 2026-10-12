---
"@spice-ts/core": minor
---

`.control` scripts can now run `linearize`, `fft` and `psd` (#752), ported from ngspice-47 (linear.c, interpolate.c, com_fft.c with its FFTW path, fftext.c windows). `linearize [np=n] [vec ...]` re-interpolates the current transient plot onto the `.tran` step grid in a new `tran<n>` plot. `fft vec ...` and `psd navg vec ...` create an `sp<n>` spectrum plot with a `frequency` scale, honouring `set specwindow` / `specwindoworder`. Every length is transformed exactly without zero padding. Values match ngspice-47 to 1e-11 relative on the reference decks. examples/transient-noise/noi-sc-tr.cir now runs end to end.
