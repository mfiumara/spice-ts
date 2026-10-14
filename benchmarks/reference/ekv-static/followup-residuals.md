Parent: #4. Residual buckets from the static EKV2.6 slice are retained in benchmarks/reference/ekv-static/metrics.md and the compressed before/after receipts. Reference per fixture is xyce-7.10. No parity claim.

Measured residuals:
- Published NMOS DC: max absolute current error 3.41455894e-10 A; RMS 2.92876957e-10 A. Relative max remains 1 and RMS 0.052631579. The max occurs at five zero-VDS samples where spice-ts yields exactly zero and Xyce yields roughly -1.016e-15 to -1.562e-15 A. They are above the shared 1e-15 exclusion threshold and remain published; do not raise the floor to hide them.
- Published PMOS DC: max 2.59071537e-10 A; RMS 1.42621710e-10 A; max relative 1.5324688e-5. Investigate residual interpolation/default constant differences using additional weak-inversion/body-bias probes, not per-deck tuning.
- Static-only inverter transient: output max 0.00943929264 V, RMS 0.0013536955 V; supply current max 1.35720372e-6 A and max relative 0.306455944. Input-waveform alignment retains 0.00545034779 V max and 2.90101883 max relative near zero. Missing intrinsic/junction charges and adaptive-grid alignment are explicit ceilings.
- Substrate impact ionization and diode breakdown/tunneling are not implemented; IBA/IBB/IBN and named deferred parameters emit warnings. Validate high-VDS/body-junction probes before enabling them.
- M follows the published parallel-device equation, while Xyce's implementation may not scale intrinsic current consistently. NS != 1 is explicitly rejected. Validate multiplicity separately, rather than claiming Xyce parity outside M=NS=1 fixture coverage.

Expected divergence, not an ngspice EKV bug: corpus-g EKV inverter now differs from ngspice-47 by max 2.10228131 V / RMS 0.632253918 V at the output. Label ngspice-lacks-model (MOS1 fallback); ngspice does not implement LEVEL=260. The same corpus-g source vs Xyce has the inverter residuals above. Keep historical ngspice fallback evidence unchanged and record the divergence in future corpus refreshes.

Acceptance: characterize each bucket publicly, add regression tests, compare exact deck bytes with Xyce, retain all near-zero and transient losses, and scope any fixes separately from full-model parity claims.
