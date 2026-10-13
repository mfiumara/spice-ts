"""Validate the fixed receipt matrix and retain all measurements, including outliers.

Input: child records with phase records. Output: cells, paired digests, line ticks,
clock disagreements. Runtime ratios are controls, never optimization speedups.
"""
from collections import Counter
from pathlib import Path
import gzip
import hashlib
import json
import math
import statistics
from typing import Any

OUT = Path(__file__).resolve().parent

def stats(values) -> dict[str, Any]:
    assert all(math.isfinite(v) and v >= 0 for v in values)
    return dict(n=len(values), median=statistics.median(values), min=min(values), max=max(values)) if values else dict(n=0, median=None, min=None, max=None)

def key(row):
    return (row['mode'], row['circuit'], row['size'], row['repeat'], row['variant'])

def summarize(rows) -> dict[str, Any]:
    expected = {(mode, circuit, size, repeat, variant)
        for mode, circuits, variants in [('isolate', ['resistor-mesh-op'], ['baseline', 'sampled']),
            ('simulate', ['rc-ladder-tran', 'resistor-mesh-op', 'cmos-inverter-chain-tran'], ['baseline', 'control'])]
        for circuit in circuits for size in [1000, 10000, 50000]
        for repeat in range(3) for variant in variants}
    assert len(rows) == len(expected) == 72
    assert {key(r) for r in rows} == expected
    indexed = {key(r): r for r in rows}
    disagreements, cells = [], []
    pairs = Counter()
    for row in rows:
        assert row['status'] in ['ok', 'timeout', 'failed', 'budget-skipped']
        assert row['processGroupGone']
        assert row['exit'] == (0 if row['status'] == 'ok' else -9)
        assert len({p['phase'] for p in row['phases']}) == len(row['phases'])
        stats([row['childWallMs']])
        phase_ms = sum(p.get('factorMs', p.get('simulateMs', 0)) for p in row['phases'])
        if phase_ms > row['childWallMs'] + 1:
            disagreements.append(dict(key=key(row), childWallMs=row['childWallMs'], completedPhaseMs=phase_ms))
        if row['variant'] != 'baseline':
            baseline = indexed[(*key(row)[:4], 'baseline')]
            for phase in row['phases']:
                other = next((p for p in baseline['phases'] if p['phase'] == phase['phase']), None)
                if other is None:
                    continue
                fields = ['factorSha256', 'solutionSha256', 'matrixSha256', 'rhsSha256', 'numericFactorizations', 'pivotReuseFactorizations', 'supernodalUpdates', 'factorNonzeros', 'initialUCapacity', 'finalUCapacity', 'usedU'] if row['mode'] == 'isolate' else ['outputSha256', 'deckSha256', 'vectors', 'values', 'actualNodes', 'convergence']
                for field in fields:
                    assert phase[field] == other[field], (key(row), phase['phase'], field)
                pairs[row['mode']] += 1
    cell_keys = sorted({(r['mode'], r['circuit'], r['size'], r['variant'], phase) for r in rows for phase in ['cold', 'warm']})
    for mode, circuit, size, variant, phase in cell_keys:
        children = [r for r in rows if (r['mode'], r['circuit'], r['size'], r['variant']) == (mode, circuit, size, variant)]
        phases = [p for r in children for p in r['phases'] if p['phase'] == phase]
        cell: dict[str, Any] = dict(mode=mode, circuit=circuit, size=size, variant=variant, phase=phase,
            missingPhases=len(children)-len(phases),
            wallMs=stats([p.get('factorMs', p.get('simulateMs')) for p in phases]),
            peakRssMiB=stats([p['endMemory']['peakRssMiB'] for p in phases]))
        if mode == 'isolate':
            cell['factorCpuMs'] = stats([(p['factorCpu']['user'] + p['factorCpu']['system']) / 1000 for p in phases])
        if variant == 'sampled':
            cell['applySelfSamples'] = [p['sampling']['applySelfSamples'] for p in phases]
            cell['regionTicks'] = dict(sum((Counter(p['sampling']['regions']) for p in phases), Counter()))
            cell['positionTicks'] = [p['sampling']['positionTicks'] for p in phases]
        cells.append(cell)
    comparisons = []
    for cell in cells:
        if cell['variant'] == 'baseline':
            other = next(c for c in cells if c['mode'] == cell['mode'] and c['circuit'] == cell['circuit'] and c['size'] == cell['size'] and c['phase'] == cell['phase'] and c['variant'] != 'baseline')
            comparisons.append(dict(mode=cell['mode'], circuit=cell['circuit'], size=cell['size'], phase=cell['phase'],
                medianRatio=other['wallMs']['median']/cell['wallMs']['median'],
                percentDifference=100*(other['wallMs']['median']/cell['wallMs']['median']-1)))
    return dict(children=len(rows), statuses=dict(Counter(r['status'] for r in rows)),
        chargedMonotonicChildWallSeconds=sum(r['childWallMs'] for r in rows)/1000,
        completedPhaseWallSeconds=sum(p.get('factorMs', p.get('simulateMs', 0)) for r in rows for p in r['phases'])/1000,
        deadlineAndBudgetCertified=False, clockDisagreements=disagreements,
        pairedIsolationPhases=pairs['isolate'], pairedSimulationPhases=pairs['simulate'], cells=cells, comparisons=comparisons)

