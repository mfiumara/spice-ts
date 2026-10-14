"""Summarize diagnostic coverage and compare every previously paired metric."""
import collections
import hashlib
import json
import pathlib

root = pathlib.Path('benchmarks/dot-analysis-1009')
rows = json.loads((root / 'raw/aggregate-delta.json').read_text())['rows']
assert len(rows) == 100
assert len({row['key'] for row in rows}) == 100
counts = {}
for side in ['before', 'after']:
    counts[side] = {
        'matched': sum(row[side]['matched'] for row in rows),
        'notMatched': sum(not row[side]['matched'] for row in rows),
        'paired': sum(row[side]['plotsPaired'] for row in rows),
        'unmatched': sum(row[side]['plotsUnmatched'] for row in rows),
        'engineStatus': dict(collections.Counter(row[side]['engineStatus'] for row in rows)),
        'referenceStatus': dict(collections.Counter(row[side]['referenceStatus'] for row in rows)),
    }
regressions = []
previously_paired = 0
for row in rows:
    queues = collections.defaultdict(list)
    for comparison in row['afterComparisons']:
        plot_id = comparison.get('plot', {}).get('spiceTs', '')
        if comparison.get('unmatched') or (plot_id.startswith('dot:') and not plot_id.endswith(':1')):
            continue
        queues[comparison['analysis']].append(comparison)
    for comparison in row['beforeComparisons']:
        if comparison.get('unmatched'):
            continue
        previously_paired += 1
        target = queues[comparison['analysis']].pop(0) if queues[comparison['analysis']] else None
        def numeric(c):
            return {key: value for key, value in c.items() if key != 'plot'}
        if target is None or numeric(comparison) != numeric(target):
            regressions.append({'key': row['key'], 'analysis': comparison['analysis']})
summary = {
    'fixtures': len(rows), 'counts': counts,
    'previouslyPairedComparisons': previously_paired,
    'previouslyPairedNumericDifferences': regressions,
    'matchedToNotMatched': [row['key'] for row in rows if row['before']['matched'] and not row['after']['matched']],
    'notMatchedToMatched': [row['key'] for row in rows if not row['before']['matched'] and row['after']['matched']],
    'newlyExposedUnpairable': [{'key': row['key'], 'referenceStatus': row['after']['referenceStatus'], 'before': row['before']['plotsUnmatched'], 'after': row['after']['plotsUnmatched']} for row in rows if row['after']['plotsUnmatched'] > row['before']['plotsUnmatched']],
    'rawSha256': hashlib.sha256((root / 'raw/aggregate-delta.json').read_bytes()).hexdigest(),
    'canonicalCheck': {'beforeExit': 1, 'afterExit': 1, 'reason': 'inherited stale provenance pins; no canonical aggregate refresh'},
    'method': 'Diagnostic only. Manifest input hashes validated, historical report pin rejection bypassed only in ignored snapshot. Baseline last-per-type view reconstructed from the same retained native results. Uniform existing normalizer and threshold unchanged.',
}
(root / 'aggregate-delta.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
assert not regressions
assert not summary['matchedToNotMatched']
