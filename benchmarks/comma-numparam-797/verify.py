# SPDX-License-Identifier: MIT
"""Offline evidence validation; --parity is intentionally RED until #797 is fixed."""
import hashlib
import json
import math
from pathlib import Path
import sys
from compare import metrics, raw_values

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
TOLERANCE = 1e-6  # fixed for every shared node, not circuit-specific


def verify(report):
    matrix = json.loads((HERE / 'matrix.json').read_text())
    rows = report['rows']
    assert len(rows) == len(matrix) == 20
    assert [r['id'] for r in rows] == [c['id'] for c in matrix]
    manifest = json.loads((ROOT / 'benchmarks/corpus/corpus-h/manifest.json').read_text())
    # Manifest paths are relative to the fixture root.
    fixtures = {f['localPath']: f for f in manifest['circuits']}
    seconds = sum(report['metadata'][k]['seconds'] for k in
                  ['baseline', 'ngspiceVersion', 'nodeVersion', 'pnpmVersion'])
    counts = dict(agree=0, numericalLoss=0, statusDifference=0)
    for row, case in zip(rows, matrix):
        for key in case:
            assert row[key] == case[key]
        digest = hashlib.sha256((ROOT / row['path']).read_bytes()).hexdigest()
        assert digest == row['deckHashBefore'] == row['deckHashAfter']
        if row['id'].startswith('example01'):
            assert digest == fixtures[row['path']]['sha256']
        for engine in ['reference', 'native']:
            child = row[engine]
            assert 0 <= child['seconds'] <= 12.5  # bounded timeout plus kill/drain overhead
            assert not child['timedOut']
            seconds += child['seconds']
        rv, nv = row['referenceValues'], row['nativeValues']
        if rv is None:
            assert row['referenceError'] and row['referenceRaw'] is None
        else:
            assert row['reference']['exit'] == 0
            assert raw_values(row['referenceRaw']) == rv
        payload = json.loads(row['native']['stdout'])
        assert payload['values'] == nv
        if nv is None:
            assert row['nativeError'] and row['native']['exit'] != 0
        else:
            assert row['native']['exit'] == 0
            assert all(math.isfinite(v) for v in nv.values())
        assert row['metrics'] == metrics(rv, nv)
        if (rv is None) != (nv is None):
            counts['statusDifference'] += 1
        elif rv is not None:
            m = row['metrics']
            if m['maxRelative'] is not None and m['maxRelative'] <= TOLERANCE:
                counts['agree'] += 1
            else:
                counts['numericalLoss'] += 1
    assert math.isclose(seconds, report['actualChildSeconds'], abs_tol=1e-9)
    assert seconds <= 300
    assert report['source'] == json.loads((HERE / 'source.json').read_text())
    assert 'ngspice-47' in report['metadata']['ngspiceVersion']['stdout']
    return counts


if __name__ == '__main__':
    counts = verify(json.loads((HERE / 'receipt.json').read_text()))
    print(json.dumps(counts, sort_keys=True))
    if '--parity' in sys.argv:
        assert counts['numericalLoss'] == counts['statusDifference'] == 0, 'RED: #797 parity gaps retained'
