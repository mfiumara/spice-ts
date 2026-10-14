# Commercial SPICE reference feasibility (#1086)

Research date: **2026-10-14**. Decision scope: adding an automated reference to
spice-ts's **public, reproducible** benchmark suite, not ordinary circuit design.
This is documentary research, not legal advice or an execution receipt.

## Recommendation and ranked decision

Keep ngspice as the public reference. **No investigated commercial product is an
unconditional GO publishable today.** Prioritize QSPICE for a licence clarification,
not installation; Micro-Cap is a second candidate if its applicable freeware terms
can be recovered. Elements lacks a permanent automation interface. Paid IC tools
have especially material competitive-development restrictions: private oracle use
can be prohibited independently of publishing results.

Rank is practical suitability for a possible future reference, not simulator speed
or accuracy. “NO-GO (unresolved)” means insufficient permission evidence, **not** a
claim that the vendor prohibits publication. “Internal-only” describes the ordinary
licensed-use boundary, **not authorization to improve spice-ts**.

| Rank | Candidate | Public automated reference now | Internal automated use | Principal reason |
|---|---|---|---|---|
| 1 | QSPICE / Qorvo | **NO-GO (unresolved)** | Commercial use publicly supported; competitor oracle/CI terms unverified | Promising Windows/Wine CLI; full applicable simulator EULA missing |
| 2 | Micro-Cap 12 / Spectrum Software | **NO-GO (unresolved)** | Batch documented; applicable freeware EULA missing | Free since closure, but free is not public-domain or benchmark permission |
| 3 | SIMetrix/SIMPLIS Elements | **NO-GO (technical)** | Free business use; permanent scripts/command line absent | General EULAs silent on comparative publication; Elements applicability needs review |
| 4 | PSpice for TI / OrCAD PSpice | **NO-GO (unresolved)** | PSpice batch documented; actual TI/commercial agreements not verified | Free TI edition has registration/renewal and imported-model probe limits |
| 5 | NI Multisim | **Internal-only, conditional**; NO-GO for public results | Documented Windows API within purchased licence scope; competitor use unresolved | NI requires approval to disclose “other performance data” |
| 6 | TINA-TI | **NO-GO (technical/terms unresolved)** | Single-host licence; no verified unattended batch API | GUI export; conflicting public education terms |
| 7 | Synopsys HSPICE | **NO-GO under cited terms** | Ordinary licensed design batch plausible; competitor enhancement prohibited | Historical agreement prohibits disclosure and competitor development |
| 8 | Cadence Spectre | **NO-GO under cited academic/evaluation routes** | Ordinary paid design batch plausible; no permission for this use established | Academic terms prohibit doing competitive benchmarks, even internally |
| 9 | Siemens Eldo / Symphony | **NO-GO under cited terms** | Ordinary licensed design batch plausible; competitor enhancement prohibited | EDA output confidentiality and competitive-use restriction |

No installers, accounts, licence acceptance, purchases, simulator launches, or
vendor contact occurred. **Zero verified unchanged-fixture passes for every
candidate.** No proprietary model/netlist/output is added to the repository. This
report does not change benchmark fixtures, thresholds, results or SOURCES.md; their
existing provenance remains there. Research-document PDFs were fetched where
available, not software distributions. Full legal-document retrieval and indexed
technical evidence are distinguished below. Applicable installed-build agreements,
orders and supplemental terms can supersede the documents surveyed.

## 1. Licence evidence: quotes, scope, and unresolved permissions

All URLs in this report were retrieved or consulted through public search on
2026-10-14. `Direct` means the page/PDF was fetched and its relevant text inspected;
`Indexed` means search-returned text only, not a fully verified document. Missing
terms are never classified as silent. Silence in a retrieved agreement is not an
explicit grant of benchmark publication, public cloud CI, or hosted service rights.
Export, named-user, seat and geography restrictions still apply.

### QSPICE

Qorvo's product page [Q1, Indexed] says:

> Free for commercial use

A Qorvo staff response (May 26, 2026; post 2) [Q2, Direct via the topic JSON]
says:

> QSPICE is absolutely free, no restrictions on use for any users.

The same response offers to obtain something from corporate. These are strong
vendor statements about commercial access, **not a retrieved complete QSPICE
simulator licence**. No exact current EULA was obtained; publication and internal
competitive benchmarking are **unknown**, not verified silent. Do not substitute
Qorvo's embedded/OEM software agreements or example-repository licences.
How2Power [Q3, Indexed] reports use by other semiconductor manufacturers, but that
is corroboration, not a contractual grant. No semiconductor-vendor exclusion is
evidenced in the Qorvo statements; completeness remains unverified. Academic use
appears free on the same basis, with no separate academic entitlement demonstrated.

