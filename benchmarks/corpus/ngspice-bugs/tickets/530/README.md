# ngspice bug #530: Various bugs with PULSE

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/530/ (status `open-accepted`, opened 2020-11-12)
- Category: simulator-numerics
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: inline in description; delay=-0.0005 and eighth parameter=90 in post arf1 2020-11-12.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`original.cir`](original.cir) (92 B, sha256 `1ac00e718c9ca259889bb16f4cbc23146d631444c6c7d8b9be4ccade8a1c46d7`)
- [`negative_delay.cir`](negative_delay.cir) (98 B, sha256 `b28967d318eb3103462f25edf4cdf481d945a783cf9519e2fd5cdf4efde5d237`)
- [`phase90.cir`](phase90.cir) (95 B, sha256 `19fe757a7d3c2b0d9ab1b8d17f38f2a53d0f5064dd187aa7f65a648a2b08c7b1`)

Edits relative to the ticket: Transcribed posted base circuit and reporter-specified negative-delay and eighth-parameter variants; no timestep/tolerance changes.

## Expected answer

For u=(t-TD) mod 2 ms, waveform rises linearly over 1 us, holds 1 V until u=1 ms, falls over 1 us, then holds 0. A negative TD=-0.5 ms yields V(0)=1 V without changing edge widths. Current native-ngspice syntax interprets the eighth PULSE parameter as pulse count NP, not phase; 90 therefore leaves the first two cycles unchanged (phase interpretation requires XSPICE compatibility mode). (basis: documented-semantics)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Binary raw samples of all three decks differ from analytic piecewise waveform by at most 3.01e-13 V; negative delay starts at 1 V and retains 1 us edges. |
| ngspice master | right | Output identical to 47. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | right | All native sample arrays exactly match piecewise pulse oracle to machine precision; negative-delay first/last1, phase90 same first two cycles as base. |

Reproduces on ngspice-47: no. Check: Check edge slopes remain 1 V/us with negative TD; interpret final 90 as NP in default mode, not phase.

Notes: Verified current vsrcload.c semantics: default NP, xs compatibility PHASE. Historical phase behavior in XS mode was not tested; no mode given in ticket. Raw sample checker in triage_raw.py.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
