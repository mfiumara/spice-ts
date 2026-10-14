"""Reduce chronological replay receipts to a complete, machine-checkable ledger."""
import gzip
import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / 'node_modules/.cache/aggregate-refresh-855'
DEST = pathlib.Path(__file__).resolve().parent

def projection(fixture):
    return {'key': fixture['key'], 'status': fixture['spiceTs']['status'], 'convergence': fixture['spiceTs']['convergence'], 'analyses': fixture['spiceTs']['analyses'], 'comparisons': fixture['comparisons']}

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def leaves(value, path=''):
    if isinstance(value, dict):
        for key, item in value.items():
            yield from leaves(item, f'{path}/{key}')
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from leaves(item, f'{path}/{index}')
    else:
        yield path, value

schedule = json.loads((CACHE / 'schedule.json').read_text())
raw = (CACHE / 'replay.jsonl').read_bytes()
collected = [json.loads(line) for line in raw.splitlines()]
by_commit = {run['commit']: run for run in collected}
assert len(by_commit) == len(collected), 'duplicate replay commit'
assert set(by_commit) == {entry['commit'] for entry in schedule}, 'incomplete replay'
runs = [by_commit[entry['commit']] for entry in schedule]
current = json.loads((ROOT / 'benchmarks/aggregate-report.json').read_text())
previous = json.loads(subprocess.check_output(['git', 'show', 'd3901ec1:benchmarks/aggregate-report.json'], cwd=ROOT))
current_rows = [projection(f) for f in current['fixtures']]
assert runs[-1]['rows'] == current_rows, 'replay endpoint differs from the actual generated report'
old_rows = [projection(f) for f in previous['fixtures']]
# Compare the stored #603 artifact with the replay of the exact core tree it
# actually measured (e58322e, before concurrent #623/#616 merges).
harness_drift = []
measured_baseline = next(run for run, entry in zip(runs, schedule) if '(#584)' in entry['subject'])
for old, new in zip(old_rows, measured_baseline['rows']):
    if old != new:
        harness_drift.append({'fixture': old['key'], 'beforeSha256': digest(old), 'afterSha256': digest(new), 'changes': [{'path': path, 'before': dict(leaves(old)).get(path), 'after': dict(leaves(new)).get(path)} for path in sorted(set(dict(leaves(old))) | set(dict(leaves(new)))) if dict(leaves(old)).get(path) != dict(leaves(new)).get(path)]})
transitions = []
by_fixture = {}
for before, after, entry in zip(runs, runs[1:], schedule[1:]):
    pr = re.findall(r'\(#(\d+)\)', entry['subject'])[-1]
    for old, new in zip(before['rows'], after['rows']):
        if old == new:
            continue
        left, right = dict(leaves(old)), dict(leaves(new))
        changes = [{'path': path, 'before': left.get(path), 'after': right.get(path)} for path in sorted(set(left) | set(right)) if left.get(path) != right.get(path)]
        row = {'commit': entry['commit'], 'pullRequest': int(pr), 'subject': entry['subject'], 'fixture': old['key'], 'beforeSha256': digest(old), 'afterSha256': digest(new), 'changes': changes}
        transitions.append(row)
        by_fixture.setdefault(old['key'], []).append(int(pr))
final_changes = []
for old, new in zip(old_rows, current_rows):
    if old != new:
        assert old['key'] in by_fixture or any(r['fixture'] == old['key'] for r in harness_drift)
        final_changes.append({'fixture': old['key'], 'pullRequests': list(dict.fromkeys(by_fixture.get(old['key'], []))), 'beforeSha256': digest(old), 'afterSha256': digest(new)})
ledger = {'base': schedule[0]['commit'], 'head': schedule[-1]['commit'], 'schedule': schedule, 'harnessDrift': harness_drift, 'transitions': transitions, 'finalChanges': final_changes}
with gzip.open(DEST / 'ledger.json.gz', 'wt') as file:
    json.dump(ledger, file, separators=(',', ':'))
