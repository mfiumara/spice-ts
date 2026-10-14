Reference-only cross-check for #948 / #973 exposes large nonlinear transient disagreements on identical canonical projections. This is a triage candidate for transient integration, initialization and model-semantics bugs, not an assertion that spice-ts or either reference is wrong.

Measured ngspice47 vs Xyce7.10.0 in benchmarks/reference/mutual-948/report.json:
- ngspice/jimi-fuzz, TRAN v(3): max absolute 8.708512476182351 V; max relative 208608240467200.12 (near-zero Xyce denominator makes relative peaks uninformative by themselves).
- corpus-e/lc-oscillator-transient, TRAN v(1): max absolute 8.202397759317876 V; max relative 420.73378187477897.

Both references export every projected analysis without ignored/unsupported semantic marks, so disagreement is retained, not excluded from selection. The report records max/RMS absolute/relative values per signal, source+canonical hashes, native output warnings, and all losses. Canonical input is shared; only native export directives differ. No tolerance tuning and no model-equivalence claim.

Relevant history: #123 and #146 for Jimi transient parity and point growth. Existing aggregate receipt (not regenerated here) records Jimi spice-ts-vs-ngspice TRAN v(3) max absolute0.11694695074091002 V. This older receipt is context, not a new execution or a cross-reference score; it cannot be compared directly with a projected canonical receipt.

Follow-up: reproduce the saved canonical decks in all three engines, isolate initialization/grid/interpolation and model contributions, and add RED regression tests if a spice-ts defect is established. Preserve defaults and every reference loss; do not choose the reference closest to spice-ts. Do not reopen historical issues without new evidence.

Reproduction: XYCE_BIN=<pinned Xyce7.10 serial executable> spice-heavy pnpm exec tsx benchmarks/reference/subset.ts --output-dir benchmarks/reference/subset-rerun
