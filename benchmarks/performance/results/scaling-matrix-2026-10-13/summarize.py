"""Offline receipt reconciliation and sampled self-time attribution. No children."""
from pathlib import Path
import bisect
import gzip
import hashlib
import json
import math
import re
from matrix import OUT, top_cell, clock_error, node_error
from controls import ClockSample


def metric(text, label):
    match = re.search(re.escape(label) + r'\s*=\s*([\d.eE+-]+)', text)
    return float(match[1]) if match else None


def accuracy(actual, reference):
    grid, values = reference
    if not grid:
        return dict(status='no-reference')
    differences = []
    for t, value in zip(actual['grid'], actual['values']):
        index = bisect.bisect_left(grid, t)
        if index < len(grid) and abs(grid[index] - t) <= max(1e-24, abs(t) * 1e-5):
            expected = values[index]
        elif index > 0 and abs(grid[index-1] - t) <= max(1e-24, abs(t) * 1e-5):
            expected = values[index-1]
        elif 0 < index < len(grid):
            fraction = (t - grid[index-1]) / (grid[index] - grid[index-1])
            expected = values[index-1] + fraction * (values[index] - values[index-1])
        else:
            continue
        differences.append(value - expected)
    if not differences:
        return dict(status='no-overlap')
    peak = max(map(abs, values))
    max_abs = max(map(abs, differences))
    rms = math.sqrt(sum(d*d for d in differences) / len(differences))
    return dict(status='compared', points=len(differences), maxAbs=max_abs, rmsAbs=rms,
                maxPeakRelative=max_abs/peak if peak else None, rmsPeakRelative=rms/peak if peak else None)


def profile_summary(path):
    profile = json.loads(gzip.decompress(path.read_bytes()))
    nodes = {n['id']: n for n in profile['nodes']}
    patterns = [
        ('device load/stamping', r'^(batchStamp|stamp|mos1BulkJunctions|mos1Channel|bulkJunction|pnjlim|recordMos1Load|evaluateBulkJunctions|evaluateChannel|stampStaticDevices|stampDynamicDevices|buildCompanionSystem|stampG|stampB|stampC|clear|applyNodeHolds|stampPrevB|stampTransientCharge|evaluateCharges|meyerHalfCapacitances)$'),
        ('factor/order', r'^(factorize|refactorWithPivots|analyzePattern|amdOrdering|sortInt32Prefix|matchesFactoredInput|recordFactoredInput|applySupernode|lockTopology|getCscMatrix|.*[Ss]upernode.*)$'),
        ('solve', r'^solve$'),
        ('timestep/Newton control', r'^(limitNewtonStep|batchNewtonStepScale|mos1NewtonStepScale|gateStepScale|fetlim|applyDeviceStepLimits|convergenceTest|limitedLastStamp|isConverged|isRoundingFloorCycle|stepLimitersFor|transient|solveTransient|solveNewtonRaphson|newtonRaphson|computeLTE|estimateLTE)$'),
        ('parse/compile', r'^(parseAsync|parseNetlist|tokenizeLine|tokenizeNetlist|compile|collectStatements|parseDevice|preprocessSteps|extractControlBlocks|resolveNode|addCanonical)$'),
        ('GC', r'^\(garbage collector\)$'),
    ]
    totals = {key: 0 for key, _ in patterns}; frames = {}
    for index, node_id in enumerate(profile['samples']):
        name = nodes[node_id]['callFrame']['functionName'] or '(anonymous)'
        us = profile['timeDeltas'][index]
        category = next((key for key, pattern in patterns if re.search(pattern, name)), 'other/runtime')
        totals[category] = totals.get(category, 0) + us
        frames[name] = frames.get(name, 0) + us
    total = sum(totals.values())
    return dict(sampledMs=total/1000, categories={k: dict(ms=v/1000, percent=100*v/total) for k,v in totals.items()},
                topFrames=[dict(name=k, ms=v/1000, percent=100*v/total) for k,v in sorted(frames.items(), key=lambda item: -item[1])[:25]])


