---
"@spice-ts/core": patch
---

`.control` scripts accept `set savecurrents` as a front-end variable like ngspice-47, and read `@r[i]`, `@v[i]`, `@b[i]` and `@i[current]` from the circuit's present state after `op`, `dc` and `tran` (#686).