### Micro-Cap 12

The archived Spectrum download page [M1, Indexed; third-party mirror] says:

> Micro-Cap 10, 11, and 12 are now free and require no key.

The vendor-authored 2018 Reference Manual [M2, Direct; university mirror], licence
notice, says:

> Your license agreement with Spectrum Software, which is included with the
> product, describes the uses of the software which are permitted and the uses
> which are prohibited.

That manual predates the freeware release. The applicable free-release EULA was
not obtained. Internal batch, publication, competitor/semiconductor-vendor use
and redistribution permissions are **unknown**, not silent. Closure/free download
is not a public-domain dedication. No current full-free-release node cap or
academic fee was evidenced; historical demo caps must not be applied to it.
Do not download the distribution to search for its licence without owner approval.

### SIMetrix/SIMPLIS Elements

SIMetrix's Elements page [S1, Direct] describes the free edition as:

> can be used without license or copying restrictions, for personal, educational
> and business use.

The public SIMetrix general EULA [S2, Direct], §2.1, grants:

> a non-exclusive, non-transferable licence (as described below) to use the Software.

It limits eligible users to the licensee, employees and freelance contractors.
Section 3.1 says:

> Whatever the version of the licence the Software may not in any circumstances
> be used for providing services based on the Software (in particular web based
> simulation services).

The SIMPLIS distributor EULA [S3, Direct], §1.1, separately grants use:

> for your internal commercial use.

No express comparative-benchmark disclosure or semiconductor-vendor ban was found
in these retrieved general EULAs: **silent in surveyed text**, not positive
permission. Clarify whether/how the general terms apply to Elements' broad free-use
statement. Local private automation is different from providing a simulation
service; a public PR runner is not automatically licensed either.

Academic paid licences are narrower: SIMetrix suffix E [S2] says “You may use it
only for classroom teaching purposes”; SIMPLIS suffix E [S3] says “classroom
instruction and student research.” These are not evidence that free Elements is
classroom-only. Commercial full editions are paid; no price quote was obtained.

### TINA-TI

The DesignSoft commercial agreement supplied by TI in a licensing support thread
[T1, Direct PDF], §1(a), grants:

> a limited, non-exclusive, royalty-free, non-transferable, non-assignable,
> perpetual license to use the Software.

Section 1(b):

> This license is for a single computer installation. You may not install the
> Software on a network server or otherwise use the Software on more than one
> host computer at the same time.

The complete fetched agreement contains no express benchmark-disclosure or
semiconductor-manufacturer exclusion: **silent in that document**. Internal use
is licensed subject to its restrictions; automation is not expressly named. Its
scope cannot be assumed to authorize a network/cloud runner or competitor oracle.

A different TI public licence/acknowledgment page [T2, Direct] says:

> You hereby certify that you are not an educator or student and will not use
> the TINA-TI software for educational purposes.

That provision is absent from [T1]. Therefore **academic permission and applicable
version terms are unresolved**, not a blanket claim that all TINA-TI versions ban
students. TI's support thread calls [T1] a “DesignSoft Commercial” licence [T3,
Indexed]. TINA-TI is no-cost [T4]; do not conflate its terms/features with paid TINA
or TINACloud.

### PSpice for TI and OrCAD PSpice

Cadence's TI FAQ [P1, Indexed] states:

> Each copy of PSpice for TI that gets downloaded is locked to one system and one
> registered email address, so you cannot share the software with anyone else.

It describes free access for everyone, including students/teachers, renewed at
one-year intervals. TI support directs users to a local `license.txt` [P2,
Indexed], rather than supplying a verified public current simulator agreement.
**Neither the applicable TI-edition EULA nor a current paid OrCAD PSpice commercial
order/agreement was obtained.** Internal competitive automation, disclosure and
semiconductor-vendor restrictions are unknown, not silent. No install was used to
recover that file. Marketing “full-featured” is not a licence grant.

For an actual quoted legal warning, Cadence's academic addendum [C1, Direct]
prohibits “any form of competitive analysis” and improving a competitive tool
(quoted under Spectre below). It is a route-specific restriction, **not proof of
which contract governs PSpice for TI**. A third-party Scribd upload surfaced but
was not treated as authoritative applicable TI terms. OrCAD full licences are
paid; educational/evaluation eligibility and limits require the exact offer and
may inherit competitive-use restrictions. No unrestricted academic route is
established for spice-ts development.

### HSPICE

