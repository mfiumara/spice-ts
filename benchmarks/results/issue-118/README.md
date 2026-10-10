# Issue 118 topology-lock performance receipts

These receipts were collected on the same Apple M5 Pro machine with Node v22.23.1, pnpm 10.28.1, and ngspice-47. Both scaling reports retain every raw sample, machine metadata, tool versions, byte-identical netlist hashes, and ngspice results.

## End-to-end scaling

Command for each revision:

`pnpm bench:scaling -- --sizes=1000,5000,10000 --warmups=3 --runs=10 --output=<receipt>`

| Nodes | spice-ts median before | spice-ts median after | Change | Peak RSS before | Peak RSS after | Change |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 1.984 ms | 1.960 ms | -1.18% | 155.41 MiB | 135.69 MiB | -12.69% |
| 5,000 | 9.771 ms | 9.776 ms | +0.06% | 182.97 MiB | 184.98 MiB | +1.10% |
| 10,000 | 21.682 ms | 20.602 ms | -4.98% | 224.05 MiB | 214.63 MiB | -4.21% |

The 5,000-node run is a measured loss/neutral result, not hidden. Raw data is in `before.json` and `after.json`.

## ngspice losses retained

At 1,000 / 5,000 / 10,000 nodes, the after revision is respectively 3.00x / 5.05x / 5.76x slower than ngspice's internal analysis median and uses 11.59x / 10.57x / 8.77x its reported peak memory. spice-ts remains faster than a fresh ngspice CLI process wall clock in this harness (7.01x / 2.64x / 1.97x), but that is not an analysis-time win.

## CPU profiles

`profiles/profile-topology-lock.ts` constructs a 10,000-row general sparse pattern (tri-diagonal G plus irregular C entries) and locks it 50 times. Both revisions produced the same 1,571,350 aggregate structural nonzeros. Profiles were captured with Node's sampling profiler against the same harness and toolchain:

- `profiles/topology-lock-before.cpuprofile`: 86 samples; 20 `lockTopology` self samples; 17 GC samples.
- `profiles/topology-lock-after.cpuprofile`: 53 samples; 13 `lockTopology` self samples; 19 GC samples.

The optimized implementation reduced `lockTopology` self samples by 35%, while GC self samples increased by two in this sampled run. Sampling profiles are directional rather than timing substitutes; the raw end-to-end repetitions above are the primary timing evidence.
