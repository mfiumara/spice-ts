# ngspice bug #780: NGspice Expression Parser Does Not Support if() Function Outside of PS/LTPS Modes, Causing Cross-Mode Compatibility Issues

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/780/ (status `open`, opened 2025-04-15)
- Category: parser
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment OP.zip.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 780`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/780/` and verifies the hashes):

- `OP.cir` (1808 B, sha256 `8c38360bfb8a26c7399a860bc947e0350d48e3474ebe9933705c740809fc69ce`)

Ticket attachments:

- [OP.zip](https://sourceforge.net/p/ngspice/bugs/780/attachment/OP.zip) (66176 B, sha256 `e20e4943755d8d96efb4a62384207c450d2cd398d57a23f3a575c962bdd2a07c`)

Edits relative to the ticket: none; Windows include names unchanged and supplied libraries mirrored at D:/ relative paths. External local .spiceinit used for ps-mode comparison.

## Expected answer

A PSpice vendor library using if(condition,a,b) requires the matching compatibility dialect; within it the expression selects a when condition is true and b otherwise. No native-mode if acceptance is promised; in the posted equal-slew example IP=IT, IN=-IT, CC=IT/SRP. (basis: documented-semantics)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Native Undefined parameter [if] in Op07.mod; confirmed ps mode completes OP (398 columns, 1 row), exit=0. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | With filesystem resolver: UnsupportedModelTypeError .model 'Rmod11' has unsupported type 'RES'; cannot reach if-expression test. |

Reproduces on ngspice-47: no. Check: Native Undefined parameter [if] is expected; confirmed ps mode produces a one-row operating point.

Notes: 771 and 780 contain duplicate identical OP.zip attachments. Native versus ps difference reproduces the observation, but it is dialect selection rather than incorrect numeric evaluation. CLI --ngbehavior flags in ticket are unsupported by this executable, so used local .spiceinit.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
