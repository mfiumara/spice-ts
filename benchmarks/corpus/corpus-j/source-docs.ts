import { readFile, writeFile } from 'node:fs/promises';
async function main() {
  const root = 'benchmarks/corpus/corpus-j';
  const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
  const table = ['| Original path / pinned revision URL | SPDX | SHA-256 | Include closure |', '|---|---|---|---|',
    ...manifest.circuits.map((c: { upstreamPath: string; sourceUrl: string; licence: string; sha256: string }) =>
      `| [${c.upstreamPath}](${c.sourceUrl}) | ${c.licence} | ${c.sha256} | empty; standalone |`)].join('\n');
  const counts: Record<string, number> = {};
  for (const exclusion of manifest.exclusions) counts[exclusion.reason] = (counts[exclusion.reason] ?? 0) + 1;
  await writeFile(`${root}/SOURCES.md`, `# corpus-j source survey (#940)

Partial artifact: 11 novel original-input hashes, not the requested 20. No engine-success filter, byte adaptation, tolerance tuning or derived padding. None has an ngspice-47 reference in the recorded run: all 11 are both-failed. This is not measured correctness-parity expansion. The two independently authored upstream mc() AC-filter variants are retained verbatim, not constructed variants or deterministic waveform evidence.

## Sources and redistribution

- SpiceSharpParser: https://github.com/SpiceSharp/SpiceSharpParser at 8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7. MIT repository-wide grant; original copyright notice retained verbatim in licenses/spicesharpparser/LICENSE. Nine LTspice A-device examples (PLL, phase detector, clock divider, DFF, latch, OTA, varistor, modulator, sample/hold), and two AC-filter examples. No vendor libraries or nested third-party notices are redistributed.
- FOSSEE eSim: https://github.com/FOSSEE/eSim at 1a25a46ce15e0ccc35296dd513f40249c089a5a7. GPL-3.0-only per README and LICENSE (retained in licenses/esim/LICENSE). Survey only; no eSim deck is committed. fetch-esim.py names 24 .cir/.cir.out pairs plus 17 PLL/mixed-signal/adder decks. All 65 candidates were duplicate, no-analysis, or not self-contained. PLLs require absolute IHP PDK paths; other classics need diode/BJT/vendor companions. Uncertain redistribution closures are excluded, never bundled.
- The earlier ngspice survey was inspected, but heterogeneous COPYING explicitly warns against assuming one repository licence; no uncertain-licence fallback deck was admitted. No KiCad schematic export or derived adaptation was used to fill the batch. Existing KiCad text decks at the historical pin were already surveyed by corpus-h/i; this artifact does not claim a fresh KiCad survey.

## Reproduce from repository root

Set TMPDIR to the profile scratch directory, then:

    python3 ${root}/fetch-esim.py
    git clone https://github.com/SpiceSharp/SpiceSharpParser "$TMPDIR/940-spicesharpparser"
    git -C "$TMPDIR/940-spicesharpparser" checkout 8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7
    pnpm exec tsx ${root}/select.ts "$TMPDIR"
    pnpm build && pnpm lint
    spice-heavy pnpm exec tsx ${root}/parity.ts
    pnpm exec tsx --test ${root}/corpus-j.test.ts

Selection scans pinned git paths/blobs and the explicitly fetched eSim paths, comparing exact and terminal-newline-stripped hashes against every other benchmarks/corpus/*/fixtures directory. No engine is run during selection. It uses corpus-h static rules unchanged plus a scoped PWL-file exclusion: Example12.cir needs unbundled Resources companion data, missed by the inherited classifier. Full exclusion hashes and reasons are in manifest.json. No excluded deck/model contents are committed.

## Selected original inputs

${table}

## Inspected exclusions

${Object.entries(counts).sort().map(([reason, count]) => `- ${reason}: ${count}`).join('\n')}

97 total; exact source/path/hash/detail for each is in manifest.json. Retained fixture and licence bytes are checked against pinned git blobs; URLs alone do not establish identity.

## Loss observations for supervisor deduplication

- j-1..j-9: inline LTspice A-device syntax is not ngspice XSPICE .model syntax. spice-ts reports unknown model names (last inline numeric value), ngspice rejects A-cards; simple-pll also reports unsupported if(). Cross-dialect rejection is not proof of a simulator regression on runnable ngspice input.
- j-10/j-11: mc() unsupported in the original decks by both engines; j-11 also carries .step. No random-realization or expression rewrite is used to force comparison.
- Outcomes: matched=0, mismatch=0, not-compared=0, spice-ts-loss=0, ngspice-failed=0, both-failed=11. ngspice=8 failed/3 unsupported/0 success; spice-ts=11 unsupported/0 success.

No new issues filed. No paired samples means empty metrics/null worst error, not measured zero error. Detailed matched-point max/RMS absolute/relative receipts use the unchanged shared comparison metric whenever available. The wrapper reuses unchanged corpus-f packed engine runners/reducers and corpus-h summarization/rendering, with serial owned groups and persisted wall reservations. No daytime aggregate refresh; incorporation is deferred to nightly #855.
`);
  console.log(table);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
