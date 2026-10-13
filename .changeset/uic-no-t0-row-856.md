---
"@spice-ts/core": patch
---

`.tran ... uic` no longer writes a t = 0 output row. That row was the UIC seed, which holds only the `.ic` / `IC=` values, so every source-driven node read 0 V there (v(input) = 0 on corpus-h diode-envelope-detector). Like ngspice-47 (dctran.c dumps only `CKTtime > 0` in MODEUIC), the first saved point under UIC is now the first accepted step, in both `simulate()` and `simulateStream()`. Without `uic` the t = 0 operating point is still saved (#856).
