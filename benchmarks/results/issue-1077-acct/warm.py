"""Persistent native process diagnostics, via a headless pipe-backed PTY only.
Run via spice-heavy. Marker wall times exclude rusage and retain every sample.
"""
import gzip
import json
import os
from pathlib import Path
import pty
import select
import subprocess
import time

OUT = Path(__file__).resolve().parent
for key in ['ngspice', 'classic']:
    data = (OUT / (key + '-acct.cir')).read_text()
    control = '.control\nrepeat 6\necho STARTACCT1077\nrun\necho STOPACCT1077\nrusage all\necho ENDACCT1077\nend\nquit\n.endc\n'
    deck = OUT / (key + '-warm.cir')
    assert data.lower().count('.end') == 1
    deck.write_text(data.replace('.end', control + '.end'))
    master, slave = pty.openpty()
    proc = subprocess.Popen(['ngspice', '-n', '-b', str(deck)], stdout=slave, stderr=slave)
    os.close(slave)
    buffer = b''
    def read_to(marker):
        global buffer
        deadline = time.perf_counter() + 120
        while marker not in buffer:
            if time.perf_counter() > deadline:
                raise TimeoutError('Native warm marker timeout')
            ready, _, _ = select.select([master], [], [], 1)
            if ready:
                buffer += os.read(master, 65536)
        output, buffer = buffer.split(marker, 1)
        return output + marker
    rows = []
    try:
        for run in range(6):
            prefix = read_to(b'STARTACCT1077')
            start = time.perf_counter()
            analysis = read_to(b'STOPACCT1077')
            wall = (time.perf_counter()-start)*1000
            accounting = read_to(b'ENDACCT1077')
            (OUT / f'{key}-native-warm-{run}.log.gz').write_bytes(gzip.compress(prefix+analysis+accounting, mtime=0))
            rows.append(dict(run=run, wallMs=wall))
    finally:
        proc.terminate()
        proc.wait(timeout=10)
        os.close(master)
    (OUT / (key + '-native-warm.json')).write_text(json.dumps(rows, indent=2)+'\n')
print('Retained six native warm runs per fixture; first is warmup.')
