# BJT post-assembly centered Newton diagnosis (#1037)

Evidence only. No production core edits, tolerance changes, device bypasses,
fix claim, or issue closure. The solver-boundary candidate is rejected.

## Question and bounded result

Does solving the already assembled companion system as
`x = anchor + solve(A, b - A*anchor)` preserve the self-written BJT's DC rest
state when the absolute `solve(A,b)` fails?

No. The absolute baseline accepts one step then reaches the timestep floor;
the centered candidate accepts none. Native ngspice-47 completes both the
10 ps reduction and the nanosecond-grid control on identical input bytes.
Centering after assembly is not reference-centered DEVICE assembly. It cannot
restore information already lost when forming the companion RHS. This rejects
only the post-assembly candidate, not all centered-Newton formulations.

The reduction is original MIT-licensed spice-ts work. It extends the existing
self-written `transient-bjt-rest-1037.test.ts` constant-bias reduction with a new
title and observational `.save all @q1[vbe] @q1[vbc]` cards. Rounded parameters,
no vendor libraries, no source edges. Native mode uses `-n` and ASCII raw output.
Both engines see the same `.save` cards; spice-ts does not need them to expose
its solution. No vendor decks are rerun here; the prior #1040/#1060 vendor
120 s timeouts remain unresolved. This receipt does not replace that baseline.

## First quantities and step-by-step evidence

`receipt.json.gz` stores every TypeScript Newton solve's matrix, RHS, anchor,
post-assembly residual, absolute and centered answer, every invoked BJT current
check and every accepted solution. Native evidence contains its first five
accepted points, including saved junction states. These are NOT native Newton
iteration traces; internal iteration-to-iteration identity has not been proved.

The initial operating points agree on v(c), i(V1), and vbc. Native saved vbe is
4.650166615412567e-10 V, versus TS 4.6501666154125666e-10 V, a difference of
-5.169878828456423e-26 V. That is the earliest observable difference; do not
mistake the following first-step comparison for exact OP or Newton parity.

At the common first accepted time 9.999999999999999e-16 s:

| quantity | absolute baseline | native ngspice-47 | baseline minus native |
| --- | ---: | ---: | ---: |
| vbe (V) | 4.6501592148630256e-10 | 4.650171608298653e-10 | -1.2393435627444923e-15 |
| vbc (V) | -46.49999995294196 | -46.49999995294197 | 7.105427357601002e-15 |

The centered candidate has no accepted point at this time, so it has no
matched-time waveform metric. Native's saved device state and TS node-derived
junction values are compared at accepted times, never interpolated.

Both variants start from exactly the same TS DC anchor and first assembled
system. At dt=9.999999999999999e-16 s, the base row's RHS is
-82940.87471593682 A, despite physical base current -4.650166661914233e-11 A.
The first binary64 `b-A*anchor` is
`[-1.4551915228366852e-11, 1.4551915228366852e-11, 0, 0]`.
Using Decimal.from_float at 100-digit precision on the ALREADY ROUNDED A,b and
anchor gives approximately
`[-1.5187999259124681e-11, 2.9838344447364795e-12, 1.7763568394002505e-15, 0]`.
The anchor is not an exact solution even of that rounded system; evaluating its
residual in binary64 changes it again. This localizes an assembly/residual
conditioning floor, not a physical charge transient or an LU correctness proof.

The first absolute solve changes vbe by -7.400549543004182e-16 V. With
integrated gpi=22000.0000047519 S, its base prediction error is
1.6281208998125862e-11 A against tolerance 1.0627828756172683e-12 A (15.32x).
It converges on its second iteration but stalls on the next timepoint.

The first centered answer changes vbe by -3.7060963975674053e-19 V but shifts
vbc by -7.105427357601002e-15 V. Integrated gmu=1783.674727098999 S amplifies
that collector-junction ulp; base prediction error is 1.2681924615067148e-11 A
against 1.0591835912342095e-12 A (11.97x). All 100 centered checks fail with
limiting false. Both runs have zero LTE retries. Moving the solve's origin
therefore moves the roundoff failure, rather than eliminating it.

