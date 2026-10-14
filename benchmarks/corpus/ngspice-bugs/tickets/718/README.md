# ngspice bug #718: Using The KLU Solver does not emulate successfully

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/718/ (status `open`, opened 2024-11-18)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: inline in description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 718`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/718/` and verifies the hashes):

- `klu.cir` (11355 B, sha256 `26f315bd257cf82dbc539a728de09c5991108c4b354c529650705ce677fb4100`)
- `sparse.cir` (11358 B, sha256 `f2f1acf5dfe35262e5341b013aae60b59567e4efb02fd3dc4e7739b950b335e0`)

Ticket attachments:

- [aaa.raw](https://sourceforge.net/p/ngspice/bugs/718/attachment/aaa.raw) (133182 B, sha256 `d89171ff38353224cf6392ea249ec9d39d5689eab759e4df9f5f87af46df5f03`)

Edits relative to the ticket: Literal inline deck transcribed with its provided models; required solver-only variant switches .options klu to sparse. No physics/geometry/connection changes.

## Expected answer

This is not a well-posed accuracy benchmark: V1,V4 and L1 impose redundant zero-voltage constraints between the same nodes, leaving an ideal-source/inductor loop with nonunique branch currents. A floating switch control and pathological BSIM geometry further complicate DC. All AC source magnitudes are zero, so the unique well-posed small-signal voltage solution would be zero; Sparse completion is not a proof the DC state is valid. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | KLU singular matrix mn1#source, gmin/source steps fail and final op dump contains NaNs/1e296; exits1. Sparse also reports singular l1#branch but exits0 with61 AC rows of zeros. |
| ngspice master | error | Output identical to 47 (singular-matrix warnings; KLU vs Sparse disagree the same way). [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | #812 refresh d8ab9d33: both hash-verified inline variants first fail at ParseError line 2, Unsupported .options field klu/sparse. Native ngspice-47 KLU fails; Sparse completes AC but historical zero output is not a correctness oracle. No spice-ts metrics. Existing #812. |

Reproduces on ngspice-47: yes. Check: KLU exits1 after singular/convergence failure; Sparse61 zero AC rows do not certify this redundant/floating DC network.

Notes: Large12KB synthetic/model text: fetch-only. Related #725 developer comments explicitly warn about invalid netlist/trolling. No independent finite DC solution established; no spice-ts correctness issue inferred.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
