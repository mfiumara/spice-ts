---
"@spice-ts/core": patch
---

Accept the micro sign `µ` (U+00B5) as the micro scale suffix like ngspice-47: it is read as `u` on every card after the title line except `*` comments, including `.param` expressions, node names, included files and `.control` lines, so `2µ`, `1µs` and `2µmeg` are 2e-6, 1e-6 and 2e-6. `.include`/`.lib` file names and the Greek mu U+03BC are left unchanged, as in ngspice-47 (#508).