Synopsys's vendor-hosted EULMD2 SINC, 10.Feb.2014 [H1, Direct PDF], §2.1(c), grants
licensed end users use for “creating, modifying, and simulating your own Designs.”
Section 2.9(f) prohibits:

> use a Licensed Product or its output to develop or enhance any product that
> competes with a Synopsys product;

Section 2.9(h) prohibits:

> disclose the results of any benchmarking of a Licensed Product (whether or not
> the results were obtained with assistance from Synopsys) to any third party;

This is historical vendor-published contractual evidence, **not the verified
current PrimeSim HSPICE agreement**. Under it, competitor oracle use is blocked
before publication; an internal-only accuracy table is not a workaround. Paid
licensed design batch is a different purpose. No blanket semiconductor-vendor
ban is evidenced; competing-product use is the operative restriction. Synopsys's
University Software Program [H2, Indexed] is institutional access, not permission
to evade these terms or a free individual entitlement. Current price/academic
HSPICE package and customer order were not obtained.

### Spectre

Cadence's September 2025 academic addendum [C1, Direct PDF; university host],
replacement Part II §3.3, says:

> Customer may not do any benchmarking (which means any form of competitive
> analysis of the Licensed Materials versus competitive tool products) of the
> Licensed Materials or the output of the Licensed Materials, nor permit any
> third party to do such benchmarking or use the output of the Licensed Materials
> for purposes of improving a competitive tool product.

This prohibits conducting the activity, not merely publishing it. Academic
licences cannot provide spice-ts's private regression oracle under these terms.
A Cadence evaluation agreement [C2, Indexed] similarly excludes “benchmarking
design tools”; it is not assumed to govern every commercial Spectre licence.
Commercial Spectre is paid, quote/order based; its actual base agreement was not
obtained. University access lists Spectre [C3, Indexed] but does not solve the
restriction. No blanket semiconductor-vendor exclusion is evidenced; eligibility,
noncommercial academic scope and competing-tool restrictions matter.

### Eldo / Symphony

Siemens EDA Supplemental Terms v1.6 (June 18, 2025) [E1, Direct PDF], §7.5, says:

> Log files, data files, rule files, and script files generated by or for EDA
> Software (collectively “Files”), [...] constitute or include confidential information
> of SISW.

And:

> Under no circumstances shall Customer use EDA Software or Files or allow their
> use for the purpose of developing, enhancing or marketing any product that is
> in any way competitive with EDA Software.

Siemens base EULA v9.0 (April 13, 2026) [E2, Direct PDF], confidentiality section,
includes as Siemens Confidential Information:

> any information Customer derives from benchmarking any Offering.

Private competitor enhancement and public benchmark disclosure are separate
obstacles. The base EULA has an owned-output exception in its competitive-use
wording; **do not treat that as overriding the EDA-specific §7.5 restriction**.
Applicability requires the actual order and incorporated documents. These are
paid IC/mixed-signal products; Symphony integrates analog/digital simulation, not
simply a separate interchangeable SPICE engine. Higher-education bundles exist
[E3, Indexed]; no Eldo/Symphony entitlement, price or academic benchmark waiver was
verified. No blanket semiconductor-vendor exclusion is evidenced; competitive
use is expressly restricted. Section 1 also excludes EDA Competitor personnel
from “Authorized Agent” and defines “EDA Competitor” broadly as individuals or
entities developing, marketing or providing EDA solutions. Section 7.5 excludes
EDA Competitors from its permitted confidential third-party file sharing.

### Multisim

NI's public general-purpose agreement [N1, Direct PDF], §1.A, says:

> With the exception of Authorized Applications (as hereinafter defined), the
> Software is for your internal use only.

Section 1.B(x) restricts disclosure without prior express written approval of:

> any of the results of such activities or other performance data of the Software;

The full clause starts with stress/penetration/security tests. “Other performance
data” reaches a runtime comparison on a conservative reading; seek clarification
for accuracy/convergence data rather than asserting an exemption. No standalone
competitor-development or semiconductor-manufacturer ban was located in the
surveyed text, but reverse-engineering restrictions, actual licence type, quote
and product addenda remain relevant. Documented internal automation [N2] is a
technical candidate, not clearance to develop spice-ts.

Academic Addendum E [N1] says:

> Software under any of the academic license types may not be used for commercial
> or industrial purposes

and limits use to an academic institution. Student/teaching offers are therefore
not a commercial-development shortcut. Paid editions and an education trial
exist; NI points student purchasers to Studica rather than selling Student Edition
directly [N3, Indexed]. No purchase or current binding price was obtained.

