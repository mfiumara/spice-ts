# #812 refresh: original 25 blocked ngspice tickets

Core baseline: current origin/main `d8ab9d3374d8ada21f7d9dd221c3fc3595aa5783` (2026-10-14). Node v22.23.1, darwin arm64 Apple M5 Pro, Homebrew ngspice-47. This is an execution re-triage, not a new superiority claim. No core, tolerance, deck or pinned-hash changes.

## Coverage and counts

The original #812 denominator stays **25 tickets**, not 25 individual files. There are **43 selected deck variants**: **38 hash-verified executions across 21 tickets**, and **5 missing pinned variants across 4 tickets**. A provenance gap is not a current simulator error or a win. Successful parsing is not a waveform oracle.

| Exclusive first-gap / outcome bucket | Original #812 | Refresh | Tickets now |
|---|---:|---:|---|
| PSpice RES model | 9 | 0 | resolved; subsequent outcomes below |
| rshunt | 3 | 0 | resolved |
| klu / sparse options | 6 | 7 | 645 (partial noise success), 690, 691, 718, 720, 725, 852 |
| ngbehavior option | 1 | 1 | 695 |
| PROBE / POST options | 1 | 0 confirmed | 158 not currently runnable: provenance gap |
| .param functions | 1 | 0 | 871 succeeds |
| three-argument limit | 1 | 0 | 505 succeeds |
| BJT VAR noise rejection | 1 | 0 | 645 dot deck succeeds; solver variants remain blocked |
| d_pulldown | 1 | 1 | 398 |
| ps / lt negative sqrt semantics | 1 | 1 | 828 |
| transient timestep failure | 0 | 1 | 764 |
| vendor singular matrix | 0 | 1 | 795 |
| missing pinned-variant provenance | 0 | 4 | 158, 738, 791, 794 |
| runs but independent waveform oracle absent | 0 | 1 | 737 |
| fully runnable, existing independent answer retained / checked | 0 | 8 | 505, 683, 685, 740, 745, 761, 763, 871 |
| Total | 25 | 25 | |

Ticket 720 also rejects the unqualified differential AC `.sens v(5,4)` card; it is counted only once in the solver bucket. Thus 9 tickets are completely feature-blocked, 1 is partially unblocked (645), 2 fail execution, 4 have provenance gaps, 1 is unvalidated despite execution success, and 8 are fully runnable with existing answer checks. **#812 remains open.**

On the immediate pre-refresh manifest (rather than the original issue): right **7 -> 8**, unsupported **18 -> 15**, execution error **0 -> 2**. The legacy renderer groups error, unsupported and unscored rows into its "cannot run" outcome; those **17** rows are NOT 17 parser failures. In particular, 737 runs but has no independent answer, and 645 runs noise without solver selection. No renderer or metric code was changed to hide this limitation.

## Measured errors on complete, usable native references

These metrics come from the existing comparison harness, on its spice-ts grid with linear alignment. They are losses, not zero-error parity. Full signal metrics (including missing vectors) are retained in the receipt; the table selects the historically tracked i(V1), not a new tolerance envelope. One final endpoint lies outside the ngspice grid on each listed transient and is excluded, not clamped.

| Ticket / variant / signal | Matched points | Absolute max | Absolute RMS | Relative max | Relative RMS |
|---|---:|---:|---:|---:|---:|
| 645 dot / onoise_spectrum | 84 | 2.9478846941461046e-14 | 2.0805582685808688e-14 | 1.2817787191677196e-7 | 1.0255969023370908e-7 |
| 745 mycircuitSplit / i(V1) | 1007 | 1.9638769077823657e-10 A | 1.1047659210213413e-11 A | 0.0018884589466843108 | 0.00010625792555519479 |
| 761 NetlistAddResistor / i(V1) | 107 | 2.1208272056797206e-10 A | 8.89072654611054e-11 A | 0.0002835266210425467 | 0.00011881708421701446 |
| 763 netlistwithR5 / i(V1) | 107 | 1.1188705685456963e-9 A | 1.1692044919439932e-10 A | 0.001980431735508371 | 0.00020695241668086027 |

