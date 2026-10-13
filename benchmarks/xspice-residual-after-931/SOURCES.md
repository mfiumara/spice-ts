# Sources and licences

All original inputs are already centrally registered in `benchmarks/SOURCES.md`
and `benchmarks/corpus/corpus-f/manifest.json`. No shared registry is changed here.
The receipt carries each original URL, BSD-3-Clause licence, byte count and hash.
`source/COPYING` is the unmodified pinned upstream licence text, distinguishing
examples/tests (Modified BSD) from code-model public-domain files and other code.
The COPYING document itself declares CC-BY-SA-4.0, copyright 2026 ngspice team.
That document remains unmodified and under CC-BY-SA-4.0, not MIT; attribution and
its immutable source URL are retained here and in the document's own header.

The source revision is `3ef069fb1f04177a153f342a32d941fc20ff047e` (ngspice-47).
Every original is independently checked against git bytes at that revision.
Source URLs for the five inputs:

- https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/examples/xspice/original-examples/analog_models2_ac.deck
- https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/examples/xspice/original-examples/analog_models2_dc.deck
- https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/examples/xspice/original-examples/analog_models2_swept_dc.deck
- https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/examples/xspice/original-examples/analog_models2_transient.deck
- https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/examples/xspice/various/x_fer.cir

The following six unmodified source files each explicitly declare Public Domain,
Georgia Tech Research Corporation, in their own header. Redistribution here is
permitted by that declaration. They are not relicensed as MIT. `receipt.json`
records each file's SHA-256. Source URLs:

- https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/src/xspice/icm/xtradev/core/cfunc.mod
- https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/src/xspice/icm/xtradev/core/ifspec.ifs
- https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/src/xspice/icm/xtradev/lcouple/cfunc.mod
- https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/src/xspice/icm/xtradev/lcouple/ifspec.ifs
- https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/src/xspice/icm/analog/s_xfer/cfunc.mod
- https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/src/xspice/icm/analog/s_xfer/ifspec.ifs
- Licence text https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/COPYING

New runner, readout driver, evidence tests, and diagnosis prose are self-authored
under the repository MIT licence. No new circuit reduction is redistributed.
Compressed native/ngspice samples and receipts are measured output artifacts,
not modified input decks. Machine paths and versions are recorded for audit,
with no credentials or personal startup files read.

The card explicitly forbids a shared SOURCES.md edit. The supervisor can register
a central pointer to these additional core/lcouple source copies in a separately
reserved provenance change; this card does not silently take that file.
