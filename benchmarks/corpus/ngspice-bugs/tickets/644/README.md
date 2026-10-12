# ngspice bug #644: DC Transient issue (as shared module)

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/644/ (status `open`, opened 2023-09-21)
- Category: platform
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment dctran_issue.cir.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`dctran_issue.cir`](dctran_issue.cir) (301 B, sha256 `ceb164fef466a61e8e7a3bf11ec0a800df3c9d824888c3f4f72199cd4e4d6755`)

Ticket attachments:

- [dctran_issue.cir](https://sourceforge.net/p/ngspice/bugs/644/attachment/dctran_issue.cir) (301 B, sha256 `ceb164fef466a61e8e7a3bf11ec0a800df3c9d824888c3f4f72199cd4e4d6755`)

Edits relative to the ticket: none; batch raw output requested with -r, original1ms transient timestep retained.

## Expected answer

A 1 V control at the last frequency-array point requests10 kHz triangle, period100 us, output bounds[-1,1] V and half-period50 us ramps. The sharedsync backup path must make forward progress even when requested output timestep1ms exceeds the oscillator period; sampled-output count is not a guaranteed oracle. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | CLI completes1072 transient rows in.007s; initial net_4=-1 V. No endless loop in command-line run. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | UnsupportedCodeModelError: XSPICE code model 'triangle' is not supported. |

Reproduces on ngspice-47: n/a. Check: CLI dctran_issue.cir exits0; ticket shared-library callback hang requires a DLL harness not supplied.

Notes: Only CLI reproduction attempted; shared-module-specific bug is not tested, and full waveform accuracy was not certified. Reporter acknowledges oversized timestep. Do not reduce timestep to the suggested50us to make it pass.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
