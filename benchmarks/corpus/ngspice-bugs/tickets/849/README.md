# ngspice bug #849: Crash caused by a loop of current sources

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/849/ (status `open`, opened 2026-07-13)
- Category: simulator-numerics
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment rhs_size_bare_current_node_repro.cir.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`rhs_size_bare_current_node_repro.cir`](rhs_size_bare_current_node_repro.cir) (384 B, sha256 `532dd21992d1ca6e17961ea39516c4039ef6bf84bb8d92c50c9ed48a132d2616`)
- [`sparse.cir`](sparse.cir) (400 B, sha256 `0551abd8b8dbbdee6f383737f58f8ae4776118f58e26d490bee12afe87f704d7`)
- [`klu.cir`](klu.cir) (397 B, sha256 `fd18ab7a654518767b74c854b76f9f73b0817c7d7d05ff8fc43c84f20f901a2d`)

Ticket attachments:

- [rhs_size_bare_current_node_repro.cir](https://sourceforge.net/p/ngspice/bugs/849/attachment/rhs_size_bare_current_node_repro.cir) (384 B, sha256 `532dd21992d1ca6e17961ea39516c4039ef6bf84bb8d92c50c9ed48a132d2616`)

Edits relative to the ticket: Original unchanged; required solver-only variants add .options sparse or klu.

## Expected answer

Each node receives and emits 1 mA; KCL reduces to 0=0 with no admittance constraints. All node voltages are undetermined, so an explicit singular-matrix diagnosis or documented arbitrary gauge is acceptable, but a memory fault is not. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Sparse original and variant exit0 with n1=n2=n3=0; KLU prints empty-matrix/null-object errors but exits0 with zeros. No SIGSEGV/SIGABRT. |
| ngspice master | right | Output identical to 47 (no crash). [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | right | SingularMatrixError: zero pivot at matrix column 0 (node n1) - the explicit singular-matrix diagnosis the expected answer allows (KCL gives 0=0, node voltages undetermined). .options klu/sparse variants are rejected as unsupported options. |

Reproduces on ngspice-47: no. Check: A loop with no admittance constraints must not crash; 47 exits without memory signal on original/Sparse/KLU.

Notes: Spice-ts singular diagnosis is mathematically appropriate, not issue-worthy. Ticket supplies explicit RHS-allocation patch; 47 safety observed only, no sanitizer run.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