The other native transient references abort; their full-waveform errors are unavailable. Ticket 737 completes 30,771 spice-ts points to 10 ms, but native ngspice fails and the vendor waveform has no independent oracle: **not a correctness win**.

Ticket 871 is checked against analytic 1-ohm/6-ohm answers, not defective ngspice values: spice-ts i(V1) = -1 / -1/6 A. The fresh native ngspice arg trial is -0.5 A (random global captures the argument); temper is -1/56 A. The raw diagnostic relative differences in the receipt are NOT valid-reference correctness errors. Likewise, retaining older independently justified right verdicts for DC-only equilibrium decks does not turn aborted ngspice waveforms into oracles.

The main manifest's ngspice/master verdicts and engine strings remain the **historical harvest**. Current native-mode, `-r` invocation receipts are separate: 398's dot-card variant succeeds and 725/852 no longer crash with this raw-export command. That does not establish that the historical original/non-raw invocation bugs are fixed. No fresh master build was claimed.

## Exact-byte reconstruction and explicit provenance losses

The supervisor authorized reconstruction of derived variants, conditioned on the existing SHA256 pins, plus one minimal orchestration script. Attachments were downloaded with unchanged `fetch.ts`; archives were extracted with macOS tar. No vendor files are redistributed, per `SOURCES.md` and the corpus licence policy.

Verified preparations:

- 505: remove exactly `.control\nversion\n.endc\n` from Vsetpoint.cir, retaining trailing newlines and the unchanged library.
- 683/685: extract original deck bytes unchanged; mirror supplied libraries beneath the original `D:/...` relative include paths beside the deck.
- 718: normalize CRLF to LF in the inline SourceForge description after its introductory paragraph; retain the deck through `.END`; Sparse changes only `.options klu` to `.options sparse` as previously documented. Both pins match.
- 720: fetch upstream `examples/tclspice/tcl/diffpair.cir`, append ` ac dec 5 10k 10meg` to `.sens v(5,4)`; insert the solver option directly after the title for the previously recorded variants. All three pins match.
- 737/795: normalize CRLF to LF, remove quoted Windows drive prefixes and surrounding include quotes, retaining the relative `spice_lib/...` trees. The historical edit prose says basename relocation, but that transformation does not reproduce these pins; only the verified relative-tree variants were used.
- 740/745/761/763/764: normalize CRLF to LF and replace quoted Windows include paths by their **unquoted basenames**, retaining deck bytes otherwise. Mirror the unchanged attachment/extracted library of that basename beside the deck. All corresponding pins match.

Unreconstructed pins, never supplied to either engine:

| Ticket / file | Pinned SHA256 | Documented reconstruction candidate SHA256 |
|---|---|---|
| 158 dot.cir | 7e943e7c63cfbb2a5724ab5d01f2d91591d9f78a60e2966ecd91d62f92cd9b35 | e1ce54429baf985034972f1424548d05f8bada6b9947371228f6c85134acfcfb (2592 B) |
| 738 OP1177ARM_OPA818.local.cir | ade3ace7fd9c3649d7f1f4fa2590748bc33fed2b7526679472af831a9d89d02d | cbe95d092897db7b081ba2b96d37114040a1f236b40b5153be240efe8f73cdfe (1122 B) |
| 791 variant_62.local.cir | c973882f1606dd1c3f4c1d837d30b16de11863713e729a58ded40232dd70d464 | 62bbfadcd9be8eeb489ca26dda48594b6bd1168c13fd3244195e16374439af1e (1549 B) |
| 794 NGspice/06101.local.cir | 5fcebb2af191add8dae40125f927d24e2d05fbbd36a0a54a08c39e9a87fc210a | 167817c2fe196931720eee62cbe49287534040e6c53e4c70298171536a5309ec (1371 B) |
| 794 KiCad/06101/06101.local.cir | 688b77c210b7cb33aa5bad84bb8ecd4f8f8013cb08e5b83f1221feb034243357 | unverified; same include-only transformation does not reproduce pin |