def main():
    rows = [json.loads(line) for line in (OUT / 'samples.jsonl').read_text().splitlines()]
    result = summarize(rows)
    budget = json.loads((OUT / 'budget.json').read_text())
    assert abs(result['chargedMonotonicChildWallSeconds']-budget['totalChildWallSeconds']) < 1e-9
    assert budget['allStartedProcessGroupsGone']
    build = json.loads((OUT / 'build.json').read_text())
    for relative, digest in build['sourceHashes'].items():
        assert hashlib.sha256((OUT.parents[3] / relative).read_bytes()).hexdigest() == digest
    profile_checks = 0
    for row in rows:
        name = '-'.join(map(str, key(row)))
        raw = [json.loads(line) for line in (OUT / 'logs' / (name + '.jsonl')).read_text().splitlines()]
        assert raw == row['phases']
        for phase in row['phases']:
            sampling = phase.get('sampling')
            if not sampling:
                continue
            profile = json.loads(gzip.decompress((OUT / 'logs' / sampling['profilePath']).read_bytes()))
            nodes = [n for n in profile['nodes'] if n['callFrame']['functionName'] == 'applySupernode' and n['callFrame']['url'].endswith('/issue-938/baseline.mjs')]
            ticks = [t for n in nodes for t in n.get('positionTicks', [])]
            assert ticks == sampling['positionTicks']
            assert sum(n.get('hitCount', 0) for n in nodes) == sampling['applySelfSamples']
            assert len(profile.get('samples', [])) == sampling['totalSamples']
            assert {r['name']: sum(t['ticks'] for t in ticks if r['firstLine'] <= t['line'] <= r['lastLine']) for r in build['ranges']} == sampling['regions']
            profile_checks += 1
    result['verifiedRawProfiles'] = profile_checks
    (OUT / 'summary.json').write_text(json.dumps(result, indent=2) + '\n')
    lines = ['All raw values retained. Clock disagreement prevents a certified elapsed-wall budget or speedup.',
        json.dumps({k:v for k,v in result.items() if k not in ['cells','comparisons','clockDisagreements']}, indent=2)]
    for c in result['cells']:
        lines.append(' '.join(str(c[k]) for k in ['mode','circuit','size','variant','phase']) + ' wallMs=' + str(c['wallMs']) + ' peakRssMiB=' + str(c['peakRssMiB']) + (' ticks=' + str(c['regionTicks']) if 'regionTicks' in c else ''))
    (OUT / 'summary.txt').write_text('\n'.join(lines) + '\n')
    print('\n'.join(lines))

if __name__ == '__main__':
    main()
