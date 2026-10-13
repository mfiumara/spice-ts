# LTspice as a third reference: feasibility (#949)

## Decision

**NO-GO for the public benchmark suite without prior written ADI consent.** Batch
execution and raw parsing are technically plausible, but freeware is not permission
to publish simulator comparisons. Keep ngspice as the reference; do not implement an
LTspice runner as part of this research task.

This is documentary research and static netlist inspection, not legal advice or an
LTspice execution receipt. `/Applications/LTspice.app` was absent on the research
host. No installer, application, model library, or licence acceptance was obtained;
no simulator was launched. There are **zero verified LTspice fixture passes**.
Actual execution is **HUMAN_INPUT_REQUIRED**: Mattia must review the applicable
version's licence and authorize/provision installation first. Public comparisons
additionally require the written consent below. This requirement does not prevent
completion of this feasibility-only report.

## 1. Licence: internal automation versus publication

The LTspice-specific ADI agreement mirrored by LTwiki is identified
`20191031-LTS-CTSLA` [1]. Its PDF was retrieved as a public research document, not
as part of a software download. SHA-256:
`16c4ff1428a2105e8168f6b2627ba71b03f3120578e3449a2f1cb5a8cbfb84a4`.
The following quotes were extracted with `pdftotext -f 1 -l 4`.

Section 1, page 1:

> Subject to the terms and conditions of this Agreement, Analog Devices grants to
> Licensee a non-exclusive, non-transferable, non-sublicensable license, to internally
> use and copy the PC Software to evaluate Analog Devices products and also to
> perform general circuit simulation.

This permits internal circuit simulation subject to the other terms. It does not
expressly name CI or automated benchmarking. Documented batch switches [3,4] make
internal batch circuit simulation a reasonable technical reading, **not** a grant
for a public simulation service or third-party/cloud access.

Section 4, page 1:

> In no event shall Licensee sublicense, rent, lease, permit time-sharing or otherwise
> make available, transfer, deliver, disclose, or distribute the Licensed Software to
> any third party.

> For the avoidance of doubt, Licensee may not distribute the PC Software under any
> circumstances.

> This program is specifically not licensed for use by semiconductor manufacturers
> in the design, promotion, demonstration, development, or sale of their products.
> Specific permission must be obtained from Analog Devices for the use of LTspice
> for these applications.

Do not commit binaries/models, publish a preinstalled CI image, or assume hosted
public PR CI is authorized. An owner-provisioned private environment still needs
review of the applicable terms. Section 4 also prohibits reverse engineering;
this investigation does not inspect proprietary implementations.

Section 5, page 2, directly settles publication under this agreement:

> Licensee may not publish or provide the results of any benchmark or comparison
> tests run on the Licensed Software to any third party without the prior written
> consent of Analog Devices.

This covers accuracy/convergence comparisons as well as timing. Merely keeping
waveforms out of Git while publishing a pass/fail table is not a safe workaround.
It conflicts with CHARTER.md's public, reproducible benchmark policy unless ADI
consents. No consent is evidenced here.

Version caveat: [1] is a **2019 mirrored agreement**, not a verified current
installer EULA. The older LTC disclaimer [2] has different redistribution language
and must not be substituted for an ADI version. ADI's general current agreement
[10], search-indexed during this research, also restricts external/public
benchmarking analyses without consent (Restrictions, item (vi)); direct page
retrieval timed out, so it is corroboration, not proof of which terms a particular
LTspice build presents. Owner/legal review must resolve the exact build/platform
terms before any use. A documentation FAQ's “free/no license limits” wording [5]
does not override an agreement's publication clause.

## 2. Batch execution and raw output

### Native macOS

The open-source spicelib runner [6] contains an explicit native-macOS path:

    /Applications/LTspice.app/Contents/MacOS/LTspice -b /absolute/path/deck.cir

This is a **candidate command, not executed here**. The runner permits `.cir` and
`.net`, rejects native `.asc` batch simulation, does not offer native schematic
netlisting, and treats extra switches as unsupported. Do not extrapolate the
Windows `-Run`, `-ascii`, `-netlist`, or `-version` switches to macOS. Its expected
outputs are same-stem `deck.raw` and `deck.log`.

A separate macOS automation project [9] reports initial interactive library
provisioning and an active GUI-session requirement. This is community evidence,
not an ADI headless guarantee. It is another reason not to launch the app on this
shared Mac: background-only behavior and cold-start dialogs have not been tested.
Native macOS batch use is plausible for an owner-prepared machine, but **not yet
validated as focus-safe or suitable for a GUI-less CI session**.

