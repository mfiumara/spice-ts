---
'@spice-ts/core': patch
---

`.control` blocks now accept whole-line `#` comments and the `edit` command as ngspice-47 batch mode does: `#` lines are skipped, and `edit` adds the `control` warning "`edit' is disabled because 'interactive' has not been set" and the script continues (it is still rejected after `set interactive`). Fixes #787.
