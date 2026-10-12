---
'@spice-ts/core': minor
---

XSPICE event-driven digital simulation (#553 slice 3): `d_buffer`, `d_inverter`, `d_and`, `d_nand`, `d_or`, `d_nor`, `d_xor`, `d_xnor`, `adc_bridge` and `dac_bridge` with ngspice-47 semantics (0/1/U states and strengths, rise/fall and inertial delays, `~` inverted ports, multi-driver resolution, EVTop operating point, event/analog transient coordination). Digital node values are available as `TransientResult.digital(node)`.
