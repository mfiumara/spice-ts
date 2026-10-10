# Issue #75 DEC/OCT resistor-noise parity receipt

Date: 2026-10-10
Reference: ngspice-47, KLU build (`ngspice --version`)

## Method

The committed decks are used unchanged by spice-ts and ngspice. The exact ngspice commands were:

```sh
ngspice -b -n -r noise-dec.raw benchmarks/results/issue-75/noise-dec.cir
ngspice -b -n -r noise-oct.raw benchmarks/results/issue-75/noise-oct.cir
ngspice -b -n -r noise-rc-dec.raw benchmarks/results/issue-75/noise-rc-dec.cir
```

The binary raw files contain both `Noise Spectral Density Curves` and `Integrated Noise` plots. High-precision text receipts were independently obtained by appending only batch output-control commands (`set numdgt=15`, `run`, `setplot noise1`, `print all`, `setplot noise2`, `print all`) to temporary copies. The circuit and `.noise` cards were unchanged.

Metrics compare matched frequency points. Absolute and relative errors are computed per point; RMS is `sqrt(sum(error^2) / N)`. Integrated-total errors are scalar absolute and relative errors.

## Before

Both DEC and OCT forms failed with an explicit unsupported `.noise` `ParseError`; no spice-ts grid, density, or integrated-total result existed.

## After

| Sweep | Grid | Frequency max abs / RMS abs (Hz) | Frequency max rel / RMS rel | Output density max abs / RMS abs (V/sqrt(Hz)) | Output density max rel / RMS rel | Input density max abs / RMS abs (V/sqrt(Hz)) | Input density max rel / RMS rel |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| DEC 3, 100 Hz–10 kHz | 7/7 matched | 9.094947017729282e-13 / 3.850815745723822e-13 | 2.1107502259896036e-16 / 1.2836786165557234e-16 | 7.0773195949503275e-15 / 7.077319594950328e-15 | 1.7383133776154074e-7 / 1.7383133776154074e-7 | 7.0773196098395785e-16 / 7.0773196098395785e-16 | 1.738313381272468e-7 / 1.738313381272468e-7 |
| OCT 3, 100 Hz–800 Hz | 10/10 matched | 5.684341886080802e-14 / 2.8774787681579403e-14 | 1.790455499268082e-16 / 1.0113380856982797e-16 | 7.0773195949503275e-15 / 7.0773195949503275e-15 | 1.7383133776154074e-7 / 1.7383133776154072e-7 | 7.0773196098395785e-16 / 7.0773196098395785e-16 | 1.738313381272468e-7 / 1.738313381272468e-7 |

| Sweep | Total | spice-ts | ngspice-47 | Absolute error | Relative error |
| --- | --- | ---: | ---: | ---: | ---: |
| DEC | output RMS | 4.050964227817867e-6 | 4.050963523633458e-6 | 7.041844092496694e-13 | 1.7383133793761258e-7 |
| DEC | input RMS | 4.0509642278178667e-7 | 4.050963523633458e-7 | 7.041844088261529e-14 | 1.7383133783306547e-7 |
| OCT | output RMS | 1.077183843445491e-6 | 1.077183656197215e-6 | 1.872482760936978e-13 | 1.7383133787486253e-7 |
| OCT | input RMS | 1.0771838434454913e-7 | 1.077183656197215e-7 | 1.872482762525165e-14 | 1.7383133802230132e-7 |
| RC DEC | output RMS | 6.296944847716420e-8 | 6.296943753110260e-8 | 1.094606160386110e-14 | 1.738313383926050e-7 |
| RC DEC | input RMS | 1.444117823593090e-6 | 1.444117572560201e-6 | 2.510328889763813e-13 | 1.738313373829654e-7 |

The RC fixture exercises ngspice-compatible per-source log-log integration rather than only a flat spectrum. The focused test repeats each flat-spectrum spice-ts run and requires bit-identical structured integrated totals.

## Deliberate residuals

Issue #75 remains open. Differential and current outputs, temperature cards, semiconductor and flicker noise, stepped noise, `.pz`, `.sens`, and `.disto` remain explicitly unsupported/rejected. The implementation must not be read as parity for those variants.
