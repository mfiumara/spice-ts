---
'@spice-ts/core': patch
---

`.control` `setplot` and `destroy` of a missing plot no longer abort the script: like ngspice-47 batch mode they add the `control` warning "no such plot named <name>" / "no such plot <name>", keep the current plot and continue. `setplot previous`/`next` step through the plots (warning at either end), and `setplot` matches the newest plot a name prefixes, as ngspice-47 get_plot/plot_prefix do. Fixes #798.
