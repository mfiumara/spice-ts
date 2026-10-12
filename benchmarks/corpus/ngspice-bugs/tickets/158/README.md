# ngspice bug #158: PZ analysis gives wrong results

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/158/ (status `open`, opened 2011-08-20)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: attachment amp3.tar.gz.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 158`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/158/` and verifies the hashes):

- `dot.cir` (2592 B, sha256 `7e943e7c63cfbb2a5724ab5d01f2d91591d9f78a60e2966ecd91d62f92cd9b35`)

Ticket attachments:

- [amp3.tar.gz](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/66fadc46/d0ea/attachment/amp3.tar.gz) (35317 B, sha256 `8faad0095ffa7d9d353f7f82ecdbc804f3fa0a85cc4692de0c926343df362413`)

Edits relative to the ticket: Preserved original amp3.net and model cards. Replaced control tf/pz/print by .tf/.pz/.print pz all; all original device/model/options/measurements retained.

## Expected answer

undetermined: the correct poles are finite roots of the independently evaluated small-signal G+sC determinant, and zeros derive from the input/output bordered system. BSIM3 bias-dependent coefficients were not independently evaluated within this ticket budget; do not assume reported complex pair or either simulator poles are the oracle. (basis: undetermined)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | PZ reports iteration limit reached after501 and253 trials; emits22 real poles including RHP1.547593e11/1.668718e12 and4 real zeros, no complex pair. TF prints1.000117. |
| ngspice master | error | Output identical to 47 (same warnings and results). [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | Unsupported .options field: 'PROBE' in .OPTION POST PROBE UNWRAP nomod. |

Reproduces on ngspice-47: partially. Check: Check explicit PZ iteration-limit warnings and absent complex pair; roots require an independent G+sC oracle before labeling individual values wrong.

Notes: Numeric root correctness is deliberately undetermined, not inferred from simulator disagreement. Ticket contains a historical null-feedback-pointer crash fix, not a solution of the root-finding defect. Third-party process libraries imply fetch-only.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