## 2. Batch, outputs, access, and platform feasibility

All commands/formats below are **documentary candidates, not executed commands**.
CLI does not prove display-free or focus-safe operation, licence-server access,
first-run behavior, CI permission, or reproducibility. No native macOS reference
backend among these candidates was established. Windows/Wine observations must
not be extrapolated to Apple Silicon macOS.

| Candidate | Access/limits | Batch and machine-readable outputs | Platform assessment |
|---|---|---|---|
| QSPICE | Free commercial; vendor says no artificial circuit-size/complexity limits [Q1,Q4] | Forum documents `QSPICE64.exe deck.cir`; spicelib documents `.qraw`, `.log`, ASCII/binary and output-file switches [Q5,Q6] | Windows 10/11 x64. Qorvo staff says command-line Wine support possible [Q7]; Linux promising, macOS/Wine unverified |
| Micro-Cap 12 | Full freeware release; no current size cap established | Vendor guide documents `MC12 @TEST.BAT`, `/T`, `/A`, `/D`, `/S`, `/NOF`; numeric `.TNO/.ANO/.DNO`, waveform CSV export [M3,M4] | Windows; community Wine packaging [M5], no verified native Linux/macOS or unattended receipt |
| Elements | SIMetrix: **750 analog nodes**, including internal nodes. SIMPLIS: **15 state variables**, 10 C/L combined, 6 switches, 6 gates, 26 states, 100 new topologies [S4] | “The command line is not present”; no permanent user scripts/Python. GUI waveform viewer; 30-day script unlocking is not a permanent free runner [S1,S4] | Windows 10 x64/11. No supported native Linux/macOS or proven Wine runner established |
| PSpice for TI / OrCAD | TI free registered/renewed access. Imported third-party transistor/diode models can limit to **three traces**, not a blanket three-node circuit cap [P3] | PSpice manual mirror documents `pspice.exe /r deck.cir` [P4]; `.out` listing and Probe `.dat` need build-specific export/parser validation. TI automated-design note is saved GUI project workflow, not proof of a headless daemon [P5] | Windows. No verified native Linux/macOS or reliable Wine activation/batch route; paid OrCAD features cannot be assumed in TI edition |
| TINA-TI | Free, single host; no verified numeric cap | TI support describes GUI `File -> Export -> As text` [T5]. No verified TINA-TI unattended CLI/API; do not import paid TINA/TINACloud capabilities | Windows-based GUI. Community Wine reports are mixed/old [T6]; neither Linux nor macOS headlessness established |
| HSPICE | Paid quote/seat/licence-server; institutional academic program | Linux command-line flow; `.lis`, measurement `.mt#/.ms#/.ma#`, waveform `.tr#/.sw#/.ac#`; vendor WaveView supports binary/ASCII HSPICE [H3,H4] | Linux established documentation; exact release OS matrix required. No macOS/Wine route established/needed |
| Spectre | Paid quote/seat/licence-server; academic product listing | Netlist CLI, PSF/FSDB outputs [C4]; dedicated parser/export needed, not ngspice raw reader unchanged | Vendor documents Linux (RHEL/SLES); exact release matrix required. No native macOS/Wine route established |
| Eldo / Symphony | Paid quote/seat/licence-server; education entitlement unverified | Eldo WDB/FSDB/tr0/PSF, Touchstone/CITI; Symphony command-line mixed-signal arguments [E4,E5] | Vendor-authored sheets document 64-bit Linux. No native macOS/Wine route established |
| Multisim | Paid; restricted education/student/trial access | Windows COM automation opens circuits, runs analyses and returns numerical data [N2,N4]; Grapher exports Excel/LabVIEW [N5]. Not evidence of a standalone `.cir` headless executable | Windows; no vendor-confirmed Linux/macOS or reliable Wine COM route found |

For full SIMetrix/SIMPLIS, scripting/text-export manuals exist, but that does not
restore the deliberately absent Elements interface. SIMPLIS uses piecewise-linear
models rather than ordinary SPICE transistor physics: topology/model conversion
is not an unchanged-input SPICE reference.

## 3. Our corpora: static compatibility, not simulated acceptance

