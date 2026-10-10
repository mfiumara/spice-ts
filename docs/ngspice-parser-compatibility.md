# ngspice parser compatibility

This matrix audits the TypeScript parser against the ngspice 47+ user manual. It describes syntax acceptance, not numerical model parity. `supported` means the fixture is parsed with its represented semantics; `partial` names the accepted subset; `ignored` is reserved for output-selection metadata that cannot change spice-ts's computed result; `unsupported` means spice-ts rejects the syntax rather than silently discarding it.

Executable fixtures live in [`packages/core/src/parser/ngspice-compatibility.test.ts`](../packages/core/src/parser/ngspice-compatibility.test.ts). Focused lexical regressions live in [`tokenizer.test.ts`](../packages/core/src/parser/tokenizer.test.ts) and [`parser.test.ts`](../packages/core/src/parser/parser.test.ts).

## Counts

| State | Before this audit | After this audit |
| --- | ---: | ---: |
| supported | 13 | 16 |
| partial | 7 | 6 |
| ignored output metadata | 0 | 1 |
| unsupported | 8 | 9 |
| total | 28 | 32 |

The full-row promotions are end-of-line comments, whitespace around `=` in model/instance parameters, and the solver-backed `.options` subset. Independent-source PWL time/value lists are now supported within the still-partial source row. Noise analysis is partial: `v(node) source {lin|dec|oct} points start stop`, ideal-resistor thermal noise at the default 27 C, input/output-referred voltage-noise spectra, and integrated RMS totals are implemented. Numeric scale/unit compatibility remains partial: this audit corrects `mil` to ngspice's `25.4e-6` factor, but does not claim the complete documented numeric grammar. Unsupported semantic directives, unsupported option fields, unsupported resistor parameters, and the unimplemented EXP/SFFM/AM/trnoise/external waveform families fail explicitly instead of being silently ignored.

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
| Sources | `V` / `I`: DC, AC, PULSE, SIN, PWL | partial | partial | PWL supports ordered time/value pairs, linear interpolation, held endpoints, equal-time discontinuities, and transient breakpoints. EXP, SFFM, AM, trnoise, and external sources are explicitly rejected/not implemented. | [4.1](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-4248) |
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
| Analysis | `.noise v(node) source {lin\|dec\|oct} points start stop` | unsupported | partial | Computes uncorrelated ideal-resistor thermal noise at ngspice's default 27 C and returns output/input-referred voltage-noise density spectra plus integrated RMS totals for non-zero bandwidth. Differential/current outputs, temperature cards, semiconductor/flicker noise, and stepped noise remain explicitly unsupported. | [11.3.4](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-23380) |
| Analysis | `.tf`, `.pz`, `.sens`, `.disto` | unsupported | unsupported | Explicit parser error. | [11.3](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-23282) |
| Control | `.control` / `.endc` scripts | unsupported | unsupported | Explicit parser error; the interactive command language is not interpreted. | [12.4.3](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-24862) |
| Control | Solver-backed `.options` subset | unsupported | supported | See the exact field mapping below. Unknown fields and values reject explicitly; explicit `simulate()` API options override deck values. | [11.1 Variables (`.options`)](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-23069) |
| Circuit state | `.temp` | unsupported | unsupported | Temperature changes device behavior, which spice-ts does not model yet, so the directive rejects explicitly. | [2.14 `.TEMP`](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-1536) |
| Batch output | `.save`, `.print`, `.plot` | unsupported | ignored | Explicitly recognized as output-only metadata. spice-ts returns all computed vectors through its result API, so these cards do not alter simulation semantics. | [11.6 Batch Output](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-23708) |
| Measurement | `.measure` | unsupported | unsupported | Measurement evaluation is not implemented; the parser rejects rather than silently omitting requested measurements. | [11.4 Measurements](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-23620) |

## `.options` semantic mapping

Only ngspice fields with a direct, solver-backed `SimulationOptions` counterpart are accepted. Values from later `.options` cards replace earlier deck values; explicit API options replace deck values.

| ngspice field | spice-ts field | Accepted values / mapping | Classification |
| --- | --- | --- | --- |
| `abstol` | `abstol` | Non-negative finite number | implemented |
| `vntol` | `vntol` | Non-negative finite number | implemented |
| `reltol` | `reltol` | Non-negative finite number | implemented |
| `gmin` | `gmin` | Non-negative finite number | implemented |
| `itl1` | `maxIterations` | Non-negative integer | implemented |
| `itl4` | `maxTransientIterations` | Non-negative integer | implemented |
| `method=trap` | `integrationMethod='trapezoidal'` | Exact method mapping | implemented |
| `method=gear` | `integrationMethod='gear2'` | spice-ts's implemented second-order Gear method | implemented |
| `trtol` | `trtol` | Non-negative finite number | implemented |
| Every other `.options` field/value | — | Explicit parse error | unsupported |

The ngspice definitions and defaults for these fields are documented in [11.1.1 General Options](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml#magicparlabel-23074). `maxTimestep` remains controlled by `.tran ... tmax` or the API; it is not exposed through an invented ngspice `.options` spelling.

## Scope decisions

This compatibility work implements bounded parser and runtime semantics already backed by the native solver: PWL evaluation and the `.options` fields listed above. It does not add device-temperature behavior, measurement evaluation, new analyses, the remaining source-waveform families, or a control-language interpreter. Those semantic gaps remain explicitly unsupported and keep their executable rejection fixtures.