### Linux through Wine

ADI's reference FAQ explicitly says there is no official Linux version and LTspice
runs under Wine [5]. The spicelib Linux path [6] uses Windows batch execution:

    wine /owner-provisioned/LTspice.exe -Run -b 'Z:/absolute/path/deck.cir'

The legacy help also documents `-wine`/`-nowine` [4]. This establishes a documented
compatibility route, not a tested unattended Linux CI setup. A future authorized
experiment must pin Windows LTspice and Wine versions, initialize a private prefix,
handle first-run prompts outside automation, use isolated output directories and
timeouts, and check both log errors and fresh raw files. A private virtual display
may be needed depending on the build; no claim of display-free operation is made.
Do not redistribute a configured LTspice image or download/accept its licence in
a public job by default. No Wine installation or execution occurred here.

### Raw parsing is feasible, but not the ngspice reader unchanged

spicelib's `RawRead` source documents and implements LTspice raw parsing [7]:

- Text header with `Plotname`, `Flags`, `No. Variables`, `No. Points`, indexed
  `Variables`, then `Binary:` or `Values:`; detect UTF-8 versus UTF-16LE.
- Ordinary binary TRAN commonly has an 8-byte time coordinate and 4-byte trace
  values; double-precision variants must be detected rather than assumed away.
- AC uses complex data (8-byte real and imaginary components). Honor declared
  flags and dialect; do not parse these as real transient samples.
- `FastAccess` changes layout to trace-major; reject unsupported variants explicitly
  instead of silently returning transposed data.
- `.step` run labels are recovered from the adjacent `.log`. Preserve run boundaries,
  metadata, analysis identity, signal names, and current polarity.
- Compression can affect the saved time axis/data. ADI documents
  `.options plotwinsize=0` and `numdgt>6` for precision [8]. Use one documented global
  policy, never circuit-specific tuning. Adding options produces a changed deck,
  so record its hash and do not label it byte-identical.

A future parser validation needs real OP/DC/AC/TRAN and stepped outputs from the
pinned build, malformed/truncated input tests, and independent exported-value
checks. No parser was implemented or synthetic LTspice output fabricated here.
Timings must distinguish native execution from Wine startup overhead and exclude
ASCII conversion overhead (the help warns `-ascii` degrades performance).

## 3. Fixture compatibility: static audit, not measured acceptance

Scope is the **20 manifest entries of corpus A** in
`benchmarks/corpus/ngspice/manifest.json`, plus the two project fixtures below.
Every corpus-A deck was opened directly; old `spiceTs.status` fields in the manifest
were not treated as present-day simulator results. All classifications are
predictions requiring authorized execution, not passed tests. Other corpora and
TypeScript-generated decks are outside this bounded audit.

LTspice lacks ngspice's Nutmeg `.control` interpreter. Translating its scripts into
runs and external assertions is not unchanged input. Likewise, numeric model levels
are simulator-specific: ngspice VBIC `NPN LEVEL=4` maps to documented LTspice
`Level=9` [3], not to the same numeric level.

