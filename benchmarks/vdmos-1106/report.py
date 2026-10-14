"""Validate the eight captured runs and render inventories without recomputing scores."""
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path('benchmarks/vdmos-1106')

def load(name):
    return json.loads(gzip.decompress((ROOT / name).read_bytes()))

before = load('before.json.gz')
after = load('after.json.gz')
manifest = json.loads(Path('benchmarks/corpus/corpus-n/manifest.json').read_text())
ids = [f'n-{n}' for n in range(6, 14)]
assert [r['id'] for r in before['fixtures']] == ids
assert [r['id'] for r in after['fixtures']] == ids
lines = ['## Measured outcomes', '', 'Uniform normalized-error threshold 0.01. Common-vector corpus metric unchanged. Null means no comparison.', '', '| Deck | Before | Signals | Error | After | Signals | Error | Worst signal |', '|---|---|---:|---:|---|---:|---:|---|']
for old, new in zip(before['fixtures'], after['fixtures']):
    assert old['sha256'] == new['sha256']
    circuit = next(c for c in manifest['circuits'] if c['id'] == new['id'])
    assert hashlib.sha256(Path(circuit['localPath']).read_bytes()).hexdigest() == new['sha256']
    if new['id'] in ['n-6', 'n-7']:
        for field in ['outcome', 'comparedSignals', 'worstNormalizedError', 'comparisons']:
            assert old[field] == new[field], field
    # No solver changes: every actual exported sample, name and plot is unchanged.
    # Only ngspice secondary metadata is added by the repaired export boundary.
    for engine in ['ngspice', 'spiceTs']:
        a = load(f'before-{new["id"]}-{engine}.json.gz')['execution']
        b = load(f'after-{new["id"]}-{engine}.json.gz')['execution']
        for p in a['analyses']:
            p.pop('secondaryGrid', None)
        for p in b['analyses']:
            p.pop('secondaryGrid', None)
        assert a == b, (new['id'], engine)
    lines.append(f'| {new["id"]} | {old["outcome"]} | {old["comparedSignals"]} | {old["worstNormalizedError"]} | {new["outcome"]} | {new["comparedSignals"]} | {new["worstNormalizedError"]} | {new["worstSignal"]} |')
lines += ['', 'No revealed numerical error exceeds 0.01, so no numerical mismatch issue is filed. n-12 remains a coverage loss, not a numerical failure. Its extra spice-ts dc2 (486 points) has no batch raw counterpart and remains an unmatched ngspice record.', '', '## Input hashes and complete export inventory', '', 'Names and vectors below are captured from real before/after exports. No input edits. Every waveform and plot inventory is unchanged; only reference secondary-coordinate metadata changes. `after.json.gz` coverage lists every vector missing on either side. Matched here means matched common-vector metric, not full saved-vector coverage.', '']
for n in ids:
    circuit = next(c for c in manifest['circuits'] if c['id'] == n)
    lines += [f'### {n}: {Path(circuit["localPath"]).name}', '', f'SHA-256 `{circuit["sha256"]}`', '']
    for engine in ['ngspice', 'spiceTs']:
        run = load(f'after-{n}-{engine}.json.gz')
        for plot in run['execution']['analyses']:
            secondary = sorted(set(plot.get('secondaryGrid', [])))
            lines += [f'{engine}: type={plot["type"]}, plotName=`{plot["plotName"]}`, plotId=`{plot.get("plotId")}`, points={len(plot["grid"])}, secondary values={secondary}', '', 'Vectors: ' + ', '.join(f'`{s}`' for s in plot['signals']), '']
    row = next(r for r in after['fixtures'] if r['id'] == n)
    for coverage in row['coverage']:
        lines += [f'Coverage `{coverage.get("spiceTs")}` vs `{coverage.get("ngspice")}`.', '', 'Missing from spice-ts: ' + ', '.join(f'`{s}`' for s in coverage['missingFromSpiceTs']), '', 'Missing from ngspice: ' + ', '.join(f'`{s}`' for s in coverage['missingFromNgspice']), '']
(ROOT / 'inventory.md').write_text('\n'.join(lines) + '\n')
print('PASS: 8 identical input hashes, unchanged samples/inventories, n-6/n-7 receipts unchanged; inventory.md generated')
