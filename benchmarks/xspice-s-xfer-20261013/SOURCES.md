# Sources and licences for the bounded s_xfer slice

Issue: https://github.com/mfiumara/spice-ts/issues/553 (Refs, not Fixes).

- Semantics and transcribed port/parameter tables are from ngspice revision
  `3ef069fb1f04177a153f342a32d941fc20ff047e` (ngspice-47).
- `source/cfunc.mod` and `source/ifspec.ifs` explicitly declare Public Domain,
  Georgia Tech Research Corporation. Their unmodified bytes are included;
  SHA-256 values are recorded in `receipt.json.sourceHashes`.
- Upstream source URLs:
  https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/src/xspice/icm/analog/s_xfer/cfunc.mod
  https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/src/xspice/icm/analog/s_xfer/ifspec.ifs
- The eight newly authored minimal `.cir` contracts and this harness are MIT,
  under the repository licence. They exercise the documented code-model interface.
- The five unchanged originals are already recorded centrally in
  `benchmarks/SOURCES.md` and `benchmarks/corpus/corpus-f/manifest.json`, BSD-3-Clause.
  Full source URLs, revision, licence, local path, original hash, and historical
  ngspice outcome are copied into each original's receipt, without changing the
  shared manifest or outcomes. No fixture is edited.
- Original paths under the same ngspice source revision:
  `examples/xspice/original-examples/analog_models2_ac.deck`,
  `analog_models2_dc.deck`, `analog_models2_swept_dc.deck`,
  `analog_models2_transient.deck`, and `examples/xspice/various/x_fer.cir`.
- `reference/*.raw.gz` are fresh ngspice-47 output, not input circuit sources.
  Raw uncompressed hashes are recorded per reference. They include the four
  dot-analysis originals even when spice-ts fails. The original x_fer control
  run exits successfully but exports no raw vectors; its raw hash and error
  metrics remain null, with the stdout/stderr retained in the receipt.

The card prohibits editing shared SOURCES.md. The supervisor should add a central
pointer to this scoped registry in a separately reserved follow-up. This is not
permission to omit provenance or claim the new reductions were centrally registered.