There is also one changed fetched **log attachment** on ticket 725: actual bfc5ea49f206bda2371c50aa21cdc7af986dcce6f02f20d7dbddd8d958d4b7e4 versus recorded 04222eadf797543fe313672e070e214c4f690463eedfe20e621c6e85836a84a2. It is not an executed input; committed minimal deck hashes still match. Fetch exits 1 for that drift; it was not concealed or accepted as a new pin.

## Reproduce / receipts

`refresh.ts` is only hash-gated orchestration plus native result adaptation. It delegates noise adaptation, raw parsing, comparison and metrics to the existing generic harness. Each child is bounded at 180 s; native ngspice keeps the existing 120 s bound. No per-circuit settings or tolerance tuning. It passes the same UTF-8 lossless netlist bytes to simulate and ngspice; includes resolve to the same unchanged supplied files. Native ngspice runs with the harness's `set filetype=ascii`, no compatibility mode. The `.spiceinit` is external configuration, not a deck edit.

Commands and observed exits:

- `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 158 398 505 645 683 685 690 691 695 718 720 725 737 738 740 745 761 763 764 791 794 795 828 852 871` — exit **1**, solely the changed 725 log hash above; all requested attachment downloads completed.
- `pnpm build` — exit **0**.
- `TMPDIR=<scratch> spice-heavy pnpm exec tsx benchmarks/corpus/ngspice-bugs/refresh.ts <scratch>/812-final.jsonl` — exit **0**, 43 records / 25 tickets; individual failures are data, not an overall command failure.
- `TMPDIR=<scratch> spice-heavy pnpm exec tsx benchmarks/corpus/ngspice-bugs/refresh.ts <scratch>/812-waveforms.jsonl 505 683 685 737 740 745 761 763` — exit **0**, retain waveform evidence for the successful include-backed decks.
- `pnpm exec tsx benchmarks/corpus/ngspice-bugs/render.ts` — exit **0**.
- `pnpm lint` — exit **0**.
- `pnpm exec tsx --test benchmarks/corpus/ngspice-bugs/ngspice-bugs.test.ts` — exit **0** (includes fetched-deck checks on this machine).

[`refresh-812.jsonl.gz`](refresh-812.jsonl.gz) contains the 43 deduplicated receipts (the second run replaces its eight tickets), complete harness metrics, first errors, hashes, environment and native ngspice diagnostics. It is compacted offline: point counts and all signal endpoints retained, complete i(V1) grid/samples retained where present, other full waveform samples omitted. Path prefixes are sanitized to `<repo>` / `<scratch>`; this does not alter numerical values. The runner itself produces full samples, so all missing raw samples can be reproduced. Noise receipts retain native point counts and comparisons. Tests validate the denominator and hash membership and pin ticket 871 to its analytic answers.

## Routing, without duplicate issues

Open and closed issue titles/bodies and merged PRs were searched before routing:

- Existing #812: solver variants 645/690/691/718/720/725/852, additional unqualified .sens on 720, ngbehavior 695, d_pulldown 398, ps/lt sqrt 828. Its table is refreshed, not closed.
- Existing #803: missing pin reconstruction 158/738/791/794 and oracle absence 737; original corpus provenance/oracle ownership, not a new simulator feature.
- Existing #917: additional singular-matrix fixtures 795 base/variant. This does not assert the same root cause as 784 or reopen the accepted previous diagnosis.
- New #1037 (M1, bug/correctness/benchmark): remaining transient failures 764 after the distinct #844/#850 parameter fix. Both engines fail; no parity win.

Scope deliberately stops at these routed gaps. No simulator changes, new numeric report implementation, licence relaxation or substituted deck hashes.
