---
"@spice-ts/ui": patch
---

Accept core 0.3.x and 0.4.x in the UI peer dependency. Only escalate peer dependents when the new dependency version leaves their supported range, avoiding an accidental UI 1.0.0 release.
