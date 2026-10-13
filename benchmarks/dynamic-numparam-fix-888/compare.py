# SPDX-License-Identifier: MIT
"""Run under spice-heavy. Receipts record argv/cwd/exit/signal/wall/stdout/stderr.
Each simulation is a direct, owned process-group child, not a pnpm wrapper.
"""
from __future__ import annotations
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import signal
import subprocess
import time
from typing import TypedDict


class ChildReceipt(TypedDict):
    argv: list[str]
    cwd: str
    exit: int
    signal: int | None
    timedOut: bool
    seconds: float
    stdout: str
    stderr: str

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
RUN = HERE / ".run"
REVISION = "a80f6e3e95d51534905b1f23410a951802666656"
BUDGET = 300.0
LIMIT = 12.0
elapsed = 0.0


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def child(argv, cwd=ROOT, env=None) -> ChildReceipt:
    global elapsed
    remaining = BUDGET - elapsed
    if remaining <= 0:
        raise RuntimeError("Cumulative actual child wall budget exhausted")
    start = time.monotonic()
    proc = subprocess.Popen(argv, cwd=cwd, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = proc.communicate(timeout=min(LIMIT, remaining))
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(proc.pid, signal.SIGKILL)
        stdout, stderr = proc.communicate()
    seconds = time.monotonic() - start
    elapsed += seconds
    return {"argv": [str(x) for x in argv], "cwd": str(cwd), "exit": proc.returncode,
            "signal": -proc.returncode if proc.returncode < 0 else None,
            "timedOut": timed_out, "seconds": seconds, "stdout": stdout, "stderr": stderr}


def raw_values(text, names):
    variables = text.split("Variables:\n", 1)[1].split("Values:\n", 1)
    columns = [line.split()[1].lower() for line in variables[0].splitlines() if line.strip()]
    lines = [line.split() for line in variables[1].splitlines() if line.strip()]
    assert len(lines) == len(columns), "Expected exactly one OP point"
    assert "Plotname: Operating Point" in text
    values = [float(lines[0][1])] + [float(line[0]) for line in lines[1:]]
    result = {name: values[columns.index(name.lower())] for name in names}
    assert all(math.isfinite(v) for v in result.values())
    return result


def metrics(reference, native):
    if reference is None or native is None:
        return None
    errors = [abs(native[k] - v) for k, v in reference.items()]
    relative = [abs(native[k] - v) / abs(v) for k, v in reference.items()]
    # All selected references are nonzero. No per-circuit tolerances or floor.
    return dict(maxAbsolute=max(errors), rmsAbsolute=math.sqrt(sum(e*e for e in errors)/len(errors)),
                maxRelative=max(relative), rmsRelative=math.sqrt(sum(e*e for e in relative)/len(relative)))


RUN.mkdir(exist_ok=True)
matrix = json.loads((HERE / "matrix.json").read_text())
assert 0 < len(matrix) <= 20
assert len({case["id"] for case in matrix}) == len(matrix)
metadata = {"baseline": child(["git", "rev-parse", "HEAD"]),
            "ngspiceVersion": child(["ngspice", "--version"]),
            "nodeVersion": child(["node", "--version"]),
            "pnpmVersion": child(["pnpm", "--version"]),
            "host": dict(system=platform.system(), release=platform.release(), machine=platform.machine()),
            "configuration": "ngspice -n disables .spiceinit; SPICE_ASCIIRAWFILE=1; no compatibility mode",
            "runtimeBoundary": "Direct process-group wall, startup/parse/compile/OP/output included; not simulator kernel timing"}
assert "ngspice-47" in metadata["ngspiceVersion"]["stdout"]
upstream = RUN / "upstream"
revision_receipt = child(["git", "rev-parse", "HEAD"], cwd=upstream)
assert revision_receipt["stdout"].strip() == REVISION
source_files = ["COPYING", "src/frontend/numparam/numparam.h", "src/frontend/numparam/xpressn.c",
                "src/frontend/numparam/spicenum.c", "src/frontend/subckt.c", "src/frontend/inpcom.c"]
source = dict(url="https://git.code.sf.net/p/ngspice/ngspice", revision=REVISION,
              revisionReceipt=revision_receipt, hashes={p: sha(upstream/p) for p in source_files})
rows = []
for case in matrix:
    deck = HERE / "decks" / (case["id"] + ".cir")
    before = sha(deck)
    raw = RUN / (case["id"] + ".raw")
    raw.unlink(missing_ok=True)
    env = dict(os.environ, SPICE_ASCIIRAWFILE="1")
    reference = child(["ngspice", "-n", "-b", "-r", str(raw), str(deck)], cwd=RUN, env=env)
    text = raw.read_text() if raw.exists() else None
    reference_values = None
    reference_error = None
    if reference["exit"] == 0 and text is not None:
        try:
            reference_values = raw_values(text, case["observe"])
        except Exception as error:
            reference_error = str(error)
    native = child(["node", "--import", "tsx", str(HERE / "native.mts"), str(deck), json.dumps(case["observe"])])
    native_values = None
    native_error = None
    try:
        payload = json.loads(native["stdout"])
        native_error = payload.get("error")
        if native["exit"] == 0 and payload["status"] == "success":
            native_values = payload["values"]
    except (ValueError, KeyError) as error:
        native_error = str(error)
    after = sha(deck)
    assert before == after
    row = dict(**case, deckHashBefore=before, deckHashAfter=after, reference=reference,
               referenceRaw=text, referenceValues=reference_values, referenceError=reference_error,
               native=native, nativeValues=native_values, nativeError=native_error,
               metrics=metrics(reference_values, native_values))
    rows.append(row)
    print(case["id"], reference_values, native_values or native_error, row["metrics"], flush=True)
report = dict(metadata=metadata, source=source, limits=dict(cases=20, directChildSeconds=LIMIT,
              cumulativeChildSeconds=BUDGET), actualChildSeconds=elapsed, rows=rows)
(HERE / "receipt.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"Recorded {len(rows)} cases, actual child wall {elapsed:.3f}s")
