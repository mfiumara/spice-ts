# SPDX-License-Identifier: MIT
"""Fetch immutable source for inspection, not redistribution of ngspice C code."""
import hashlib
import json
from pathlib import Path
import urllib.request

HERE = Path(__file__).resolve().parent
REVISION = 'a80f6e3e95d51534905b1f23410a951802666656'
FILES = ['COPYING', 'src/frontend/inpcom.c', 'src/frontend/numparam/xpressn.c',
         'src/frontend/numparam/spicenum.c']

def fetch():
    rows = []
    for path in FILES:
        url = f'https://raw.githubusercontent.com/imr/ngspice/{REVISION}/{path}'
        with urllib.request.urlopen(url, timeout=12) as response:
            data = response.read()
        target = HERE / '.run/upstream' / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        rows.append(dict(path=path, url=url, sha256=hashlib.sha256(data).hexdigest(),
                         licence='CC-BY-SA-4.0' if path == 'COPYING' else
                         'LGPL-2.0-or-later' if '/numparam/' in path else 'BSD-3-Clause'))
    (HERE / 'source.json').write_text(json.dumps(dict(repository='https://github.com/imr/ngspice',
                                                   tag='ngspice-47', revision=REVISION, files=rows), indent=2) + '\n')

if __name__ == '__main__':
    fetch()