Audit baseline: repository `a521e9e2` (the report branch's pre-change HEAD).
Inspected manifest sources/local paths and scanned local manifest-backed decks for
`.control` and `.model` cards; read the representative decks identified below.
This is **not an exhaustive device/parameter acceptance audit**. Original-corpus
licensing and already-created SPICE3 translations remain separate questions from
commercial engine licensing. No entire corpus is verified to run unchanged in any
candidate.

| Existing corpus family | Static obstacles / best candidate subsets |
|---|---|
| A `ngspice` | 6 of 20 decks have Nutmeg `.control`. Others include ngspice VBIC level 4, HFET, MESA, LTRA and legacy reporting; product-specific model mapping/output audit required |
| B `classic` | 20 SPICE3 examples without `.control`: ordinary analog subsets are plausible, but LTRA, noise/PZ, obsolete options and model levels need checking |
| C `xyce`, `xyce-spice3` | Xyce zero-print-step TRAN, `timeint` options and model syntax are not universal. Existing translated subset is not unchanged original C |
| D `corpus-d`, `corpus-d-spice3` | ahkab `type=vdc/vdc=` and analysis syntax are dialect-specific; existing translated subset is a separate input track |
| E `corpus-e`, `corpus-e-spice3` | Gnucap commands/probe syntax/repeated analyses differ; SPICE3 translation is not unchanged original E |
| F `corpus-f` | 207 of 336 manifest decks have `.control`; model scan also finds XSPICE A/code models and CIDER numerical devices. Not a wholesale commercial-SPICE corpus |
| G `corpus-g` | 128 Xyce regression decks, no `.control`, but Xyce options, ABM, compact-model levels and device extensions still need per-deck audit |
| H `corpus-h` | 16 of 52 decks have `.control`; mixed KiCad/ahkab/PySpice/SpiceSharp dialects and some code models |
| I `corpus-i` | 13 of 25 decks have `.control`; eSim digital XSPICE models and VACASK-origin level mappings are not common SPICE semantics |
| J `corpus-j` | 5 of 20 manifest decks have `.control`; LTspice A primitives, stochastic functions and ngspice code models are not interchangeable |
| K `corpus-k` | 20 decks without `.control`; ordinary MOS2/GP analog networks are promising candidates, not passes |
| `ngspice-bugs` | Ticket reproducers are heterogeneous and can intentionally fail; no unchanged acceptance list inferred from source-engine success |

Counts above are a literal, case-insensitive line scan of manifest `circuits[].localPath`,
not all files in fixture directories. Additional unmanifested fixture files are
not counted. Some translation manifest entries have no local translated file;
none is counted as a commercial pass. This bounded audit does not claim coverage
of newer corpora absent from this baseline.

Per-product unchanged-input assessment:

- **QSPICE:** start with project-authored `benchmarks/wasm-cccs-op/single-ended.cir`
  (V/R/F, `.op/.end`). Ordinary analog B/K and translated SPICE3 subsets are static
  candidates. Nutmeg, XSPICE, proprietary A devices and compact-model numeric
  levels are not assumed compatible. No whole-corpus acceptance established.
- **Micro-Cap:** vendor brochure [M6] advertises SPICE3/PSpice and many HSPICE
  commands/models. B/K/common analog subsets and the CCCS smoke deck are candidates;
  F/I code models and Nutmeg are not implied by that claim.
- **SIMetrix:** common SPICE analog subsets are candidates within the 750-node cap;
  no Elements automated runner. **SIMPLIS:** requires PWL model conversion for
  transistor circuits, so our SPICE corpora are not unchanged SIMPLIS inputs.
- **TINA-TI:** importing a SPICE macro is not equivalent to executing an entire
  analysis deck. No verified unchanged corpus ingestion/batch path; rebuilding
  a TSC schematic would be adapted input, even for a simple RC network.
- **PSpice:** common B/K analog circuits and the CCCS deck are candidates; Nutmeg,
  XSPICE, model levels and reporting syntax require audit. TI imported-model
  probe limits can prevent saving our full assertion signal set.
- **HSPICE:** common analog B/K and CCCS candidate; ngspice scripts/code models
  are not covered. Compact-model name/level/version/defaults must be matched,
  not inferred from identical `LEVEL` numbers.
- **Spectre:** common analog candidates require checking its SPICE-input mode;
  native Spectre syntax is not an unchanged SPICE deck. Nutmeg/XSPICE are not
  accepted merely because Spectre has equivalent analysis features.
- **Eldo:** common SPICE analog B/K and CCCS candidate; exact ngspice/Xyce
  extensions/model mappings unverified. Symphony mixed-signal coverage does not
  establish compatibility with ngspice XSPICE code-model ABI or deck syntax.
- **Multisim:** import/netlist/schematic conversion and Windows API integration
  need validation; no verified unchanged corpus ingestion/headless path.

Concrete traps in actual files: K `k-1` is MOS **level 2**, with `.PRINT AC` and
`.AC`; [its deck](../benchmarks/corpus/corpus-k/fixtures/xyce/Netlists/ACtests/mos/opamp-ol.cir)
is a better analog candidate than digital/code-model decks, not a tested pass.
I's VACASK [`spice_mos.cir`](../benchmarks/corpus/corpus-i/fixtures/vacask/test/spice_mos.cir)
comments call `level=3` BSIM3, but that number selects different physics elsewhere.
Do not propagate the comment as cross-simulator equivalence.

`benchmarks/gummel-poon/vce-1.cir` (GP level 1/DC) is another candidate, but its
four requested `.PRINT` signals can conflict with TI's three-trace rule if the
model is treated as imported. Output-only rewrites, changing model levels,
stripping `.control`, explicit defaults or converting schematics must be retained
as diffs/hashes and labelled **adapted-input**; they are not charter identical-deck
parity. Never replace unsupported physics with MOS1 to count a pass. Future runs
must report all failures, pin versions/options, compare matched-point max/RMS
errors and separate native versus Wine startup timing. No runtime/accuracy ranking
is claimed here.

## 4. Alternatives without installing/licensing a proprietary simulator

Citing already-published results avoids accepting an executable's licence merely
to obtain a waveform. It does **not** automatically grant copying a figure/model,
digitizing data, or using licensed confidential output to improve a competing tool.
Keep a separate **published-evidence** track, not the reproducible simulator
benchmark denominator. Record whether evidence is simulated, measured, analytic
or vendor marketing; do not treat a datasheet measurement as a simulator pass.

| Evidence route | Concrete public source | What it can/cannot establish |
|---|---|---|
| PSpice for TI app note | TI SBOA605, *Create Automated SPICE Designs Using PSpice-for-TI* [P5, Direct PDF] | Published op-amp stability schematic/plots/settings; qualitative AC sanity reference, not independent simulator timing or licensed model redistribution |
| TINA-TI / TI device measurements | TI quick-start/app-note resources [T4] and OPA323 datasheet [A1, Indexed] | Link to documented circuit behavior or measured curves; exact load/supply/temp must match; measurements are not TINA execution results |
| SIMPLIS tutorial | Vendor synchronous-buck transient and load-transient tutorials [A2,A3, Indexed] | Published waveforms and setup; PWL model assumptions differ, no unchanged-deck parity claim |
| Micro-Cap published example | Archived Spectrum WAV/audio-amplifier article [M4, Indexed] | Public input/output plots/export workflow; no verified numerical golden dataset or permission to redistribute the model |
| Spectre vendor article | Cadence crystal-oscillator transient/HB comparison [A4, Indexed] | Vendor-published waveforms; no independently reproduced run, exact source deck or raw data established |
| HSPICE vendor datasheet | PrimeSim HSPICE and HSPICE datasheets [A5,A6, Indexed] | Vendor-reported features/aggregate performance, not a fair speed benchmark against spice-ts without identical disclosed circuits/hardware |
| Eldo/Symphony and Multisim documentation | Vendor fact sheets [E4,E5], NI transient-analysis documentation [A7, Indexed] | Setup/capability references only; no numerical golden waveform corpus verified |
| QSPICE | Qorvo technical creator interview [Q4, Indexed] | Vendor capability claims; no vendor-authored numerical golden dataset verified. Forum-user waveforms are not automatically vendor results |

Prefer links and short attributed quotations; no third-party plots/tables/models
are committed here. If a future published-data case is admitted, add author/title,
URL, revision/date, figure/table number, reuse licence or permission, conditions,
source deck availability and uncertainty to `benchmarks/SOURCES.md`. Preserve
independent circuit authorship; do not reverse engineer encrypted models. Digitized
plots need sampling/calibration uncertainty and cannot support exact tolerances.
Even with vendor publication permission, restricted access prevents universal
public rerun; document that limitation rather than calling the backend open.

## Sources (consulted 2026-10-14)

Legal PDFs are versioned where possible; short quotations above are original-report
citations, not redistribution of complete documents. Technical sources marked
Indexed need direct/build-specific verification before implementation.

- **Q1** Qorvo QSPICE product (Indexed; direct fetch returned HTTP 429): https://www.qorvo.com/design-hub/calculators-simulation/qspice
- **Q2** Qorvo commercial-use staff reply (Direct topic JSON at URL + `.json`): https://forum.qorvo.com/t/license-of-qspice-simulator-for-commercial-use/25612
- **Q3** How2Power August 2023 (Indexed, third-party): https://www.how2power.com/newsletters/2308/products/H2PToday2308_products_Qorvo.pdf?NOREDIR=1
- **Q4** Qorvo creator interview (Indexed): https://www.qorvo.com/design-hub/technical-articles/spicier-spice-free-fast-circuit-simulation-for-mixed-analog-and-digital
- **Q5** Qorvo forum CLI example (Indexed): https://forum.qorvo.com/t/qspice-not-responding/23100
- **Q6** spicelib QSPICE runner documentation (Indexed, third-party): https://spicelib.readthedocs.io/en/latest/classes/qspice_simulator.html
- **Q7** Qorvo Linux/Wine discussion (Indexed): https://forum.qorvo.com/t/are-there-any-plans-for-a-linux-version/14580
- **M1** Spectrum archived downloads (Indexed, mirror): https://gotroot.ca/spectrum/www.spectrum-soft.com/download/download.html
- **M2** Micro-Cap 12 Reference Manual, 2018 (Direct, mirror): https://www.iee.et.tu-dresden.de/~jmueller/simulation/soft/microcap/MC12.RefManual.pdf
- **M3** Micro-Cap 12 User's Guide (Indexed): http://www.spectrum-soft.com/down/ug12.pdf
- **M4** Spectrum WAV export article (Indexed, mirror): https://gotroot.ca/spectrum/www.spectrum-soft.com/news/fall2011/wav.html
- **M5** AUR Wine package (Indexed, third-party): https://aur.archlinux.org/packages/micro-cap
- **M6** Spectrum Micro-Cap 12 brochure (Indexed): http://www.spectrum-soft.com/down/mc12broc_hi.pdf
- **S1** SIMetrix Elements (Direct): https://www.simetrix.co.uk/downloads/download-elements.html
- **S2** SIMetrix general EULA (Direct): https://www.simetrix.co.uk/eula.html
- **S3** SIMPLIS general EULA (Direct): https://simplis.com/sales/simetrix_simplis_eula
- **S4** SIMPLIS Elements limits/requirements (Direct): https://simplis.com/product/elements
- **T1** TI-supplied DesignSoft Commercial agreement (Direct): https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/234/TINA_5F00_license.pdf
- **T2** TI public TINA-TI acknowledgment (Direct): https://www.ti.com/general/docs/gencontent.tsp?contentId=114702&litId=sloc241
- **T3** TI commercial-use licensing support thread (Indexed): https://e2e.ti.com/support/tools/simulation-hardware-system-design-tools-group/sim-hw-system-design/f/simulation-hardware-system-design-tools-forum/1308580/tina-ti-i-d-like-to-request-a-license-information-for-tina-ti-and-filterpro-desktop-tools
- **T4** TI TINA-TI product/resources (Indexed): https://www.ti.com/tool/TINA-TI
- **T5** TI text export support (Indexed): https://e2e.ti.com/support/tools/simulation-hardware-system-design-tools-group/sim-hw-system-design/f/simulation-hardware-system-design-tools-forum/72110/txt-output-file-with-tina-ti
- **T6** Community Wine experience (Indexed, not vendor support): https://www.eevblog.com/forum/projects/running-tina-ti-in-linux-using-wine/
- **P1** Cadence TI FAQ (Indexed): https://www5.cadence.com/pspice-for-ti-faqs
- **P2** TI local licence-file answer (Indexed): https://e2e.ti.com/support/tools/simulation-hardware-system-design-tools-group/sim-hw-system-design/f/simulation-hardware-system-design-tools-forum/940573/pspice-for-ti-license-agreement-pspice-for-ti
- **P3** TI third-party model probe limits (Indexed): https://e2e.ti.com/support/tools/simulation-hardware-system-design-tools-group/sim-hw-system-design/f/simulation-hardware-system-design-tools-forum/969665/faq-pspice-for-ti-why-can-t-i-plot-more-than-three-signals-in-pspice-for-ti
- **P4** PSpice batch manual mirror (Indexed): http://ebook.pldworld.com/_semiconductors/ti/pspice%20for%20ti/doc/cap_ug/Running_PSpice_in_Batch_Mode.html
- **P5** TI SBOA605, October 2025 (Direct): https://www.ti.com/lit/an/sboa605/sboa605.pdf
- **H1** Synopsys EULMD2 SINC, 10.Feb.2014 (Direct): https://www.synopsys.com/apps/docs/pdfs/ip/ARC_EULMD220140210US.pdf
- **H2** Synopsys university program (Indexed): https://www.synopsys.com/academic-research/university.html
- **H3** HSPICE university Linux workflow (Indexed): https://www.ece.ucdavis.edu/~hurst/EEC110b/cscope_inst.txt
- **H4** Synopsys Custom WaveView datasheet (Indexed): https://www.synopsys.com/content/dam/synopsys/verification/datasheets/Custom-WaveView-ds.pdf
- **C1** Cadence Academic Use Addendum, September 2025 (Direct, university host): https://eecs.utk.edu/wp-content/uploads/sites/10/2026/04/cadence-academic-use-addendum.pdf
- **C2** Cadence evaluation Design Materials agreement (Indexed): https://www5.cadence.com/rs/070-BII-206/images/SOFTWARE%20LICENSE%20AGREEMENT_FNL.pdf
- **C3** Cadence university program (Indexed): https://www.cadence.com/en_US/home/resources/company/cadence-university-program.html
- **C4** Spectre FMC datasheet (Indexed): https://www.cadence.com/en_US/home/resources/datasheets/spectre-fmc-analysis-ds.html
- **E1** Siemens EDA terms v1.6, June 18, 2025 (Direct): https://assets.ctfassets.net/17si5cpawjzf/1uji2gUS1mIWqS6QYdwWQL/f454b9b1f6279c5c43fcf22dd82663df/EDA_ST_V1.6_2025.06.18_EN.pdf
- **E2** Siemens EULA v9.0, April 13, 2026 (Direct): https://assets.ctfassets.net/17si5cpawjzf/GlrmfbMTg69uj9iz1TbJX/25ef664ea7ede7b406a668df6b097e59/EULA_V9.0_2026.04.13_EN.pdf
- **E3** Siemens EDA higher education (Indexed): https://www.siemens.com/en-us/company/academic-future-workforce/educators/eda-higher-education-software/
- **E4** Siemens-authored Eldo fact sheet (Indexed, reseller host): https://www.eda-solutions.com/app/uploads/2025/05/eldo-fs-82842-d4.pdf
- **E5** Siemens Symphony fact sheet (Indexed): https://static.sw.cdn.siemens.com/siemens-disw-assets/public/7EyzP7hiRdjiPmryJtnIwu/en-US/Siemens-SW-Symphony-mixed-signal-platform-FS-81766-D6.pdf
- **N1** NI general-purpose software agreement (Direct): https://www.ni.com/content/dam/web/pdfs/legal/software_license_agreement_en.pdf
- **N2** NI Multisim Automation API (Indexed): https://www.ni.com/docs/en-US/bundle/multisim/page/topics/automation-api.html
- **N3** NI student access (Indexed): https://knowledge.ni.com/KnowledgeArticleDetails?id=kA00Z000001DcLgSAK&l=en-US
- **N4** NI numerical output API (Indexed): https://www.ni.com/docs/en-US/bundle/multisim/page/topics/get-output-data.html
- **N5** NI Grapher export (Indexed): https://www.ni.com/docs/en-US/bundle/multisim/page/topics/exporting-simulation-results-from-the-grapher.html
- **A1** TI OPA323 datasheet (Indexed): https://www.ti.com/lit/ds/symlink/opa323.pdf
- **A2** SIMPLIS transient tutorial (Indexed): https://www.simplis.com/documentation/simplis/simplis_tutorial/topics/3_1_set_up_a_transient_simultation.htm
- **A3** SIMPLIS load-transient tutorial (Indexed): https://www.simplis.com/documentation/simplis/simplis_tutorial/topics/5_2_set_up_a_load_transient_simulation.htm
- **A4** Cadence crystal-oscillator article (Indexed): https://community.cadence.com/cadence_blogs_8/b/rf/posts/mmsim12-1-speed-up-transient-analysis-of-crystal-oscillators
- **A5** PrimeSim HSPICE datasheet (Indexed): https://www.synopsys.com/content/dam/synopsys/implementation%26signoff/datasheets/primesim-hspice-ds.pdf
- **A6** HSPICE datasheet (Indexed): https://www.synopsys.com/content/dam/synopsys/verification/datasheets/hspice-ds.pdf
- **A7** NI transient analysis documentation (Indexed): https://www.ni.com/docs/en-US/bundle/multisim/page/topics/transient.html

## Next decision — HUMAN_INPUT_REQUIRED

Research-only report complete; **no authority to execute is requested implicitly**.
Install/provisioning, acceptance of applicable terms, spending or seeking vendor
consent is a separate owner-gated action. There is no proprietary backend task or
runner implementation in this change.

**Mattia: do you authorize requesting written Qorvo clarification that QSPICE may
be used to develop spice-ts and that automated accuracy/convergence/runtime
comparison results may be published publicly?**

Until that decision and applicable terms are resolved, retain ngspice and use
only clearly attributed published evidence, not newly generated commercial
simulator benchmarks.
