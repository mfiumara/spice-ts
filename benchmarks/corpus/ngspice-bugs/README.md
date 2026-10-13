# Known ngspice bugs corpus (#803)

Every open ngspice bug ticket on SourceForge, triaged into a benchmark: each reproducible ngspice defect is a
circuit with a known correct answer, so it can show where spice-ts is right, where it is wrong too, and where it
cannot run the deck yet. The summary table is [`../../NGSPICE_BUGS.md`](../../NGSPICE_BUGS.md).

## Files

- `manifest.json`: one record per ticket (all tickets with status `open` or `open-accepted` on the harvest date):
  category, deck provenance and hashes, every edit made to a deck, the expected answer and its basis, the
  ngspice-47 / ngspice master / spice-ts verdicts with evidence, and the follow-up spice-ts issue if spice-ts is
  wrong.
- `tickets/<N>/`: per-ticket README (generated) and the committed decks, for every simulator-relevant ticket with a
  runnable deck.
- `render.ts`: renders `../../NGSPICE_BUGS.md` and the ticket READMEs from the manifest (`--check` verifies them).
- `fetch.ts`: downloads the ticket attachments that are not committed (vendor libraries, archives) into the
  git-ignored `fetched/` directory and checks their SHA-256 against the manifest.
- `ngspice-bugs.test.ts`: manifest consistency, deck hashes, generated files up to date, and pins of the spice-ts
  verdicts reported as "ngspice defective, spice-ts correct" against the expected answers. Pins on fetch-only decks
  (#505, #740, #763) skip until `fetch.ts <N>` has downloaded the ticket attachments.

## Method

1. Harvest (read-only, plain GETs, no account): the ticket list from
   `https://sourceforge.net/rest/p/ngspice/bugs/search?q=status:open+OR+status:open-accepted&limit=500`, each ticket
   (description and full discussion) from `https://sourceforge.net/rest/p/ngspice/bugs/<N>`, and every attachment of
   the ticket and its posts. Nothing was posted, commented or voted upstream.
2. Classify each ticket as simulator-numerics, device-model, parser, frontend-ui (interactive commands, `.control`
   scripting, plotting, `fft`/`meas` post-processing, raw-file output), build, platform (shared-library API, OS) or
   docs. Only simulator-relevant tickets with a deck that runs standalone go further.
3. Run each deck on ngspice-47 and on ngspice master (`pre-master-48`, the development branch HEAD), with the same
   command line, and through spice-ts `simulate()` on the same bytes. Decks whose analyses live in a `.control` block
   also get a dot-card variant (`*_cards.cir`) so spice-ts runs the same analysis; every such edit is recorded.
4. Decide the expected answer independently: analytic solutions (Ohm/KCL, closed-form operating points, waveform
   definitions), first-principles arguments (equivalent netlists must give the same answer; independent instances
   cannot depend on netlist order; an ill-posed topology must be diagnosed) or the documented semantics of the
   feature. `undetermined` is recorded when no independent answer exists (for example vendor op-amp macromodels).
5. Outcome per ticket (see `render.ts`): ngspice is defective when ngspice-47 gives a wrong result, aborts or hangs
   where the expected answer says it should not. spice-ts is then `right`, `wrong` (an issue is filed),
   or `unsupported` (it rejects the deck: a missing feature or an ngspice-only option such as `.options klu` or a
   compatibility mode). Unsupported is never counted as a spice-ts win.

Triage was split across three agents (two delegated sub-agents and the coordinator) following one written
procedure; the coordinator re-ran every deck that shows a defect on both ngspice builds with an identical command
and spot-checked the headline verdicts. Verdicts are evidence-backed judgements, not an automated pass/fail.

## Licence and redistribution

The decks were posted publicly on the ngspice bug tracker by the ticket authors, without an explicit licence. This
corpus commits only small (at most 3 KB) user-authored decks, quoted to reproduce the bug report, plus the
dot-card variants derived from them; decks for #877 and #878 were written by the spice-ts owner. Vendor model
libraries, PDK files, archives and other large attachments are not committed: `fetch.ts` downloads them from the
tracker and verifies their hashes. The ticket URL is recorded for every deck. See `../../SOURCES.md`.

## Regenerate

```
pnpm build
pnpm exec tsx benchmarks/corpus/ngspice-bugs/render.ts            # rewrite NGSPICE_BUGS.md and ticket READMEs
pnpm exec tsx --test benchmarks/corpus/ngspice-bugs/ngspice-bugs.test.ts
pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 745         # fetch the uncommitted attachments of #745
```

Re-running ngspice needs ngspice-47 (`brew install ngspice`) and a master build
(`git clone https://git.code.sf.net/p/ngspice/ngspice`, `./autogen.sh`, `./configure --with-x=no --disable-debug
--enable-xspice --enable-osdi --with-readline=no --disable-openmp`, GNU bison 3); run `ngspice -b -r out.raw <deck>`
from the deck's directory. For compatibility-mode tickets put `set ngbehavior=ltps` in a `.spiceinit` next to the
deck.
