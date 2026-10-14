# MOS1 native/TypeScript history trace (#1080)

Evidence only, Refs #1080. No production code, fixture, tolerance or TMAX
change. This follow-up identifies an early predictor-load discrepancy, but
has not established which history policy causes the accepted-waveform loss.
Do not close #1080 or describe these receipt guards as a simulator fix.

## First meaningful divergence

The trace starts at OP and continues through 19.51 us, rather than assuming
that the late edge is the first divergence. OP differences are roundoff-level.
The first shared first-iterate gate-current difference above the explicitly
reported diagnostic floor of 1 nA is at **1.50074340307059 us**, before the
first accepted-grid separation above 10 fs at about 1.504792 us. These floors
only select readable trace events; they do not change simulator tolerances
or corpus comparisons. Small floating-point differences exist earlier.

At that first event, both engines attempt approximately 0.495602047 ns,
order 2/TRAP, predictor ratio 2. Native MN1 does not bypass. Gate-source:

| field | native ngspice-47 | TypeScript |
|---|---:|---:|
| loaded channel vgs V | 4.862807535252310 | 4.8628075250734435 |
| accepted qgs C | 8.200593705274348e-13 | 8.200593699706123e-13 |
| first-iterate qgs C | 8.049243272076642e-13 | 8.200593699706123e-13 |
| first-iterate cqgs A | -3.053870218972124e-5 | +3.053870443681572e-5 |

Channel predictor voltages agree closely, but TS charge is unchanged from
the accepted point, so the trapezoidal companion reverses the old current.
Native mos1load.c extrapolates gate charges in MODEINITPRED (809-818), and
integrates that predicted charge. TS MOSFET.stampTransientCharge instead
calls incrementalCharge at the Newton iterate, which initially is the old
accepted solution, while its static channel stamp uses predicted voltages.
The measured maximum first-iterate gate-current difference is
6.107740662653696e-5 A. This is a concrete device-load discrepancy, not a
TMAX or parameter-alias hypothesis.

It is not sufficient to attribute the final loss to that first iterate:
later Newton loads discard the predictor charge in native too. Additionally,
TS accepts/recomputes charge at the converged solution whereas native retains
the last loaded state (within Newton tolerance), and native tolerance bypass
is not equivalent to TS bit-identical channel-cache reuse. Those differences
can alter cumulative history, LTE and subsequent adaptive grids. We have not
run a fixed-history/fixed-schedule causal replay or a generic production fix.

## 19.505 us comparison

`history-window.json.gz` publishes both full iteration streams over
19.49-19.51 us. `history-summary.json` contains the corner, the first current discrepancy, and the first grid
separation. Do not equate iteration numbers between different adaptive grids.

- Native first attempts dt=0.8034407528926917 ns, order 2, seven Newton
  loads. The MOS truncation bound becomes 0.6889690310515092 ns, so this
  candidate is rejected. After an intervening accepted point it reaches the
  corner with dt=0.11447172184220374 ns and four Newton loads. Both attempts
  and their LTE records are retained, not collapsed into one accepted step.
- TS reaches the corner with dt=0.4213550710191515 ns, TRAP, four Newton
  loads; MN1/MP1 truncation bounds are 0.7019853707167944 and
  0.5385372233426011 ns. The corner loads are not channel-cache hits.
- Accepted native i(vdddev)=-0.0015772673739574594 A, v(vout)=4.14760424585268 V.
- Accepted TS i(vdddev)=-0.0013664114551422994 A, v(vout)=4.41264686267291 V.

The instrumented native run's entire binary waveform payload is bit-identical
to stock Homebrew ngspice-47 on the original deck, not just the corner. The TS
wrapper reproduces the previously recorded corner current exactly. Full
records through 19.51 us: native 15,393, TS 14,372. Native accepted waveform
includes OP (1,286 points); TS `advance()` omits OP (1,290 points). The grid
comparison explicitly excludes native OP rather than comparing offset indices.

## Artifact and field conventions

- `native-history.patch`: only observation writes and a local bypass marker,
  applied to the pinned ngspice-47 source archive. No algorithm changes.
- `native-history.txt.gz`: raw native LOAD/ITER/LTE output.
- `native-history.json.gz`: parsed raw trace and accepted native waveform.
- `ts-history.json.gz`: process-local wrappers around scalar/batch channel
  loading, charge-current evaluation, truncation and acceptance. Both scalar
  and batch paths are observed. Attempt/iteration labels reset on each
  batchBeginTransientNewton. No wrapper alters a returned numeric value.
