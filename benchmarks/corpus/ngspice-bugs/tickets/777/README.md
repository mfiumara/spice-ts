# ngspice bug #777: Unexpected glitches from simulaiton

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/777/ (status `open`, opened 2025-04-15)
- Category: simulator-numerics
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachments sub_s20p_tran_test_1.sp and mini_DP_16ord.subckt.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 777`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/777/` and verifies the hashes):

- `klu.cir` (544 B, sha256 `510b3b01c7bca1baec73541af8bd4fde2fd6bd64d6e4ff311946d0866bbf9d73`)
- `sparse.cir` (547 B, sha256 `62be4946dc7ad7465af08b6af2a37ccdd944b630957a1819acc8344310487f01`)

Ticket attachments:

- [fig_0415.png](https://sourceforge.net/p/ngspice/bugs/777/attachment/fig_0415.png) (13847 B, sha256 `0d01b4516a921b4fdd76f9f15f640a66927b4cdaf37ee3f183237734459ce66d`)
- [mini_DP_16ord.subckt](https://sourceforge.net/p/ngspice/bugs/777/attachment/mini_DP_16ord.subckt) (963127 B, sha256 `044bb979a60a597abe01424a3c0163f62406392e44ab59ba290a5f0f4df49485`)
- [sub_s20p_tran_test_1.sp](https://sourceforge.net/p/ngspice/bugs/777/attachment/sub_s20p_tran_test_1.sp) (543 B, sha256 `a361932a8c13865537af2b75dd407b1b21b74df99e9bab072e0b7d523fea4e88`)

Edits relative to the ticket: Original source and963127-byte synthesized subcircuit copied unchanged; required solver-only variants select klu/sparse. No waveform/timestep/model tuning. Binary raw selected columns exported to small JSON for inspection.

## Expected answer

undetermined for the synthesized network output: a963KB rational20-port macromodel is not guaranteed to be passive or monotonic, so smooth green/yellow agreement cannot be asserted without an independently validated transfer model and identified trace. The source itself is exactly0 V through1ns, linear0-to-1 V over1..1.025ns, then1 V; that piecewise-linear source expectation is analytic. (basis: undetermined)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Both solvers complete2061 rows through10ns; source samples match analytic PWL within6.66e-16 V. During1..1.08ns v1 spans[-.769404365,1.270835477], v2[-.332858586,.324816278] with finite samples on both. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | Unsupported .options field: 'klu' and 'sparse'. |

Reproduces on ngspice-47: partially. Check: Oscillatory values remain in1..1.08ns on both solvers, but ticket does not identify trace or establish a correct macromodel-output oracle.

Notes: Right ngspice verdict is restricted to analytic source evaluation and finite completed run, NOT certification of synthesized output accuracy. Independent waveform correctness remains undetermined; simulator agreement is not an oracle. Large third-party/synthesized model: fetch-only. PNG deliberately skipped.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