## Before / candidate / oracle

Instrumented execution runtimes below are single runs, not performance claims.
Both shadow solves run in both TS modes; timings cannot represent production
speed or a fair native/TS benchmark. TS counts exclude the initial DC point;
native counts include it.

| deck | baseline | centered candidate | native ngspice-47 |
| --- | --- | --- | --- |
| rest, 10 ps | dt-floor at 1e-15 s, 1 accepted, 4.264 ms | dt-floor at 0 s, 0 accepted, 2.363 ms | success, 108 points, 15.342 ms |
| control, 100 ns | success, 107 accepted, 3.708 ms | success, 107 accepted, 2.609 ms | success, 108 points, 13.804 ms |

Deck SHA-256:
- rest: `ebb2f8620c6f244c010188e3a56788967417e59b7faf142cb9922d96bf335853`
- control: `155ae7098c7f470a8488be068e4820248607daba3985c9462203c807aa8d9a1e`

No complete rest waveform exists in either TS mode, so no max/RMS parity score
is reported. A constant ideal-source v(c) match alone would conceal this loss.

## Reproduction and verification

From repository root, Node 22.23.1, pnpm 10.28.1, ngspice-47, Apple M5 Pro arm64
macOS. The receipt pins runner and test-helper hashes independently of its base
commit. The candidate is installed only on a single simulation instance via a
test-only helper. No production imports the helper.

- `pnpm install --frozen-lockfile`: exit 0.
- RED commit `8a576f957145316e7b0f5d13a7da9512394afc5f`:
  `pnpm -C packages/core exec vitest run src/analysis/transient-centered-1037.test.ts`
  exits 1, expected null but received TimestepTooSmallError. Final `.fails`
  retains the unresolved loss; this is not RED-to-GREEN simulator work.
- `spice-heavy pnpm exec tsx benchmarks/bjt-centered-1037/run.ts`: exit 0.
  Recreates both identical-byte decks under ignored `local/`, runs both solver
  formulations, then native `ngspice -n -b -r <raw> <deck>` with 120 s bound.
  Both native children exit 0. Engine errors are caught as DATA, not successes.
- `python3 benchmarks/bjt-centered-1037/check.py`: exit 0. Offline source hash,
  control, failure, first-point and exact rounded-system residual checks.
- `pnpm -C packages/core exec tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck --types node ../../benchmarks/bjt-centered-1037/run.ts`: exit 0.
- `pnpm -C packages/core exec vitest run src/analysis/transient-centered-1037.test.ts src/analysis/transient-bjt-rest-1037.test.ts src/analysis/transient-nr-retry-804.test.ts src/analysis/transient-ecl-schmitt-818.test.ts`:
  exit 0, 4 files, 8 passed + 2 expected failures (10 total).
- `pnpm build`: exit 0. `pnpm lint`: final exit 0. Initial lint exposed a
  cross-root import from a core test to benchmarks; the wrapper was moved into
  a test-only `.fixtures.ts` file to respect core's composite rootDir.
- `spice-heavy pnpm test`: exit 0. Core 317 files passed, 1 skipped; 4298 tests
  passed, 2 expected failures, 5 skipped (4305 total). Other package suites and
  final benchmark checks pass (198 passed, 4 skipped in final TAP batch).

## Remaining boundary

A genuinely reference-centered charge/device load, preserving small residuals
before large absolute companion terms are formed, remains an untested solver
boundary hypothesis. Native per-Newton charge/convergence tracing would be
needed to establish which native mechanism avoids this floor. Do not weaken
BJT current checks, change tolerances, force timestep sizes, or infer that this
rest reduction explains every earlier rejection in the full ticket-764 decks.
That production design belongs in a separately scoped supervisor card, not this
evidence lane. #1037 remains open.
