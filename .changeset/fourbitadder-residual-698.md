---
---

Benchmarks only, no package release: corpus-f fourbitadder #698 is root-caused and closed. Bisected with `triage-detail.ts` against ngspice-47, the 1-7 uV TTL internal-node residual was removed by transient step control (#689 CKTtrunc, #758 dctran first step and order), not by a BJT model change. `triage-511.test.ts` now guards it live: the uV-level nodes stay within VNTOL at default steps, and every signal stays within VNTOL with both engines at TMAX 10 ps.
