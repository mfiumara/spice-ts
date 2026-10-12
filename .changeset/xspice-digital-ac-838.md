---
'@spice-ts/core': patch
---

`.ac` now runs with XSPICE event-driven digital instances (d_and, d_xor, ..., adc_bridge, dac_bridge) like ngspice-47 acan.c: the operating point comes from the event/analog alternation (EVTop), so every digital instance keeps its operating-point state, and the sweep linearises only the analog part (dac_bridge outputs are ideal sources with no AC value). A deck whose nodes are all digital (eSim's half_adder) is no longer rejected as having no nodes. `.noise` and the other analyses still reject digital instances.
