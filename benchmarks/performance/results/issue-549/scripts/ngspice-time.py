#!/usr/bin/env python3
"""Issue #549: time ngspice-47 batch runs on the same transformed netlist spice-ts runs.

    ngspice-time.py <runs> <deck>...

The netlist comes from run-deck.mjs with EMIT_NETLIST=1, so both engines see
identical circuit bytes; ngspice only gets an appended `.control run / quit`
block (batch mode needs one to run without .print). Run with `ngspice -b`; wall
time includes process start, CPU is user+sys of the
child process. Prints one JSON line per deck. Wrap in spice-heavy.
"""
import json
import os
import resource
import subprocess
import sys
import tempfile
import time

here = os.path.dirname(os.path.abspath(__file__))
runs = int(sys.argv[1])
version = subprocess.run(['ngspice', '--version'], capture_output=True, text=True).stdout
version = next((line.strip() for line in version.splitlines() if 'ngspice-' in line), version.strip())

for deck in sys.argv[2:]:
    netlist = subprocess.run(['node', os.path.join(here, 'run-deck.mjs'), deck],
                             env={**os.environ, 'EMIT_NETLIST': '1'},
                             capture_output=True, text=True, check=True).stdout
    with tempfile.TemporaryDirectory() as work:
        path = os.path.join(work, 'deck.cir')
        with open(path, 'w') as handle:
            handle.write(netlist.replace('\n.end\n', '\n.control\nrun\nquit\n.endc\n.end\n'))
        wall, cpu = [], []
        for _ in range(runs + 1):  # first run warms the file cache, dropped
            before = resource.getrusage(resource.RUSAGE_CHILDREN)
            start = time.perf_counter()
            subprocess.run(['ngspice', '-b', path], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, check=True, cwd=work)
            wall.append(round((time.perf_counter() - start) * 1000, 1))
            after = resource.getrusage(resource.RUSAGE_CHILDREN)
            cpu.append(round((after.ru_utime - before.ru_utime + after.ru_stime - before.ru_stime) * 1000, 1))
        wall, cpu = wall[1:], cpu[1:]
    print(json.dumps({
        'deck': os.path.basename(deck),
        'ngspice': version,
        'wallMs': wall,
        'cpuMs': cpu,
        'medianWallMs': sorted(wall)[len(wall) // 2],
        'medianCpuMs': sorted(cpu)[len(cpu) // 2],
    }))
