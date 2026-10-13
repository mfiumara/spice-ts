# ngspice bug #871: A function's formal argument is replaced by a global random parameter of the same name, or a temperature-dependent .param of the same name

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/871/ (status `open`, opened 2026-10-03)
- Category: parser
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)
- spice-ts issue: https://github.com/mfiumara/spice-ts/issues/871

## Decks

Origin: attachment circuits.zip.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`arg_capture.cir`](arg_capture.cir) (614 B, sha256 `cda0db141ae3bbe60263ba90bae849ab922e93cdc5ad2b47d1ea1dee22e98525`)
- [`arg_capture_cards.cir`](arg_capture_cards.cir) (588 B, sha256 `c0ab62396852309947247aecaaf171bc2b46316fd5b00bd1cc561f5f084addc9`)
- [`temper_capture.cir`](temper_capture.cir) (578 B, sha256 `adc2a088a75c677e2d932b28a3b5c6252dc0fa883d757ed75ce37637a565c7f9`)
- [`temper_capture_cards.cir`](temper_capture_cards.cir) (561 B, sha256 `3854db1e2370c499745ac56e1ee1971b4ca2b98f85cd9c0c28506969f1b438f4`)

Ticket attachments:

- [circuits.zip](https://sourceforge.net/p/ngspice/bugs/871/attachment/circuits.zip) (1063 B, sha256 `56ea709b2c57e80af47211df1304c777a128c55b7e6bea7212da3eaf04bd577f`)

Edits relative to the ticket: Card variants remove .control and add .op/.print op all.

## Expected answer

Formal arguments lexically shadow globals. choose_res(1e-7,2e-7) selects 1 ohm since 1e-7<2e-7; twice(3)=6 gives -I(V1)=1/6 A independently of global k=temper+1. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | wrong | temper_capture -i(v1)=1.785714e-02 (1/56), expected 1/6; random trial R=1 ohm. |
| ngspice master | wrong | temper_capture identical to 47 (-i(v1)=1.785714e-02 = 1/56, expected 1/6); arg_capture drew R1=2 ohm on the master run (47 run drew 1 ohm): the random global still captures the formal argument. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | Since #870 `.param f(args) = expr` defines a function (ngspice-47 inpcom.c .param -> .func) whose formal arguments lexically shadow globals: arg_capture_cards.cir runs, R1=choose_res(1e-7,2e-7)=1 ohm, i(V1)=-1 A (deterministic; the agauss global is never read). temper_capture_cards.cir still stops at `Unsupported dot command: '.temp'` (https://github.com/mfiumara/spice-ts/issues/871); the same cards without `.temp 27` (27 C is the default) give -i(V1)=1/6 A, the expected answer, where ngspice-47 gives 1/56 (pinned in packages/core/src/parser/param-functions-870.test.ts). Before #870: ParseError Unknown function 'choose_res' / Unknown function 'twice'. |

Reproduces on ngspice-47: yes. Check: temper_capture.cir prints -i(v1)=0.01785714A rather than 1/6A.

Candidate upstream fix: Global random/temper parameter rewrites must respect function-formal lexical bindings.

Notes: Random deck happened to produce 1 ohm on this trial; deterministic temperature deck conclusively reproduces capture.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
