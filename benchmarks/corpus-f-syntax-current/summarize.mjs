import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { bucket, MAIN_SHA } from './reconcile.mjs';

const ROOT = 'benchmarks/corpus-f-syntax-current';
const receipt = JSON.parse(readFileSync(`${ROOT}/receipt.json`));
const issues = JSON.parse(readFileSync(`${ROOT}/issues.json`));
const prs = JSON.parse(readFileSync(`${ROOT}/merged-prs.json`));
const count = select => Object.fromEntries([...new Set(receipt.fixtures.map(select))].map(key => [key, receipt.fixtures.filter(row => select(row) === key).length]));
const links = (issueNumbers, prNumbers) => [
  ...issueNumbers.map(number => { const row = issues.find(item => item.number === number); assert.ok(row, `issue ${number}`); return { ...row, kind: 'issue' }; }),
  ...prNumbers.map(number => { const row = prs.find(item => item.number === number); assert.ok(row, `PR ${number}`); return { ...row, kind: 'merged-pr' }; }),
];
const routing = {
  'XSPICE code-model coverage': { links: links([553, 487], [554, 670, 778, 865]), recommendation: 'Continue existing #553. Split by model family, not a generic parser rewrite. Counts are first blockers only, not guaranteed wins; d_cosim additionally needs external HDL executables.' },
  'control/vector/function execution': { links: links([488, 870, 496], [616]), recommendation: 'Diagnose control-loop scalar resolution (3) and vector naming (1). Do not reopen closed #488 as if no control support landed. Propose a narrow control follow-up only after minimal identical-deck reproduction.' },
  'VBIC model/instance form': { links: links([526, 446, 352], [361, 457]), recommendation: 'Extend the existing bounded VBIC parameter coverage via #526; NF and KFN remain explicit unsupported errors. No solver fix inferred.' },
  'model resolution/instance forms': { links: links([559, 503, 854, 837], [562, 599]), recommendation: 'Investigate nch model resolution (2) separately from VDMOS thermal-node Tc mistaken for model (1). #559 already owns self-heating; do not create a duplicate thermal issue.' },
  'BJT excess phase PTF': { links: links([5, 633], []), recommendation: 'Route excess-phase implementation to existing #5. PTF unsupported is explicit, not an undiagnosed parsing failure.' },
  'string/vector numparam': { links: links([496, 870], [616]), recommendation: 'Closed #496 delivered a bounded numeric slice, not string/vector parameters. Propose a dedicated remaining string/vector follow-up; keep the active #871 parser lane independent.' },
  'thermal/self-heating': { links: links([526, 490, 559], [527]), recommendation: 'Use #526 for diode thermal-node coverage. #559 is related VDMOS work, not proof that the diode is implemented.' },
  'Gear integration order 3': { links: links([494], [47, 819]), recommendation: 'Gear-2-only rejection is intentional current coverage. Recommend higher-order Gear only with a bounded ngspice parity reproduction, not ignoring maxord=3.' },
  'numparam function/node substitution': { links: links([870, 493, 782], [616]), recommendation: 'Investigate node-valued function arguments being expanded to v((17.0)); numeric parameter/function support does not imply correct node substitution. Keep follow-up separate from #871 temperature work.' },
  'XSPICE invalid-input validation': { links: links([553], [554]), recommendation: 'Both fixtures historically fail ngspice; preserve negative-input failures. Do not count them as parity opportunities.' },
  'native success, parity not computed': { links: links([860, 790], [819]), recommendation: 'cntrl-sources now runs a 2514-point/12-signal transient. Fresh identical-deck reference comparison belongs to a bounded follow-up/nightly #855; no match claimed here.' },
};
const generalBucket = row => bucket(row).startsWith('XSPICE code model:') ? 'XSPICE code-model coverage' : bucket(row);
const ranked = [...new Set(receipt.fixtures.map(generalBucket))].map(name => {
  const rows = receipt.fixtures.filter(row => generalBucket(row) === name);
  assert.ok(routing[name], name);
  return { bucket: name, fixtures: rows.length, historicalNgspiceSuccess: rows.filter(row => row.historical.ngspice.status === 'success').length, ids: rows.map(row => row.id), ...routing[name] };
}).sort((a, b) => b.historicalNgspiceSuccess - a.historicalNgspiceSuccess || b.fixtures - a.fixtures || a.bucket.localeCompare(b.bucket));
const summary = {
  simulatorSha: MAIN_SHA, selected: receipt.fixtures.length,
  historical: { unsupported: receipt.fixtures.filter(row => row.historical.spiceTs.status === 'unsupported').length, ngspiceSuccess: receipt.fixtures.filter(row => row.historical.ngspice.status === 'success').length },
  current: { parse: count(row => row.parse.status), simulation: count(row => row.simulation.status), outcomes: count(row => row.currentOutcome), buckets: count(bucket) },
  freshReferenceRuns: 0, freshMatches: 0, freshMismatches: 0, uncomputedMetrics: 'null in every row',
  elapsedMs: receipt.elapsedMs, issueInventoryCount: issues.length, mergedPrInventoryCount: prs.length,
  ranked,
};
writeFileSync(`${ROOT}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
const clean = text => String(text ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
const readme = `# Current corpus-f historical other-syntax diagnosis (#923)

This is a bounded reconciliation of one frozen historical bucket, not a new aggregate or full corpus run. No production code, fixtures, tolerances, shared manifests, historical outcomes, SOURCES, ROADMAP or CI files are changed.

## Frozen identity and licence

Simulator source SHA: \`${MAIN_SHA}\`. The runner checks that tracked packages/core bytes equal that revision. Build the native dist from those sources before reproducing. Historic outcomes and manifest are loaded with git show at that exact SHA, not from moving main.

Selection: every historical fixture whose gapBucket is \`parse: other unsupported syntax\`, in historical receipt order. All ${summary.selected} fixtures are included, with ${summary.historical.ngspiceSuccess} historical ngspice successes and ${summary.selected - summary.historical.ngspiceSuccess} historical failures/unsupported cases. receipt.json contains all IDs, SHA-256 hashes, unchanged local/source paths, source URLs, per-fixture BSD-3-Clause licences, declared analyses and both historical engine outcomes. Fixture and licence bytes are verified before running.

Source: ${receipt.source.repository}, upstream revision \`${receipt.source.revision}\`. Licence text: [COPYING](${receipt.source.licenseUrl}), locally at \`${receipt.source.licenseTextLocalPath}\`, SHA-256 \`${receipt.source.licenseTextSha256}\`. ${receipt.source.redistributionDecision} No source material is copied or adapted by this reconciliation.

Pinned historical outcomes SHA-256: \`${receipt.outcomesSha256}\`.
Pinned manifest SHA-256: \`${receipt.manifestSha256}\`.
Historical tools: \`${JSON.stringify(receipt.historicalTools)}\`. These are historical receipt labels, not proof of an exact historical simulator commit or current reference run.
Current host: \`${JSON.stringify(receipt.environment)}\`.

## Runtime and comparison policy

One child at a time. Parse cap 8000 ms, native simulation cap 12000 ms, child heap 512 MiB, child output cap 2 MiB, fixed total probe budget 600000 ms. The budget starts after selection/hash verification and excludes time queued in spice-heavy. Every spawned child's timeout is the lesser of its phase cap and remaining total budget; only that child receives SIGKILL. Small spawn/cleanup overhead is not a hard real-time guarantee. If the budget ends, later fixtures receive explicit not-run rows. Results checkpoint after every fixture.

Native parse is core.parse on unchanged bytes. Native simulation runs only after parse succeeds, through the existing packed corpus-f adapter. Parse-only failures do not imply all later failures are known. The native adapter normalizes/truncates simulation error text to its existing 1000-character limit. Full available parse errors and child stderr/exit/signal/timing are preserved in receipt.json.

No ngspice reference was rerun. No fresh match or mismatch is claimed. Current successful simulation is not-compared. Current unsupported/failed native execution is spice-ts-loss (native failure, NOT a fresh ngspice-relative loss); timeout is separate. Historical reference status is separately retained. comparedAnalyses, comparedSignals and worstNormalizedError are null in ALL rows, including the successful fixture. Zero would falsely imply computation. No tolerance changes, per-circuit tuning or synthetic reference data.

## Measured delta

Historical native unsupported: ${summary.historical.unsupported}/${summary.selected}.
Current parse: \`${JSON.stringify(summary.current.parse)}\`.
Current simulation: \`${JSON.stringify(summary.current.simulation)}\`.
Current outcome: \`${JSON.stringify(summary.current.outcomes)}\`.
Current probe wall time: ${(receipt.elapsedMs / 1000).toFixed(3)} s. No timeout or incomplete-budget coverage in this receipt.
Fresh reference runs/matches/mismatches: 0/0/0, not a parity-rate improvement.

The cntrl-sources fixture progressed to native success (2514 transient points, 12 signals). All other fixtures retain native blockers. This is first-error reclassification, not proof that removing one blocker makes a fixture match. Historical reference successes rank potential work only; they are never substituted for fresh comparisons.

## Ranked next general fixes

All-state issue inventory (${issues.length} rows) and merged PR inventory (${prs.length} rows) were retrieved before recommendations, with gh issue list --state all --limit 1000 and gh pr list --state merged --limit 500. Both inventories exhausted below their limits; saved as issues.json and merged-prs.json. Existing issue states and merge SHAs are in summary.json. No new implementation child or GitHub issue is created here; these are recommendations for supervisor routing. The only required child is independent exact-head review. #871 remains parser/preprocessor owner, #919 solver/performance owner, and #855 scheduled aggregate owner.

| Current first-blocker family | Fixtures | Historical ngspice success | Existing evidence and recommendation |
|---|---:|---:|---|
${ranked.map(row => `| ${row.bucket} | ${row.fixtures} | ${row.historicalNgspiceSuccess} | ${row.links.map(link => `[${link.kind === 'issue' ? '#' : 'PR #'}${link.number} (${link.state ?? 'MERGED'})](${link.url})`).join(', ')}. ${row.recommendation} |`).join('\n')}

XSPICE per-model counts and every affected fixture ID are in summary.json/receipt.json. Do not hide d_cosim's external executable dependency under a general syntax fix, or include invalid-input failures in the opportunity denominator.

## Every selected fixture

The first error below is the native parse error, or simulation error after parse succeeds. Full historical and current phase evidence is in receipt.json. All comparison metrics are null.

| Fixture | Historical ngspice | Parse | Simulation | Current outcome | Current first error/bucket |
|---|---|---|---|---|---|
${receipt.fixtures.map(row => `| [${row.sourcePath}](../corpus/corpus-f/fixtures/${row.sourcePath}) | ${row.historical.ngspice.status} | ${row.parse.status} | ${row.simulation.status} | ${row.currentOutcome} | ${clean(row.parse.firstError ?? row.simulation.firstError ?? bucket(row))} |`).join('\n')}

## Reproduce and verify

From the repository root on the frozen revision (or this diagnosis-only branch):

\`pnpm install --frozen-lockfile\`
\`pnpm build && pnpm lint\`
\`spice-heavy node benchmarks/corpus-f-syntax-current/reconcile.mjs\`
\`node benchmarks/corpus-f-syntax-current/summarize.mjs\`
\`node --test benchmarks/corpus-f-syntax-current/reconcile.test.mjs\`
\`node benchmarks/corpus-f-syntax-current/reconcile.mjs --check\`
\`spice-heavy pnpm test\`

The targeted tests are deliberately local to this directory; root test discovery/CI configuration is unchanged. Tests cover complete mechanical selection, duplicate/changed identities, hidden errors, missing/reordered receipts, null metrics, invented parity claims, real child timeout and failed-child transport. RED receipt is red.log, GREEN is green.log. Required exact-head CI remains the full publication gate.

## Poteto activation and scope

Read CHARTER.md first and activated /poteto-mode by reading the installed pstack SKILL.md plus investigation playbook. skill_view returned a directory-read error, so the installed skill files were read directly. Shape was fixed before logic: unchanged SelectionRow plus separate historical reference, parse Probe and simulation Probe. Plan was selection/hash verification, bounded native probing, honest historical-only receipt, offline validator, ranking against all-state issue/merged-PR inventories. The card explicitly requires a diagnosis artifact PR, overriding the generic investigation playbook's no-PR default. No general simulator fix was attempted.
`;
writeFileSync(`${ROOT}/README.md`, readme);
console.log(JSON.stringify({ selected: summary.selected, historical: summary.historical, current: summary.current, ranked: ranked.map(row => ({ bucket: row.bucket, fixtures: row.fixtures, historicalNgspiceSuccess: row.historicalNgspiceSuccess })) }, null, 2));
