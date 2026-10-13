"""Summaries retain every status; timings use successful cells only."""
import collections
import json
from pathlib import Path
import statistics

out = Path(__file__).resolve().parent
rows = [json.loads(line) for line in (out / 'samples.jsonl').read_text().splitlines()]
assert len(rows) == 108
budget = json.loads((out / 'budget.json').read_text())
assert sum(r['childWallMs'] for r in rows) / 1000 <= 900
assert all(r.get('processGroupGone') for r in rows if r['status'] != 'budget-skipped')
groups = collections.defaultdict(list)
pairs = collections.defaultdict(dict)
for row in rows:
    groups[(row['circuit'], row['size'], row['mode'], row['variant'])].append(row)
    pairs[(row['circuit'], row['size'], row['mode'], row['repeat'])][row['variant']] = row
identity = []
for key, pair in pairs.items():
    b, c = pair['baseline'], pair['candidate']
    assert b['deckSha256'] == c['deckSha256']
    ok = b['status'] == c['status'] == 'ok'
    same = ok and all(b[k] == c[k] for k in ['outputSha256', 'vectors', 'values', 'convergence'])
    identity.append({'key': key, 'statuses': [b['status'], c['status']], 'bitIdentical': same if ok else None})
    if ok: assert same, key
summary = []
for key, samples in groups.items():
    good = [s for s in samples if s['status'] == 'ok']
    item = {'circuit': key[0], 'size': key[1], 'mode': key[2], 'variant': key[3], 'statuses': dict(collections.Counter(s['status'] for s in samples))}
    for metric in ['simulateMs','childWallMs','peakRssMiB','warmupMs','importMs']:
        values = [s[metric] for s in good]
        item[metric] = {'median': statistics.median(values), 'min': min(values), 'max': max(values)} if values else None
    summary.append(item)
report = {'cells': len(rows), 'statuses': dict(collections.Counter(r['status'] for r in rows)), 'completedPairs': sum(i['bitIdentical'] is not None for i in identity), 'identity': identity, 'budget': budget, 'summary': summary}
(out / 'summary.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: v for k,v in report.items() if k not in ['summary','identity']}, indent=2))
for circuit in ['rc-ladder-tran','resistor-mesh-op','cmos-inverter-chain-tran']:
    for size in [1000,10000,50000]:
        for mode in ['cold','warm']:
            b, c = [next(s for s in summary if (s['circuit'],s['size'],s['mode'],s['variant']) == (circuit,size,mode,variant)) for variant in ['baseline','candidate']]
            def fmt(s):
                m = s['simulateMs']; r = s['peakRssMiB']; w = s['childWallMs']
                return str(s['statuses']) if not m else f"{m['median']:.2f} [{m['min']:.2f},{m['max']:.2f}]ms; wall {w['median']:.2f}ms; RSS {r['median']:.1f} [{r['min']:.1f},{r['max']:.1f}]MiB {s['statuses']}"
            print(f'{circuit} {size} {mode}\n  B {fmt(b)}\n  C {fmt(c)}')
