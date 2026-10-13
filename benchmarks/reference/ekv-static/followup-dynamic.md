Parent: #4. First static slice implements LEVEL=260 EKV 2.6 at TNOM, independently from public EPFL equations and checked against Xyce 7.10. It does not implement dynamic charges, AC/NQS or noise. Every EKV instance emits a static-only warning; explicit deferred model parameters are named in warnings.

Scope of follow-up:
- Charge-conserving intrinsic terminal charges plus diffusion junction charge, analytic transcapacitances, transient integration and AC/NQS.
- Thermal/flicker noise and nominal-to-device temperature scaling (TCV, BEX, UCEX, IBBT and junction coefficients). The static slice rejects TEMP != TNOM with UNSUPPORTED_TEMPERATURE, rather than silently using nominal values.
- Add supported optional process-parameter initialization (TOX/NSUB/VFB/UO/VMAX), external series resistance RSH and series multiplicity NS when validated.

Acceptance: identical hash-pinned decks against Xyce 7.10; red tests first; analytic derivatives checked by finite difference; full benchmark losses retained; no per-deck tuning or npm publishing. Sources/licences in benchmarks/SOURCES.md. Baseline evidence is benchmarks/reference/ekv-static/metrics.md.