(DEST / 'summary.json').write_text(json.dumps({key: value for key, value in ledger.items() if key not in ['transitions', 'harnessDrift']}, indent=2) + '\n')
with gzip.open(DEST / 'replay.jsonl.gz', 'wb') as file:
    file.write(raw)
metric_lines = [
    f'Nightly #855 on {schedule[-1]["commit"]}: chronological replay of {len(runs)} distinct production-core revisions from #613, 100 unchanged fixtures at each revision. Complete per-field before/after attribution, including primary and linear metrics, grids, signal lists and rounding-only differences, is in benchmarks/aggregate-refresh-855/ledger.json.gz; raw receipts are in replay.jsonl.gz. The last committed #603 artifact measured e58322e before concurrent #623/#616 merges; those merges are included here rather than silently folded into a stale baseline.',
    'The #592 fine-reference column (PR #851) is diagnostic and changes no status/envelope. PR #853 changes sample storage, not reference numbers. Historical entries below retain their original #325-era baseline; this refresh compares with the last committed #603 artifact.',
    f'Headline: spice-ts {previous["totals"]["spiceTs"]} to {current["totals"]["spiceTs"]}; compared fixtures {previous["totals"]["comparedFixtures"]} to {current["totals"]["comparedFixtures"]}, analyses {previous["totals"]["comparedAnalyses"]} to {current["totals"]["comparedAnalyses"]}. ngspice outcomes are unchanged. No matched/mismatch status or parity pass is inferred from engine success.',
    f'Envelope before/after: {previous["matchedPointEnvelope"]} to {current["matchedPointEnvelope"]}. The relative RMS envelope loss is published without changing tolerances. Runtime sums are loaded-host single samples and support no speed claim.',
]
changed_commits = {row['commit'] for row in transitions}
neutral = [entry['subject'] for entry in schedule[1:] if entry['commit'] not in changed_commits]
metric_lines.append('Replayed outcome-neutral production revisions: ' + '; '.join(neutral) + '.')
for entry in schedule[1:]:
    affected = [row for row in transitions if row['commit'] == entry['commit']]
    if not affected:
        continue
    gains = losses = 0
    for row in affected:
        for change in row['changes']:
            if re.search(r'/(absoluteError|relativeError)/(max|rms)$', change['path']) and isinstance(change['before'], (int, float)) and isinstance(change['after'], (int, float)):
                gains += change['after'] < change['before']
                losses += change['after'] > change['before']
    metric_lines.append(f'{entry["subject"]}, main {entry["commit"]}: changes ' + ', '.join(row['fixture'] for row in affected) + f'. Across primary and retained linear max/RMS error cells: {gains} decreases, {losses} increases; all {sum(len(row["changes"]) for row in affected)} changed scalar fields are attributed verbatim in the ledger, including status/grid/signal changes. Decreases and increases are descriptive, not a tolerance-based pass/fail.')
statuses = []
for old, new, fixture in zip(old_rows, current_rows, current['fixtures']):
    if old['status'] == new['status']:
        continue
    events = [row for row in transitions if row['fixture'] == old['key'] and any(change['path'] == '/status' for change in row['changes'])]
    assert events
    explanation = '; '.join(f'PR #{row["pullRequest"]} ({row["commit"][:8]})' for row in events)
    statuses.append({'engine': 'spiceTs', 'fixture': old['key'], 'from': old['status'], 'to': new['status'], 'explanation': f'Chronological unchanged-input replay attributes status changes to {explanation}. Full receipts and all subsequent metric changes are in the #855 ledger. Engine success is not a parity assertion.', 'gapIssues': fixture['gapIssues']})
(DEST / 'transitions.ts').write_text('// Generated by summarize.py from real chronological replay receipts.\nexport const REFRESH_STATUS_TRANSITIONS = ' + json.dumps(statuses, indent=2) + ' as const;\n\nexport const REFRESH_METRIC_TRANSITIONS: string[] = ' + json.dumps(metric_lines, indent=2) + ';\n')
print(json.dumps({'runs': len(runs), 'transitions': len(transitions), 'finalChangedFixtures': len(final_changes), 'harnessDrift': len(harness_drift), 'prs': sorted(set(r['pullRequest'] for r in transitions))}, indent=2))