def summarize():
    rows = [json.loads(line) for line in (OUT / 'samples.jsonl').read_text().splitlines()]
    matrix = [r for r in rows if not r.get('attributionOnly')]
    assert len(matrix) == 18
    assert len({(r['circuit'], r['size'], r['engine']) for r in matrix}) == 18
    manifest = json.loads((OUT / 'decks.json').read_text())
    for deck in manifest:
        assert hashlib.sha256((OUT / deck['file']).read_bytes()).hexdigest() == deck['deckSha256']
    for row in matrix:
        deck = next(d for d in manifest if (d['circuit'], d['size']) == (row['circuit'], row['size']))
        assert row['deckSha256'] == deck['deckSha256']
    budget = json.loads((OUT / 'budget.json').read_text())
    assert clock_error(ClockSample(**budget['start']), ClockSample(**budget['end'])) is None
    assert budget['actualRunSeconds'] < 900
    assert abs(budget['end']['continuous'] - budget['start']['continuous'] - budget['actualRunSeconds']) < 1e-9
    assert budget['matrixStarted'] == sum('pid' in r for r in matrix)
    assert budget['matrixCompleted'] == sum(r['status'] == 'ok' for r in matrix)
    assert budget['selected'] == list(top_cell(matrix))
    pairs = {}
    for row in rows:
        if 'pid' not in row:
            continue
        assert row['processGroupGone']
        assert row['wallMs'] < 120000
        start, end = ClockSample(**row['start']), ClockSample(**row['end'])
        assert budget['start']['continuous'] <= start.continuous <= end.continuous <= budget['end']['continuous']
        assert clock_error(start, end) is None
        assert abs((end.continuous-start.continuous)*1000-row['wallMs']) < 1e-6
        assert len(row['loadBefore']) == len(row['loadAfter']) == 3
        for stream in ('stdout', 'stderr'):
            data = gzip.decompress((OUT / 'logs' / (row['key'] + '.' + stream + '.txt.gz')).read_bytes())
            assert hashlib.sha256(data).hexdigest() == row[stream + 'Sha256']
        if row.get('attributionOnly'):
            if row['status'] == 'ok':
                assert row['result'] == json.loads((OUT / 'logs' / (row['key'] + '.result.json')).read_text())
                assert node_error(row['wallMs']/1000, row['result']['lifetime'], [{'simulateMs': row['result']['parseMs']+row['result']['simulateMs']}]) is None
            continue
        pairs.setdefault((row['circuit'], row['size']), {})[row['engine']] = row
        if row['engine'] == 'spice-ts' and row['status'] == 'ok':
            result = row['result']
            assert result == json.loads((OUT / 'logs' / (row['key'] + '.result.json')).read_text())
            assert result['deckSha256'] == row['deckSha256']
            assert node_error(row['wallMs']/1000, result['lifetime'], [{'simulateMs': result['parseMs']+result['simulateMs']}]) is None
        if row['engine'] == 'ngspice':
            text = gzip.decompress((OUT / 'logs' / (row['key'] + '.stdout.txt.gz')).read_bytes()).decode()
            assert 'Using KLU as Direct Linear Solver' in text
            row['acct'] = {label: metric(text, label) for label in ['Netlist loading time', 'Netlist parsing time', 'Total analysis time (seconds)', 'Matrix load time', 'Matrix factor time', 'Matrix solve time', 'Matrix reorder time', 'Transient iterations', 'Accepted timepoints', 'Rejected timepoints', 'Total iterations']}
            if row['status'] == 'ok':
                assert row['exit'] == 0 and row['acct']['Total analysis time (seconds)'] is not None
                if row['circuit'].endswith('tran'):
                    wave = [(float(t), float(v)) for t,v in re.findall(r'^\d+\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s*$', text, re.M)]
                    row['reference'] = ([t for t,v in wave], [v for t,v in wave])
                else:
                    value = re.search(r'^\s*' + re.escape(row['probe']) + r'\s+([-+\d.eE]+)\s*$', text, re.M | re.I)
                    assert value
                    row['reference'] = ([0], [float(value[1])])
    cells = []
    for key, pair in pairs.items():
        spice, ng = pair['spice-ts'], pair['ngspice']
        cell = dict(circuit=key[0], size=key[1], actualNodes=spice['actualNodes'], deckSha256=spice['deckSha256'],
                    spiceMs=spice['wallMs'], ngspiceMs=ng['wallMs'], spiceStatus=spice['status'], ngspiceStatus=ng['status'],
                    ratio=spice['wallMs']/ng['wallMs'] if spice['status'] == ng['status'] == 'ok' else None,
                    ngspiceAcct=ng.get('acct'))
        if spice['status'] == 'ok':
            cell.update(parseMs=spice['result']['parseMs'], simulateMs=spice['result']['simulateMs'], convergence=spice['result'].get('convergence'), outputSha256=spice['result']['outputSha256'])
        if spice['status'] == ng['status'] == 'ok':
            cell['probeErrors'] = accuracy(spice['result'], ng['reference'])
        cells.append(cell)
    profile = next((r for r in rows if r.get('attributionOnly')), None)
    attribution = None
    if profile and profile['status'] == 'ok':
        baseline = next(r for r in matrix if r['circuit'] == profile['circuit'] and r['size'] == profile['size'] and r['engine'] == 'spice-ts')
        assert profile['result']['outputSha256'] == baseline['result']['outputSha256']
        attribution = dict(circuit=profile['circuit'], size=profile['size'], wallMs=profile['wallMs'],
                           hashMatchesBaseline=True, result=profile['result'], **profile_summary(OUT / 'logs' / (profile['key'] + '.cpuprofile.gz')))
    return dict(cells=cells, selected=top_cell(matrix), attribution=attribution, budget=budget)

if __name__ == '__main__':
    summary = summarize()
    (OUT / 'summary.json').write_text(json.dumps(summary, indent=2, allow_nan=False) + '\n')
    for cell in summary['cells']:
        print(cell['circuit'], cell['size'], round(cell['spiceMs'], 3), round(cell['ngspiceMs'], 3), cell['ratio'], cell['spiceStatus'], cell['ngspiceStatus'], cell.get('probeErrors'))
    print(json.dumps(summary['attribution'], indent=2))
