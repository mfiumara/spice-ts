# ngspice bug #664: .MEAS fails for certain border cases

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/664/ (status `open`, opened 2024-03-23)
- Category: frontend-ui
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment measuring_ctrl2_ltspice.cir.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`measuring_ctrl2_ltspice.cir`](measuring_ctrl2_ltspice.cir) (2184 B, sha256 `400b32e76be9a4be5081bb222f9a8016ac59cac5febb3c22481af10f6cf04680`)

Ticket attachments:

- [measuring_ctrl2_ltspice.cir](https://sourceforge.net/p/ngspice/bugs/664/attachment/measuring_ctrl2_ltspice.cir) (2184 B, sha256 `400b32e76be9a4be5081bb222f9a8016ac59cac5febb3c22481af10f6cf04680`)

Edits relative to the ticket: none

## Expected answer

v1=sin(2*pi*1000*t), v2=1.2*sin(2*pi*900*t). exper has no crossing in [1,1.1] ms, nonexistent v3 must error, unsupported expression crossings must be diagnosed rather than invent a value; yeval5 at 2 ms is -1.1412678196 V analytically (sample-linear interpolation incurs about 0.00036 V error here). (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | exper out of interval; yeval2 Cannot evaluate v(3); yeval3/4 Expressions ... not supported; yeval5=-1.14090 V. |
| ngspice master | right | Output identical to 47. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | right | Same four diagnosed measurement failures; yeval5=-1.14090718819 V, consistent with waveform sample interpolation. |

Reproduces on ngspice-47: no. Check: Missing node and expression crossings must fail explicitly, not return old spurious values; yeval5 near -1.14127 V.

Notes: Ticket mentions missing-node fix; 47 additionally explicitly diagnoses the unsupported expressions. Duplicate-name example is commented out and was not tested.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
