# Sources and licences

This registration is scoped to this diagnosis. No shared benchmark manifest or SOURCES file is modified.

| Material | Source | Licence / treatment |
| --- | --- | --- |
| Minimal issue deck | https://github.com/mfiumara/spice-ts/issues/888 | Project-authored MIT reproduction; issue deck retained byte-for-byte including title and final newline. |
| Other 15 circuit reductions and harness | Authored for spice-ts, https://github.com/mfiumara/spice-ts | MIT, under repository LICENSE; not copied from upstream example files. |
| Model/parameter control problem statements | https://github.com/mfiumara/spice-ts/issues/854 and https://github.com/mfiumara/spice-ts/issues/857 | Project-authored reductions. |
| ngspice reference implementation | https://git.code.sf.net/p/ngspice/ngspice | Tag ngspice-47, full revision `a80f6e3e95d51534905b1f23410a951802666656`. Fetch only into ignored `.run/upstream`; no upstream source redistributed. |
| ngspice licence receipt | `COPYING` at that revision | Document CC-BY-SA-4.0; numparam directory LGPL-2.0-or-later; frontend subckt.c/inpcom.c Modified BSD. See source hashes in receipt.json. Only hashes and source-location references committed. |

Pinned source SHA-256 values, also machine-readable in receipt.json:

```
COPYING                                  6d939001e899ede403277fb37124c2af6f1cf92926465cd8f4bf59859e06f579
src/frontend/numparam/numparam.h          719df8690fdf1665306bd9eb0bfd660f7981a6020acc2917f0c84d5858375dad
src/frontend/numparam/xpressn.c           e0b079e8c8dc7697e34a49f9b9c10af18d42c6ecdb757c5300c024fcf89e7ef0
src/frontend/numparam/spicenum.c          1341278bb7c24690ba3c6be0356276f8fa6d16a51aec283b4ac1cbbd24d863a2
src/frontend/subckt.c                    2bbf6f248204d5bf6b82245527b860897bf2d0b3db4e35378774571a4b9ca22f
src/frontend/inpcom.c                    5ee51218fb36937ba55ee5e395ef837b34b65133914090db78d4930dae8f5e68
```

The installed reference reports ngspice-47 with KLU. The Homebrew 47 source archive is
https://downloads.sourceforge.net/project/ngspice/ng-spice-rework/47/ngspice-47.tar.gz,
whose formula checksum is `894e649651f1838a14095e5a5439e7d3aa63e87ede14d283173fda4fcdef675f`.
The measured binary is the Homebrew installation, not a binary rebuilt from the fetched Git revision.
