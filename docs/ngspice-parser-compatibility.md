# ngspice parser compatibility

This matrix audits the TypeScript parser against the ngspice 47+ user manual. It describes syntax acceptance, not numerical model parity. `supported` means the fixture is parsed with its represented semantics; `partial` names the accepted subset; `unsupported` means spice-ts rejects the syntax rather than silently discarding it.

Executable fixtures live in [`packages/core/src/parser/ngspice-compatibility.test.ts`](../packages/core/src/parser/ngspice-compatibility.test.ts). Focused lexical regressions live in [`tokenizer.test.ts`](../packages/core/src/parser/tokenizer.test.ts) and [`parser.test.ts`](../packages/core/src/parser/parser.test.ts).

## Counts

| State | Before this audit | After this audit |
| --- | ---: | ---: |
| supported | 13 | 15 |
| partial | 7 | 5 |
| unsupported | 8 | 8 |
| total | 28 | 28 |

The two promotions are end-of-line comments and whitespace around `=` in model/instance parameters. Numeric scale/unit compatibility remains partial: this audit corrects `mil` to ngspice's `25.4e-6` factor, but does not claim the complete documented numeric grammar. Unsupported semantic directives and unsupported resistor parameters now fail with `ParseError` instead of being silently ignored.

## Matrix

| Area | ngspice syntax / fixture | Before | Now | Notes | Manual |
| --- | --- | --- | --- | --- | --- |
| Lexing | Numeric fields and scale factors | partial | partial | `M`/`m` are milli, `Meg` is mega, and `mil` is `25.4e-6`; trailing unit letters are ignored. RKM embedded notation remains accepted as an extension. Complete documented numeric-grammar coverage is not yet claimed. | [2.1.3.2–3](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-319) |
| Lexing | Full-line and `$`, `;`, `//` end-of-line comments | partial | supported | Comment text is removed before continuation and tokenization. | [2.4.3–4](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-974) |
| Lexing | `+` continuation lines | supported | supported | Leading-whitespace `+` continuation is merged with the preceding card. Backslash continuation is not implemented. | [2.4.5](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-1015) |
| Basic lines | Title and `.end` | partial | partial | `.end` is recognized. Unmarked first-line titles and `.title` are not accepted because `parse()` also supports title-less netlist fragments. | [2.4.1–2](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-912) |
| Models | Whitespace/comma/parentheses and `name = value` fields | partial | supported | Numeric model parameters parse with or without spaces around `=`. | [2.5](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-1025) |
| Structure | `.model` cards | supported | supported | Numeric parameter cards for implemented models. | [2.5](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-1025) |
| Structure | `.subckt` / `.ends` and `X` calls | supported | supported | Nested definitions and numeric parameter overrides are parsed. | [2.6](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-1237) |
| Structure | `.include` and sectioned `.lib` | supported | supported | Requires `parseAsync` and an include resolver; cycles and depth are checked. | [2.8](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-1309), [2.10](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-1347) |
| Expressions | `.param` and brace expressions | partial | partial | Top-level ordered numeric parameters work through `parseAsync`; functions, conditionals, and full ngspice scoping do not. | [2.11](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-1366) |
| Devices | `R` resistor | supported | supported | Scalar resistance is supported; unsupported temperature/AC/model instance options are explicitly rejected rather than discarded. | [3.3.1](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-2614) |
| Devices | `C` capacitor and `L` inductor | supported | supported | Scalar values, implemented numeric model cards, and implemented instance parameters parse. | [3.3.6](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-3192), [3.3.10](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-3608) |
| Sources | `V` / `I`: DC, AC, PULSE, SIN | partial | partial | EXP, PWL, SFFM, AM, trnoise, and external sources are rejected/not implemented. | [4.1](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-4248) |
| Sources | Linear `E`, `F`, `G`, `H` | partial | partial | Scalar-gain forms work; POLY and behavioral forms are not implemented. | [4.2](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-5577) |
| Devices | `D` diode | supported | supported | Basic diode card and model reference parse. | [7.2](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-7339) |
| Devices | `Q` BJT | supported | supported | Three-terminal card parses; model-physics coverage is separate from parser compatibility. | [7.3.1](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-8958) |
| Devices | `M` MOSFET | supported | supported | Three- and four-terminal cards plus numeric instance parameters parse. | [7.6](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-13313) |
| Devices | `B` behavioral source | unsupported | unsupported | Explicit parser error. | [5.1](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-5746) |
| Devices | `J` JFET and `Z` MESFET | unsupported | unsupported | Explicit parser error. | [7.4](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-11593) |
| Devices | `S` / `W` switches | unsupported | unsupported | Explicit parser error. | [3.3.15](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-4015) |
| Devices | `K`, `T`, `O`, `U` coupled inductors / transmission lines | unsupported | unsupported | Explicit parser error. | [6](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-6392) |
| Analysis | `.op` | supported | supported | Operating-point command parses. | [11.3.5](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-23410) |
| Analysis | `.dc` | supported | supported | Single-source linear sweep parses. | [11.3.2](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-23325) |
| Analysis | `.tran` | supported | supported | `tstep tstop [tstart [tmax]]` parses; `uic` is not supported. | [11.3.10](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-23570) |
| Analysis | `.ac` | supported | supported | DEC/OCT/LIN forms parse. | [11.3.1](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-23283) |
| Initial state | `.ic` / `.nodeset` | unsupported | unsupported | Explicit parser error; this exposes the currently ineffective ring-oscillator benchmark `.ic`. | [11.2](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-23240) |
| Analysis | `.noise`, `.tf`, `.pz`, `.sens`, `.disto` | unsupported | unsupported | Explicit parser error. | [11.3](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-23282) |
| Control | `.control` / `.endc` scripts | unsupported | unsupported | Explicit parser error; the interactive command language is not interpreted. | [12.4.3](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-24862) |
| Control/output | `.options`, `.temp`, `.save`, `.print`, `.plot`, `.measure` | unsupported | unsupported | Explicit parser error rather than claiming ignored semantics/output. | [dot-command index](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-494) |

## Scope decisions

This PR fixes only lexical/parser gaps that are bounded and immediately useful to public benchmark netlists. It does not add solver state, device implementations, new analyses, waveform evaluators, or a control-language interpreter. Those gaps are tracked as separate issues with the corresponding fixture from the compatibility test.
