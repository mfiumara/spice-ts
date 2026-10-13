"""Export the entire historical Q/D bucket, without hand selection."""
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent
SOURCE = '5014ae0bcfd6484a2ad4d5b25ed14672851b3ca2'
PREFIX = 'benchmarks/corpus/corpus-f/'

def blob(path):
    return subprocess.check_output(['git', 'show', SOURCE + ':' + PREFIX + path])

def main():
    outcomes = json.loads(blob('outcomes.json'))
    manifest = json.loads(blob('manifest.json'))
    bucket, = [b for b in outcomes['gapBuckets'] if b['bucket'].startswith('device: Q/D instance forms')]
    ids = sorted(bucket['ids'])
    assert len(ids) == len(set(ids)) == 22
    circuits = {c['id']: c for c in manifest['circuits']}
    historical = {r['id']: r for r in outcomes['fixtures']}
    rows = []
    for id in ids:
        c = circuits[id]
        data = blob('fixtures/' + c['sourcePath'])
        assert hashlib.sha256(data).hexdigest() == c['sha256']
        assert c['licence'] == 'BSD-3-Clause'
        path = ROOT / 'fixtures' / c['sourcePath']
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        rows.append({**c, 'localPath': str(path.relative_to(ROOT)), 'includes': [], 'historical': historical[id]})
    receipt = {'sourceCommit': SOURCE, 'source': manifest['source'], 'historicalTools': outcomes['tools'],
               'historicalReceiptSha256': hashlib.sha256(blob('outcomes.json')).hexdigest(),
               'selection': bucket, 'fixtures': rows}
    (ROOT / 'selection.json').write_text(json.dumps(receipt, indent=2) + '\n')
    (ROOT / 'LICENSE.txt').write_bytes(blob('LICENSE.txt'))
    print('exported', len(rows), 'unchanged BSD-3-Clause fixtures')

if __name__ == '__main__':
    main()
