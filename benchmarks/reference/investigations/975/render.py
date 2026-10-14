"""Render the investigation tables from saved native receipts, offline."""
import json
import math
from pathlib import Path

root = Path('benchmarks/reference/investigations/975')
ac = json.loads((root / 'ac.json').read_text())
adm = json.loads((root / 'admittance.json').read_text())['table']
metrics = {}
for name, row in ac.items():
    if name == 'hashes':
        continue
    metrics[name] = {}
    for pair, a, b in [('ts-ng', 'ts', 'ng'), ('ng-xy', 'ng', 'xy'), ('ts-xy', 'ts', 'xy')]:
        if not row[a] or not row[b]:
            continue
        metrics[name][pair] = {}
        for signal in ['v(8)', 'v(9)', 'v(14)', 'v(15)', 'v(10)', 'v(11)']:
            aa, bb = row[a]['series'], row[b]['series']
            assert len(aa['grid']) == len(bb['grid']) == 101
            assert all(abs(x-y) < 1e-12 * max(abs(x), abs(y)) for x, y in zip(aa['grid'], bb['grid']))
            errors = [math.hypot(x['re']-y['re'], x['im']-y['im']) for x, y in zip(aa['signals'][signal], bb['signals'][signal])]
            magnitudes = {engine: [math.hypot(v['re'], v['im']) for v in row[engine]['series']['signals'][signal]] for engine in [a, b]}
            metrics[name][pair][signal] = {'ordinal101': {'max': max(errors), 'rms': math.sqrt(sum(e*e for e in errors)/101)}, 'sharedHarness100': row['metrics'][pair]['signals'][signal], 'magnitudeRange': {engine: {'min': min(v), 'max': max(v)} for engine, v in magnitudes.items()}}
constants = {'ng': {'k': 1.38064852e-23, 'q': 1.6021766208e-19}, 'xy': {'k': 1.3806226e-23, 'q': 1.6021918e-19}}
analytic = []
for row in adm:
    if row['engine'] not in ['matched-ng', 'matched-xy']:
        continue
    constants_row = constants[row['engine'][-2:]]
    vt = constants_row['k'] / constants_row['q'] * 300.15
    be, bc = row['vbe'], row['vbe']-row['vce']
    ic = 1e-16 * (math.exp(be/vt)-1) * (1-bc/50)
    gm = ic * (1/vt-1/(50-bc))
    analytic.append({'q': row['q'], 'engine': row['engine'], 'vt': vt, 'gmClosedForm': gm, 'gmNativeAdmittance': row['gm'], 'relativeDifference': abs(gm-row['gm'])/abs(gm)})
matched = {}
for field in ['gm', 'gpi', 'go', 'Cpi', 'Cmu']:
    matched[field] = {}
    for engine in ['matched-ts', 'matched-xy']:
        differences = []
        for index in range(1, 12):
            rows = {r['engine']: r for r in adm if r['q'] == f'q{index}'}
            ref = rows['matched-ng'][field]
            differences.append(abs(rows[engine][field]-ref)/abs(ref))
        matched[field][engine] = max(differences)
summary = {'classification': 'comparison-pipeline artefact: native reference parse discrepancy (bare model assignment); residual reference-model constants difference. No established current spice-ts defect.', 'ac': metrics, 'matchedIntrinsicMaxRelative': matched, 'constants': constants, 'analytic': analytic, 'op': [r for r in adm if not r['engine'].startswith('matched')]}
(root / 'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
lines = ['# Generated evidence tables', '', 'Units: Ic A, Vbe/Vce V, gm/gpi/go S, Cpi/Cmu F. Xyce conductances/caps are native terminal-admittance extractions; see README, not a claimed internal-variable dump.', '', '| BJT | Engine | Ic | Vbe | Vce | gm | gpi | go | Cpi | Cmu |', '|---|---|---|---|---|---|---|---|---|---|']
for row in summary['op']:
    lines.append('| '+row['q']+' | '+row['engine']+' | '+' | '.join(f'{row[k]:.10g}' for k in ['ic', 'vbe', 'vce', 'gm', 'gpi', 'go', 'Cpi', 'Cmu'])+' |')
lines += ['', '## Baseline AC (existing shared harness, 100 aligned points)', '', '| Pair | Node | Max abs V | RMS abs V | Max relative | Zero denominators excluded |', '|---|---|---|---|---|---|']
for pair, rows in metrics['baseline'].items():
    for signal, receipt in rows.items():
        m = receipt['sharedHarness100']
        lines.append(f'| {pair} | {signal} | {m["absoluteError"]["max"]:.12g} | {m["absoluteError"]["rms"]:.12g} | {m["relativeError"]["max"]:.12g} | {m["relativeError"]["excludedZeroReferences"]} |')
lines += ['', '## Matched intrinsic OP and vaf=50', '', '| Quantity | Max relative ts/ng | Max relative xy/ng |', '|---|---|---|']
for field, values in matched.items():
    lines.append(f'| {field} | {values["matched-ts"]:.12g} | {values["matched-xy"]:.12g} |')
(root / 'TABLES.md').write_text('\n'.join(lines)+'\n')
print('Rendered 33 OP rows, all six baseline signals and matched intrinsic comparisons.')
print('Largest analytic gm relative discrepancy:', max(r['relativeDifference'] for r in analytic))