| Corpus-A ID | Static classification and evidence in the actual deck |
|---|---|
| `vbic-fo` | Translation: NPN `LEVEL=4` must select LTspice VBIC level 9; audit its parameters, `.OPTIONS NOACCT`, and `.print` output separately. |
| `vbic-temperature` | Same VBIC remapping; preserve TEMP=150 and the original DC sweep. |
| `vbic-common-emitter-ac` | VBIC remapping plus `.pz` analysis unavailable in the documented LTspice command set; AC-only export is a subset, not acceptance of this fixture. |
| `mos6-inverter-transient` | Shared MOS6 level 6 and subcircuits are documented candidates; `.PRINT`/`NOACCT` handling needs validation/possible output translation. Do not substitute MOS1. |
| `mos6-simple-inverter-transient` | Same level-6 candidate and output/option caveats. |
| `jfet-vds-vgs` | Shared NJF level 1 and nested DC sweeps are candidates; `.print`, simultaneous `.op`, and `NOACCT` behavior are unverified. |
| `rc-lowpass-ac` | Analog network/AC supported in principle; `DISTOF1`/`DISTOF2` source fields and legacy POST/TRANS/NODE/NOACCT and `.PRINT` directives need dialect/output audit. Not an unchanged-pass claim. |
| `ac-zero-frequency` | Translation required: `.control` AC command, `let`, conditional assertion and `quit`; zero-Hz AC semantics also need a real probe. |
| `probe-ac` | Translation required: `.control`, `display`, `print`, `plot`, ngspice generated probe vectors such as `vd_r2`; export raw traces and evaluate explicitly outside the simulator. |
| `rc-transient` | Shared RC/PULSE/TRAN candidate; abbreviated `pulse(0 1)` defaults, `.plot`, and `NOACCT` require validation. Explicit pulse defaults would be translation. |
| `mos-amplifier-transient` | Shared MOS2 level 2 and pulse/TRAN candidate; legacy `.print`/`.plot`/`NOACCT` output and parameter handling need validation. |
| `ltra-line-transient` | LTspice documents O/LTRA, but ngspice-only `rel`, `steplimit`, `compactrel`, `compactabs` and output/options require audit/translation. Removing controls changes the deck. |
| `hfet-inverter` | Unsupported as-is: NHFET level 5 is not in the documented LTspice model set. Replacing it with another transistor model changes physics, not just dialect. |
| `mesa-oscillator` | NMF is listed in both tools, but ngspice MESA level 2 and its parameters are not established as equivalent in LTspice; unsupported/unverified model, not a MOS/JFET substitution candidate. |
| `jimi-fuzz` | Shared GP NPN/TRAN candidate; `sine` alias, bare `.options`, `.print`, and multiple `.op`/`.tran` analysis behavior need validation. |
| `schmitt-trigger` | Shared GP network candidate; `.width`, `.opt` reporting flags, legacy BJT aliases (`pe`, `me`, `pc`, `mc`, `va`) and `.plot`/`.print` need dialect validation. |
| `inductive-positive-definite-2x2` | Translation required: `.control op/remcirc/quit`; includes negative inductances and couplings outside [-1,1], so rejection is part of the test, not a circuit to repair. |
| `inductive-positive-definite-3x3` | Same control translation; invalid/non-positive-definite systems intentionally test diagnostics. |
| `inductive-positive-definite-4x4` | Control translation even though the network uses shared syntax; source-independent OP diagnostics are not a waveform parity win. |
| `inductive-positive-definite-ac` | Substantial control translation: sequential `alter`, repeated OP, `set indverbosity`, `destroy`, `remcirc`; preserve all states/assertions, not just initial AC. |

Cleaner unchanged-input **candidates**, still not verified passes:

- `benchmarks/wasm-cccs-op/single-ended.cir`: ordinary V/R/F plus `.op/.end`,
  entirely within the documented common syntax; a useful first approved smoke test.
- `benchmarks/gummel-poon/vce-1.cir`: ordinary NPN level 1 plus DC; circuit/model
  syntax is common, but legacy `.PRINT` export handling is unverified.

Bottom line: there is no evidenced unchanged acceptance list until actual runs are
permitted. The table identifies likely common circuit syntax and definite dialect
or model obstacles without inventing results. LTspice default inductor damping
([11], 1 milliohm on uncoupled inductors) can also alter otherwise identical RLC
physics. If disabled through settings/options, record the global policy; if
`Rser=0` is inserted into a deck, classify it as adapted. Do not compare translated
fixtures as identical-netlist charter parity; obtain owner approval for a separate
adapted-input track and publish originals, diffs, hashes, options, and losses.

## 4. Device coverage beyond ngspice

The useful difference is **LTspice-native proprietary implementation/library
coverage**, not a blanket claim that ngspice lacks power devices:

- ADI switching-regulator/SMPS macromodels use proprietary native devices and are
  explicitly described as incompatible with other simulators [11]. These can
  provide product-model coverage ngspice cannot consume unchanged. They are not
  open benchmark fixtures; provenance and redistribution permission remain gates.
- LTspice A special-function primitives (native logic, OTA, etc.) [3] and its
  built-in hysteretic inductor syntax are different from ngspice's XSPICE A code
  models. ngspice can represent similar functions with code models/subcircuits,
  but does not thereby have the same native syntax or proprietary implementation.
- LTspice lists native NIGBT/PIGBT [3,8]; the ngspice-47 device table [12] lists Z
  as MESFET, not the LTspice IGBT primitive. Equivalent IGBT modeling through
  subcircuits or external compact models must not be described as impossible.

