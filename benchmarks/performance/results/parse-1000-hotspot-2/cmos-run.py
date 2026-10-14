"""Bounded CMOS supplements. Parse-only ten rounds; full-wall one cold round.
Run via spice-heavy. Censored cells are retained, never retried or averaged.
"""
import json
import os
from pathlib import Path
import signal
import subprocess
import time
from typing import Any
HERE = Path(__file__).resolve().parent

def run(argv, deadline):
    start = time.monotonic()
    child = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, text=True)
    reason = None
    try:
        stdout, stderr = child.communicate(timeout=deadline)
    except subprocess.TimeoutExpired:
        reason = 'deadline'
        os.killpg(child.pid, signal.SIGKILL)
        stdout, stderr = child.communicate()
    end = time.monotonic()
    group = subprocess.check_output(['ps', '-A', '-o', 'pgid='], text=True).split()
    gone = str(child.pid) not in group
    # A killed grandchild can briefly remain as a reparented zombie.
    for _ in range(20):
        if gone:
            break
        time.sleep(0.1)
        gone = str(child.pid) not in subprocess.check_output(['ps', '-A', '-o', 'pgid='], text=True).split()
    return dict(command=argv, pid=child.pid, startMonotonic=start, endMonotonic=end, wall=(end-start)*1000,
                deadlineSeconds=deadline, code=child.returncode, processGroupGone=gone, stopReason=reason,
                stdout=stdout, stderr=stderr)

def main():
    with (HERE / 'cmos-receipts.jsonl').open('x') as journal:
        def record(row):
            journal.write(json.dumps(row) + '\n'); journal.flush(); os.fsync(journal.fileno())
        for round in range(1, 11):
            modes = [('baseline', 'control'), ('baseline', 'instrumented'), ('comparison', 'candidate')]
            modes = modes[round % 3:] + modes[:round % 3]
            for size in [1000, 10000, 50000]:
                for directory, mode in modes:
                    row: dict[str, Any] = dict(round=round, size=size, mode=mode, kind='parse-only', beforeLoad=os.getloadavg())
                    row.update(run(['node', str(HERE / 'cmos-profile.mjs'), str(HERE / directory), mode, str(size)], 30))
                    row['afterLoad'] = os.getloadavg()
                    record(row)
                    if row['stopReason'] or row['code'] != 0 or not row['processGroupGone']:
                        raise RuntimeError('profile failed; journal retained')
        for size in [1000, 10000, 50000]:
            for mode in ['control', 'candidate', 'ngspice']:
                id = f'cmos-wall-{size}-{mode}'
                row = dict(round=1, size=size, mode=mode, kind='full-wall', beforeLoad=os.getloadavg())
                row.update(run(['node', str(HERE / 'worker.mjs'), mode, str(HERE / 'comparison'), id, 'cmos-inverter-chain-tran', str(size)], 30))
                row['afterLoad'] = os.getloadavg()
                record(row)
                print(id, row['stopReason'], row['code'], row['wall'], flush=True)

if __name__ == '__main__':
    main()
