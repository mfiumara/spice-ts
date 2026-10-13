"""Reconcile all archived evidence without starting any simulator."""
import hashlib
import json
import math
from pathlib import Path
from controls import ClockSample, clock_error, node_error, CHILD_SECONDS, RUN_SECONDS
from run import plan

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
SIM_KEYS = ('outputSha256', 'deckSha256', 'vectors', 'values', 'actualNodes', 'convergence')
FACTOR_KEYS = ('factorSha256', 'solutionSha256', 'matrixSha256', 'rhsSha256',
               'numericFactorizations', 'pivotReuseFactorizations', 'supernodalUpdates',
               'factorNonzeros', 'initialUCapacity', 'finalUCapacity', 'usedU')


def near(a, b):
    return math.isfinite(a) and math.isfinite(b) and abs(a - b) < 1e-6


def summarize(rows, budget):
    expected = plan()
    assert len(rows) == len(expected), 'plan count'
    assert all({k: r[k] for k in cell} == cell for r, cell in zip(rows, expected)), 'plan order'
    assert len({r['key'] for r in rows}) == 18, 'plan duplicate keys'
    run_start, run_end = ClockSample(**budget['start']), ClockSample(**budget['end'])
    assert near(run_end.continuous - run_start.continuous, budget['actualRunSeconds']), 'budget elapsed'
    stop_seen = False
    disagreements = []
    previous_end = run_start.continuous
    run_error = clock_error(run_start, run_end)
    if run_error:
        disagreements.append(dict(key='run', reason=run_error))
    for row in rows:
        assert row['status'] in ('ok', 'stopped', 'censored'), 'status'
        if row['status'] == 'censored':
            assert budget['stopReason'] and 'pid' not in row and not row['phases'], 'censored ownership'
            stop_seen = True
            assert row['stopReason'] == budget['stopReason'], 'censored reason'
            continue
        assert not stop_seen, 'started after hard stop'
        assert row['processGroupGone'], 'cleanup'
        start, end = ClockSample(**row['start']), ClockSample(**row['end'])
        assert start.continuous >= previous_end and end.continuous >= start.continuous, 'serial elapsed'
        previous_end = end.continuous
        assert near(end.continuous - start.continuous, row['actualElapsedSeconds']), 'child elapsed'
        assert near(end.continuous - run_start.continuous, row['cumulativeActualSeconds']), 'cumulative elapsed'
        assert start.continuous >= run_start.continuous and end.continuous <= run_end.continuous, 'child outside run'
        error = clock_error(start, end)
        phases = row['phases']
        durations = [p[k] for p in phases for k in ('simulateMs', 'factorMs', 'solveMs') if k in p]
        assert all(math.isfinite(v) and v >= 0 for v in durations), 'phase clock'
        assert sum(durations) <= row['actualElapsedSeconds'] * 1000 + 100, 'phase clock outside parent'
        if 'nodeLifetime' in row:
            error = error or node_error(row['actualElapsedSeconds'], row['nodeLifetime'], phases)
        if error:
            disagreements.append(dict(key=row['key'], reason=error))
        if row['status'] == 'ok':
            assert row['exit'] == 0 and not row['stopReason'], 'completed status'
            assert not error and 'nodeLifetime' in row, 'completed clock'
            expected_phases = [('simulate', 'cold'), ('simulate', 'warm')]
            if row['circuit'] == 'resistor-mesh-op':
                expected_phases = [('isolate', 'cold'), ('isolate', 'warm'), *expected_phases]
            assert [(p['mode'], p['phase']) for p in phases] == expected_phases, 'missing/duplicate phases'
        else:
            stop_seen = True
            assert row['stopReason'] == budget['stopReason'], 'hard stop reason'
    started = [r for r in rows if 'pid' in r]
    completed = [r for r in rows if r['status'] == 'ok']
    assert len({r['pid'] for r in started}) == len(started), 'duplicate owned PID'
    assert near(sum(r['actualElapsedSeconds'] for r in started), budget['sumChildActualSeconds']), 'budget sum'
    assert budget['started'] == len(started) and budget['completed'] == len(completed), 'budget counts'
    assert budget['censored'] == len(rows) - len(started) and budget['planned'] == len(rows), 'budget counts'
    assert budget['allStartedProcessGroupsGone'], 'cleanup budget'
    assert budget['deadlineAndBudgetCertified'] == (not budget['stopReason']), 'certification'
    if not budget['stopReason']:
        assert len(completed) == 18 and not clock_error(run_start, run_end), 'certification clocks'
    comparisons = []
    paired_sim = paired_factor = 0
    for baseline, control in zip(rows[::2], rows[1::2]):
        for mode in ('simulate', 'isolate'):
            for phase in ('cold', 'warm'):
                a = next((p for p in baseline['phases'] if (p['mode'], p['phase']) == (mode, phase)), None)
                b = next((p for p in control['phases'] if (p['mode'], p['phase']) == (mode, phase)), None)
                if mode == 'isolate' and baseline['circuit'] != 'resistor-mesh-op':
                    continue
                metric = 'simulateMs' if mode == 'simulate' else 'factorMs'
                pair = dict(circuit=baseline['circuit'], size=baseline['size'], mode=mode, phase=phase,
                            baselineMs=a[metric] if a else None, controlMs=b[metric] if b else None,
                            baselineStatus=baseline['status'], controlStatus=control['status'])
                if a and b:
                    keys = SIM_KEYS if mode == 'simulate' else FACTOR_KEYS
                    assert all(a[k] == b[k] for k in keys), 'invariance ' + str(pair)
                    pair['controlDifferencePercent'] = (b[metric] / a[metric] - 1) * 100
                    pair['invariants'] = {k: a[k] for k in keys}
                    if mode == 'simulate':
                        paired_sim += 1
                    else:
                        paired_factor += 1
                else:
                    pair['controlDifferencePercent'] = None
                    pair['censored'] = True
                comparisons.append(pair)
    observed_bounds = budget['actualRunSeconds'] < RUN_SECONDS and all(r['actualElapsedSeconds'] < CHILD_SECONDS for r in started)
    if budget['deadlineAndBudgetCertified']:
        assert observed_bounds, 'certification bounds'
    parent_intervals = [(run_start, run_end), *[(ClockSample(**r['start']), ClockSample(**r['end'])) for r in started]]
    calibration = dict(
        validatedParentIntervals=len(parent_intervals), validatedNodeLifetimes=sum('nodeLifetime' in r for r in started),
        missingNodeLifetimes=[r['key'] for r in started if 'nodeLifetime' not in r],
        maxParentMonotonicDisagreementMs=max(abs((b.monotonic - a.monotonic) - (b.continuous - a.continuous)) * 1000 for a, b in parent_intervals),
        maxParentRealtimeDisagreementMs=max(abs((b.realtime - a.realtime) - (b.continuous - a.continuous)) * 1000 for a, b in parent_intervals),
        maxNodeRealtimeDisagreementMs=max((abs(r['nodeLifetime']['performanceMs'] - r['nodeLifetime']['realtimeMs']) for r in started if 'nodeLifetime' in r), default=None))
    return dict(planned=len(rows), started=len(started), completed=len(completed), censored=budget['censored'],
                stopReason=budget['stopReason'], actualRunSeconds=budget['actualRunSeconds'],
                maxChildSeconds=max((r['actualElapsedSeconds'] for r in started), default=None),
                clockDisagreements=disagreements, observedBoundsSatisfied=observed_bounds,
                fullCalibrationCompleted=not budget['stopReason'], pairedSimulationPhases=paired_sim,
                pairedFactorPhases=paired_factor, calibration=calibration, comparisons=comparisons)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    for relative, digest in json.loads((OUT / 'receipt-hashes.json').read_text()).items():
        assert sha(OUT / relative) == digest, 'raw receipt integrity ' + relative
    rows = [json.loads(line) for line in (OUT / 'samples.jsonl').read_text().splitlines()]
    budget = json.loads((OUT / 'budget.json').read_text())
    result = summarize(rows, budget)
    manifest = json.loads((OUT / 'build.json').read_text())
    for relative, digest in {**manifest['sourceHashes'], **manifest['immutableInputs']}.items():
        assert sha(ROOT / relative) == digest, 'source/input integrity ' + relative
    # Generated bundles need not exist for an offline checkout. If present,
    # verify them; reproducible prepare.py checks both normalized artifacts.
    for name, digest in manifest['bundles'].items():
        path = OUT / (name + '.mjs')
        if path.exists():
            assert sha(path) == digest, 'bundle integrity'
    ownership = [json.loads(line) for line in (OUT / 'ownership.jsonl').read_text().splitlines()]
    assert ownership == [{k: r[k] for k in ('key', 'pid', 'argv')} for r in rows if 'pid' in r], 'ownership journal'
    for row in rows:
        if 'pid' not in row:
            continue
        phases = []
        for mode in ('isolate', 'simulate'):
            path = OUT / 'logs' / (row['key'] + '.' + mode)
            if path.exists():
                phases.extend(dict(json.loads(line), mode=mode) for line in path.read_text().splitlines())
        assert phases == row['phases'], 'phase journal mismatch'
        if 'nodeLifetime' in row:
            assert json.loads((OUT / 'logs' / (row['key'] + '.lifetime.json')).read_text()) == row['nodeLifetime'], 'lifetime journal mismatch'
    result['baselineRevision'] = manifest['baselineRevision']
    (OUT / 'summary.json').write_text(json.dumps(result, indent=2) + '\n')
    lines = ['One unprofiled unchanged-control pair, milliseconds. Positive difference is a control loss.',
             'circuit size mode phase baseline control difference%']
    for pair in result['comparisons']:
        values = [pair[k] for k in ('circuit', 'size', 'mode', 'phase', 'baselineMs', 'controlMs', 'controlDifferencePercent')]
        lines.append(' '.join(f'{v:.3f}' if isinstance(v, float) else str(v) for v in values))
    lines.append(json.dumps({k: v for k, v in result.items() if k != 'comparisons'}, indent=2))
    (OUT / 'summary.txt').write_text('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
