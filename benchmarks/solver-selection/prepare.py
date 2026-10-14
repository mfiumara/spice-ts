"""Reconstruct fetch-only #718/#720 variants; require existing manifest pins.
Run python3 benchmarks/solver-selection/prepare.py. Writes only ignored fetched inputs.
Source/license policy remains benchmarks/SOURCES.md and ngspice-bugs manifest.
"""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

corpus = Path('benchmarks/corpus/ngspice-bugs')
manifest = json.loads((corpus / 'manifest.json').read_text())
description = json.load(urlopen('https://sourceforge.net/rest/p/ngspice/bugs/718'))['ticket']['description']
text718 = description.replace('\r\n', '\n').split('\n\n', 1)[1]
text718 = text718[:text718.upper().index('.END') + len('.END')] + '\n'
text720 = urlopen('https://raw.githubusercontent.com/ngspice/ngspice/master/examples/tclspice/tcl/diffpair.cir').read().decode()
text720 = text720.replace('.sens v(5,4)', '.sens v(5,4) ac dec 5 10k 10meg')
for ticket, text in [(718, text718), (720, text720)]:
    entry = next(item for item in manifest['tickets'] if item['ticket'] == ticket)
    for solver in ['klu', 'sparse']:
        candidate = text.replace('.options klu', f'.options {solver}') if ticket == 718 else text.replace('\n', f'\n.options {solver}\n', 1)
        data = candidate.encode()
        pin = next(item for item in entry['uncommittedDecks'] if item['name'] == f'{solver}.cir')
        digest = hashlib.sha256(data).hexdigest()
        if digest != pin['sha256']:
            raise RuntimeError(f'{ticket}/{solver}: {digest} != {pin["sha256"]}')
        path = corpus / 'fetched' / str(ticket) / f'{solver}.cir'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        print(ticket, solver, len(data), digest)
