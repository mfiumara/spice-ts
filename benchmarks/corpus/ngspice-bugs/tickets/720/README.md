# ngspice bug #720: AC sensitivity analysis crashes with KLU

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/720/ (status `open`, opened 2024-11-21)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: upstream examples/tclspice/tcl/diffpair.cir referenced in ticket description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 720`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/720/` and verifies the hashes):

- `klu.cir` (552 B, sha256 `d69e8dd3b829d2ece5550bc7a1929e2fece412290162429b91c25d691f88f0fc`)
- `sparse.cir` (555 B, sha256 `d84e0e8ae17b0d372b9d43046e4be5c147a20601485f377ef50ec26956a2acf4`)
- `diffpair.cir` (539 B, sha256 `7cf527aff5ea8006359d597698880beed2680c08a2c4c71fdeed14477fbbd3d7`)

Edits relative to the ticket: Copied exact referenced upstream example; appended ac dec 5 10k 10meg to .sens as ticket instructs. Added required solver-only variants; devices unchanged.

## Expected answer

AC sensitivity solves the differentiated linear system A dx/dp=db/dp-(dA/dp)x and returns finite derivatives for a well-posed biased differential pair. Changing direct-solver storage must not cause a null-pointer dereference; exact transistor sensitivity values were not independently derived. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | KLU SIGSEGV exit139; Sparse and unqualified deck complete16 AC sensitivity rows and two TF results. |
| ngspice master | error | Identical to 47: KLU AC-sensitivity deck segfaults (exit 139); Sparse deck runs. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | #812 refresh d8ab9d33: all three reconstructed decks match pinned SHA256. klu.cir/sparse.cir first fail at Unsupported .options field klu/sparse (line 2); unqualified diffpair.cir first fails at Unsupported .sens form (line 27: .sens v(5,4) ac dec 5 10k 10meg). Native ngspice KLU crashes; unqualified/Sparse produce no operating-point raw plot for this adapter. No spice-ts metrics. Both gaps remain in existing #812. |

Reproduces on ngspice-47: yes. Check: Running klu.cir produces SIGSEGV/exit139 during AC sensitivity; sparse.cir completes16 rows.

Candidate upstream fix: Allocate/initialize the sensitivity delta_Y KLU matrix before complex rebinding, or reject unsupported KLU sensitivity before dereferencing it.

Notes: Referenced upstream example is third-party, fetch-only. Numeric derivative values are not validated; oracle is memory-safe completion of a valid analysis.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
