"""Freeze diagnostic bundles, profile sourcemaps and executed command logs."""
import gzip
import hashlib
import json
import os
from pathlib import Path

OUT = Path(__file__).resolve().parent
hashes = {}
for name in ['control.mjs', 'instrumented.mjs', 'control.mjs.map', 'instrumented.mjs.map']:
    data = (OUT / '.generated' / name).read_bytes()
    hashes[name] = hashlib.sha256(data).hexdigest()
    (OUT / (name + '.gz')).write_bytes(gzip.compress(data, mtime=0))
(OUT / 'bundle-hashes.json').write_text(json.dumps(hashes, indent=2) + '\n')
for name in ['install', 'core-build', 'build', 'lint', 'targeted', 'summary', 'offline']:
    path = Path(os.environ['TMPDIR']) / ('t_a404247c-' + name + '.log')
    if path.exists():
        (OUT / (name + '.log.gz')).write_bytes(gzip.compress(path.read_bytes(), mtime=0))
# The first two exploratory timer runs preceded the repeated diagnostic series;
# preserve them explicitly rather than presenting them as headline samples.
for key in ['ngspice', 'classic']:
    path = OUT / (key + '-instrumented.json')
    if path.exists():
        path.rename(OUT / (key + '-exploratory-instrumented.json'))
print('Archived exact bundles/maps, hashes and real local logs.')
