"""Recompute diagnostic voltage errors from the retained measured waveforms."""
import bisect
import gzip
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent


def load(label):
    with gzip.open(ROOT / f"{label}-waveforms.json.gz", "rt") as stream:
        return json.load(stream)


def series(execution):
    return next(a["series"] for a in execution["analyses"] if a["type"] == "tran")


def compare(actual, reference):
    grid = reference["grid"]
    values = [v["re"] for v in reference["signals"]["v(vout)"]]
    peak = max(map(abs, values))
    rows = []
    for index, time in enumerate(actual["grid"]):
        i = max(1, min(len(grid) - 1, bisect.bisect_left(grid, time)))
        fraction = (time - grid[i - 1]) / (grid[i] - grid[i - 1])
        native = values[i - 1] * (1 - fraction) + values[i] * fraction
        spice = actual["signals"]["v(vout)"][index]["re"]
        rows.append(dict(index=index, time=time, actual=spice, reference=native,
                         absolute=abs(spice - native), normalized=abs(spice - native) / peak))
    return dict(peak=peak, points=len(rows), max=max(r["absolute"] for r in rows),
                rms=math.sqrt(sum(r["absolute"] ** 2 for r in rows) / len(rows)),
                firstAboveOnePercent=next((r for r in rows if r["normalized"] > 0.01), None),
                worst=max(rows, key=lambda r: r["absolute"]))


def summarize():
    before = load("before")
    after = load("after")
    fine = load("fine")
    tight = load("tight")
    result = {"metric": "linear interpolation at actual-engine timepoints; v(vout) only; peak-normalized", "fixtures": []}
    for b, a, f, t in zip(before, after, fine, tight):
        assert b["id"] == a["id"] == f["id"] == t["id"]
        assert b == a, "evidence-only production run changed"
        result["fixtures"].append(dict(id=b["id"],
            before=compare(series(b["ts"]), series(b["ng"])),
            after=compare(series(a["ts"]), series(a["ng"])),
            diagnosticFine=compare(series(f["ts"]), series(f["ng"])),
            diagnosticTight=compare(series(t["ts"]), series(t["ng"])),
            defaultTsAgainstFineNative=compare(series(b["ts"]), series(f["ng"])),
            defaultNativeAgainstFineNative=compare(series(b["ng"]), series(f["ng"]))))
    for label, waves in [("before", before), ("after", after), ("fine", fine), ("tight", tight)]:
        assert waves[0]["ng"] == waves[1]["ng"], f"native alias divergence {label}"
        assert waves[0]["ts"] == waves[1]["ts"], f"TS alias divergence {label}"
    result["aliasExecutionsIdentical"] = True
    result["artifactSha256"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(ROOT.glob("*-waveforms.json.gz"))}
    return result


if __name__ == "__main__":
    summary = summarize()
    path = ROOT / "summary.json"
    if "--check" in sys.argv:
        assert summary == json.loads(path.read_text()), "summary receipt drift"
        print("PASS: unchanged original losses, identical aliases, diagnostic errors and waveform hashes")
    else:
        path.write_text(json.dumps(summary, indent=2) + "\n")
        print(json.dumps(summary["fixtures"][0], indent=2))
