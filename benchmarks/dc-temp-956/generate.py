"""Generate authored #956 diode references with ngspice-47, no tolerance overrides.
Run: python3 benchmarks/dc-temp-956/generate.py
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
BASE = "DC temperature diode\nV out 0 0.6\nD out 0 dm\n.model dm d is=1e-14 n=2\n"
SWEEPS = {"nested": "V 0 1 0.5 temp -40 160 100", "primary": "temp -40 160 40"}
version = subprocess.check_output(["ngspice", "--version"], text=True)
assert "ngspice-47" in version
references = {}
with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR")) as directory:
    for name, sweep in SWEEPS.items():
        deck = BASE + f".dc {sweep}\n.end\n"
        (ROOT / f"{name}.cir").write_text(deck)
        path = Path(directory) / f"{name}.cir"
        path.write_text(deck.replace(".end", ".control\nset wr_singlescale\nset wr_vecnames\nset numdgt=17\nrun\nwrdata values.txt v(out) i(V)\nquit\n.endc\n.end"))
        run = subprocess.run(["ngspice", "-n", "-b", str(path)], cwd=directory, text=True, capture_output=True, check=True)
        (ROOT / f"{name}-ngspice.log").write_text(run.stdout + run.stderr)
        lines = (Path(directory) / "values.txt").read_text().splitlines()[1:]
        references[name] = [list(map(float, line.split())) for line in lines if line.strip()]
(ROOT / "reference.json").write_text(json.dumps({"engine": "ngspice-47", "command": "python3 benchmarks/dc-temp-956/generate.py (ngspice -n -b; output-only wrdata wrapper)", "columns": ["sweep", "v(out)", "i(V)"], "values": references}, indent=2) + "\n")