- Native gate order: gs,gd,gb; TS entries: gd,gs,gb,bd,bs. Native charges and
  currents are polarity-domain; TS uses node-domain (negate PMOS values).
  Absolute charge offsets may differ; compare increments and currents.
- Native `mode` is the CKT mode bitmask (8193=TRAN|INITPRED,
  257=TRAN|INITFLOAT). Native `bypass` is the actual goto-bypass decision.
  TS `cacheHit` mirrors the exact seven channel-cache input keys; it is not
  a tolerance bypass and does not suppress gate-charge evaluation.
- Native `capacitance` is the effective averaged Meyer C; TS `capacitance`
  is the current full C, with accepted C separately recorded. Their arithmetic
  mean is the effective gate C. `factor` is dI/dQ.
- Native LTE bounds are the cumulative device sweep bound after each device;
  TS bounds are individual device bounds. Take minima, not per-device equality.

## Unchanged public corpus and verification

`history-corpus-before.json.gz` retains the committed baseline from #1105;
`history-corpus-after.json.gz` is a fresh full 24-deck run at base main
5ece9928. Their core trees differ because intervening unrelated fixes landed;
`history-corpus-delta.json` explicitly records both trees. Every row retains
its outcome, score and full comparison metrics: 15 matches, 6 mismatches,
3 losses. m-18 remains **0.249 -> 0.249**; max/RMS absolute supply-current
errors remain 4.459265790256867e-4 / 1.929833451751002e-5 A. No speed claim.
Shared corpus reports were restored; this receipt does not overwrite them.

Commands exercised:

- `pnpm install --frozen-lockfile`
- `pnpm build` and `pnpm lint`: exit 0.
- `pnpm -C packages/core exec vitest run src/devices/mos1-invert1-1080.test.ts src/devices/mosfet-predictor-878.test.ts src/analysis/transient-mos1-predictor-878.test.ts`:
  4 passed, 1 existing expected-failure loss.
- `spice-heavy pnpm exec tsx benchmarks/corpus/corpus-m/parity.ts`: exit 0,
  all 24 rows published, including unchanged losses.
- `pnpm exec tsx --test benchmarks/mos1-invert1-1080/history-receipt.test.ts`:
  guards for inventories, predictor discrepancy and full corpus deltas.

Exact-head required GitHub CI, not these receipt guards, is the full gate.

## Reproduce the trace

From repo root, use a disposable local directory (here `.trace-native`):

1. Download https://github.com/imr/ngspice/archive/refs/tags/ngspice-47.tar.gz;
   archive SHA256 is in `history-metadata.json`. Extract and apply
   `patch -p1 < ../../benchmarks/mos1-invert1-1080/native-history.patch` from
   the source directory.
2. Put modern Bison on PATH (macOS `/opt/homebrew/opt/bison/bin`), then run
   `./autogen.sh` and
   `./configure --disable-debug --without-x --enable-xspice --disable-cider --disable-openmp --without-readline`,
   followed by `spice-heavy make -j2`. macOS system Bison/readline are too old;
   ngspice-47 also fails this build with XSPICE disabled (OPT_ENH_RSHUNT).
3. Run `ISSUE1080_TRACE=1 .trace-native/ngspice-ngspice-47/src/ngspice -b -r .trace-native/native.raw benchmarks/corpus/corpus-m/fixtures/xyce/Netlists/MOSFET_ParamAliases/invert1.cir > .trace-native/native.out 2> .trace-native/native.trace`.
4. Run `spice-heavy pnpm exec tsx benchmarks/mos1-invert1-1080/history-trace.ts`.
5. Run `python3 benchmarks/mos1-invert1-1080/summarize-history.py .trace-native/native.trace .trace-native/native.raw`.

Fixture SHA256 and archive provenance are in `history-metadata.json`.
Xyce fixture licence/pin remains in benchmarks/SOURCES.md and corpus-m/SOURCES.md.
Native upstream source retains its Berkeley/modified BSD notices/COPYING;
patch context is not relicensed. Observation/parser scripts are original MIT
project work; numeric traces are generated measurements.

## Precise next hypothesis / ownership handoff

Replay both engines from identical accepted q/C/v/current histories and
identical attempted timestep/order around the first falling edge, independently
varying (1) predictor charge/charge linearisation voltages, (2) accepted
last-load versus recomputed-solution charge, and (3) tolerance bypass. Preserve
all rejected attempts. First compare assembled companion RHS and converged
q/cq, then LTE bounds. If predictor-only parity changes only iteration work,
reject it as the #1080 waveform fix and prioritize accepted-charge/history
semantics. Only after isolating a causal generic change should a new RED test
and production fix be shipped. No per-circuit step cap or tolerance workaround.