**Not gaps:** ngspice already documents VDMOS [13], BSIM3/BSIM4, VBIC, JFET and
transmission lines [12]. The old help claim that VDMOS is absent from other SPICE
programs [14] is obsolete for ngspice. ADI's bundled universal op-amps are library
macromodels, not evidence that ngspice lacks op-amp simulation.

**EKV note:** the card says “no EKV”, but the public ADI circuit-element reference
[3] explicitly lists “12, 44, 55 — EKV 2.6”; older help [14] also lists level 12.
That contradicts a blanket documentary claim that LTspice has no EKV. It does
**not** prove the selected current macOS build supports it. No EKV execution or
licence equivalence was tested, and **EKV is not counted as a ngspice-lacks coverage
advantage**. Resolve build-specific coverage only after owner authorization.

## Recommended next decision (no implementation performed)

1. Reject adding LTspice to the public reference gate under the presently evidenced
   licence. Mattia may seek ADI's written permission for publication, internal
   automation/cloud execution, and any desired model distribution.
2. If permission is secured, Mattia reviews the exact platform/build terms and
   provisions an installation. Until then execution is HUMAN_INPUT_REQUIRED.
3. A separately scoped task can then test the clean OP candidate, AC/DC/TRAN raw
   parsing, platform headlessness, and the compatibility matrix. Record versions,
   settings, exact inputs, failures, and matched-point errors before making claims.

## Sources and provenance

Research retrieval date: 2026-10-13. No third-party circuit/model files are added;
existing fixture sources/licences remain in `benchmarks/SOURCES.md`. Only short
licence quotations and this original report are committed, not the licence PDF or
software. ADI reference documentation identifies its documentation licence as
Apache-2.0; that is distinct from proprietary LTspice licensing. Pinning makes
reference/source findings reproducible, not current-installer validation.

1. LTspice-specific agreement mirror, `20191031-LTS-CTSLA`, pages 1–2:
   https://ltwiki.org/files/LTspiceHelp.chm/html/License.pdf
2. Historical LTC disclaimer:
   https://ltwiki.org/LTspiceHelpXVII/LTspiceHelp/html/License_Agreement_Disclaimer.htm
3. ADI circuit elements (VBIC level, MOS level table, primitives):
   https://github.com/analogdevicesinc/ltspice-reference/blob/b4358f83e9d09a719ee5c08f25b7e236a896c41d/ai_ref/CIRCUIT-ELEMENTS-REFERENCE.md
4. Historical command-line help:
   https://ltwiki.org/LTspiceHelp/LTspiceHelp/Command_Line_Switches.htm
5. ADI FAQ (Linux/Wine, licence summary):
   https://github.com/analogdevicesinc/ltspice-reference/blob/b4358f83e9d09a719ee5c08f25b7e236a896c41d/ai_ref/FAQ-AND-TIPS.md
6. spicelib runner, observed source revision (third-party, not vendor support):
   https://github.com/nunobrum/spicelib/blob/d8f8ecceeb361741f1f660f03b03ac49697f8700/spicelib/simulators/ltspice_simulator.py
7. spicelib raw reader and format description:
   https://github.com/nunobrum/spicelib/blob/d8f8ecceeb361741f1f660f03b03ac49697f8700/spicelib/raw/raw_read.py
8. ADI simulation commands:
   https://github.com/analogdevicesinc/ltspice-reference/blob/b4358f83e9d09a719ee5c08f25b7e236a896c41d/ai_ref/SIMULATION-COMMANDS-REFERENCE.md
9. Community macOS prerequisites (mutable, corroborative only):
   https://git.supported.systems/warehack.ing/mcltspice/raw/branch/main/docs/src/content/docs/getting-started/prerequisites.mdx
10. ADI general agreement (search-indexed corroboration, direct fetch timed out):
    https://www.analog.com/en/support/software-license-agreement.html
11. ADI device-model guide:
    https://github.com/analogdevicesinc/ltspice-reference/blob/b4358f83e9d09a719ee5c08f25b7e236a896c41d/ai_ref/DEVICE-MODELS-GUIDE.md
12. ngspice-47 manual, device table/model chapters:
    https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml
13. ngspice VDMOS manual:
    https://nmg.gitlab.io/ngspice-manual/mosfets/powermosfetmodel_vdmos.html
14. Historical LTspice MOSFET help:
    https://www.ltwiki.org/LTspiceHelp/LTspiceHelp/M_MOSFET.htm
