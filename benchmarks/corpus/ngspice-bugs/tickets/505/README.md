# ngspice bug #505: non-deterministic behaviour of DC transient solution (fcn limit)

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/505/ (status `open-accepted`, opened 2020-08-03)
- Category: parser
- Outcome: ngspice defective, spice-ts correct

## Decks

Origin: attachments Vsetpoint.cir and Potentiometer.lib.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 505`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/505/` and verifies the hashes):

- `dot.cir` (441 B, sha256 `3d70bc6c346324e2872bd5a4d8678ebc262d85a5522c753a3517643ebd5ca85b`)

Ticket attachments:

- [Potentiometer.lib](https://sourceforge.net/p/ngspice/bugs/505/attachment/Potentiometer.lib) (490 B, sha256 `3c958c4fd0675f582cf0bbdfc77530f5c29222e95fa0fd515710c39cd69863ff`)
- [Screenshot at 2020-08-03 12-56-00.png](https://sourceforge.net/p/ngspice/bugs/505/attachment/Screenshot%20at%202020-08-03%2012-56-00.png) (120344 B, sha256 `6a8ae70bd9926e7685c8d0f7685624ef332d6a34fd0201313de715b650912ad3`)
- [Vsetpoint.cir](https://sourceforge.net/p/ngspice/bugs/505/attachment/Vsetpoint.cir) (464 B, sha256 `da37f85efe5270cb98da815e152bb5d5d37434675baef15ffed81f8e8eeb1e56`)
- [alternate](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/18f7ba444c/9ebc/attachment/alternate) (583 B, sha256 `c10c9c8994e206c73d4cfbb824e9ccd26c145fe620aa1abe7c5a0cf60a0e7cc6`)

Edits relative to the ticket: Preserved originals and library; removed control version command, keeping identical .tran/devices/parameters. Four independent runs of same deck; no clamp-function replacement.

## Expected answer

In native ngspice numparam LIMIT is a two-argument random nominal-plus-or-minus-variation function; three-argument clamping belongs to compatibility functions or an explicit user .func. Invalid three-argument use should be diagnosed rather than silently creating arbitrary resistances. Under intended clamp semantics w=.01 would give R0=9900,R1=100 ohm and a deterministic passive RC response, but that is not the default-mode deck supplied. (basis: documented-semantics)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | Identical input over4 runs: three timestep-too-small aborts around .00821441/.00827441 s, one exit0 with351 rows. Combined ng47.out preserves all runs. |
| ngspice master | right | dot.cir completed in 6/6 master runs (ngspice-47 aborted with "Timestep too small ... cause unrecorded" in 1 of 6 runs and in the first side-by-side run). Non-determinism means 6 clean runs are evidence, not proof, of a fix. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | right | Since #870 spice-ts reads three-argument limit(x, lo, hi) as the clamp (ngspice-47 inpcompat.c compatibility .func limit, bounds in either order) in every mode and reports the random two-argument limit(nominal, variation) instead of drawing a value; it does not diagnose the three-argument form. dot.cir with the attached Potentiometer.lib: w=0.01 (R0=9900, R1=100 ohm), 349 rows to 0.3 s, deterministic. Against ngspice-47 with `set ngbehavior=ps` (compat clamp applied to the included library; 3/3 runs complete with 349 rows, while 3/3 default-mode runs abort with timestep too small at .00821441/.00827441 s) at the ngspice timepoints: max \|dV\| 3.3e-15 V(vset), 2.6e-15 V(vdrain), 7.9e-14 V(vpot), 2.3e-14 V(vref); final V(vset)=4.807534111921768e-3 vs 4.807534111921781e-3. Before #870: Cannot parse number: 'limit ( wiper 0 1 )' during subcircuit parameter evaluation. |

Reproduces on ngspice-47: yes. Check: Repeat dot.cir without changing library; same deck alternates between351-row completion and timestep-too-small near8.2ms.

Candidate upstream fix: Validate built-in numparam LIMIT arity and diagnose misuse; distinguish statistical LIMIT(x,variation) from compatibility clamp LIMIT(x,lo,hi).

Notes: Read native numparam limit(nominal,abs_variation) and compatibility clamp definitions; the observed randomness is not necessarily uninitialized memory. Potentiometer macro credited to external launchpad source: fetch-only.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
