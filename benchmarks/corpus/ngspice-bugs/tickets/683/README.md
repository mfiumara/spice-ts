# ngspice bug #683: LED_GENERAL failed test in Ngspice 43

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/683/ (status `open`, opened 2024-08-01)
- Category: device-model
- Outcome: ngspice defective, spice-ts correct

## Decks

Origin: attachment Test.zip.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 683`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/683/` and verifies the hashes):

- `Test/test.cir` (676 B, sha256 `af0838fa65337bacfadde79c8612c24e85546f7278611361cc78566ba8c624e9`)

Ticket attachments:

- [Test.zip](https://sourceforge.net/p/ngspice/bugs/683/attachment/Test.zip) (29860 B, sha256 `597345dbf8fa3eacd25d788de70851806b9390864bdfd70dc07e78a7dc3a98f4`)

Edits relative to the ticket: none; preserved Windows include cards and mirrored supplied libraries at matching D:/ relative paths.

## Expected answer

The deck's only source is V1 = 89 V DC and the transient starts from the DC operating point (no UIC), so the exact transient solution is that operating point at every time point; ngspice-47 .op on the same deck in ltps mode gives v(net-_v1-e1_) = 71.19997 V, v(net-_v1-e2_) = v(net-_r1-pad1_) = -17.8 V and ~0 V on the LED/MOSFET nodes. The timestep failure at 1.95 fs is therefore a solver failure, not circuit behaviour. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | Timestep too small at 1.95313e-15s, timestep=1.25e-22, LED_GENERAL d1; 2 rows; native and ps. |
| ngspice master | error | Same failure as 47: "Timestep too small ... trouble with led_general-instance d1" (at 1.25e-13 s instead of 1.95e-15 s). [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | right | PSpice `RES` (#823) and `VSWITCH` (#825) accepted: the 100 ns transient completes (1008 points). Its t = 0 operating point matches ngspice-47 .op (v(net-_v1-e1_) = 71.199966 V, v(net-_v1-e2_) = -17.800034 V, v(net-_r1-pad1_) = -17.799982 V, LED/MOSFET nodes 0 V) and every node stays within 2.2e-5 V of its t = 0 value over 0-100 ns (largest drift on net-_v1-e1_/net-_d1-a_). [spice-ts at the #825 branch, simulate() with a filesystem include resolver mapping the D:/spice_lib paths to the attached libraries] Before #825: PSpice `RES` model type accepted since #823; every deck now stops at the next vendor-library construct: UnsupportedModelTypeError .model 'SMOD1' has unsupported type 'VSWITCH' (PSpice switch model, ngspice translates it in PSpice compatibility mode; tracked in https://github.com/mfiumara/spice-ts/issues/825). Before #823: With filesystem resolver: UnsupportedModelTypeError .model 'Rmod11' has unsupported type 'RES'. |

Reproduces on ngspice-47: yes. Check: Transient aborts after only 2 rows, far short of the requested 100ns.

Notes: Native and PSpice modes both fail in ngspice-47. Model libraries are third-party and fetch-only; no parameter or topology changes. Expected answer revised in #825 from "undetermined": the deck has only a DC source, so the operating point is the exact transient solution.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
