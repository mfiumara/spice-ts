"""Run the circuit/sweep-length controls without changing simulator tests.

From the repo root:
  spice-heavy python3 benchmarks/results/issue-847/controls.py

The input is the first deck in the shipped #825 test. The one-switch
variants remove only R2, S2 and SMOD2; the short variants change only .dc.
"""

from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "packages/core/src/devices/pspice-vswitch-825.test.ts"
DECK = SOURCE.read_text().split("await simulate(`", 1)[1].split("`);", 1)[0]

print("Source: packages/core/src/devices/pspice-vswitch-825.test.ts, first deck")
print("Command: ngspice -b <deck>; local .spiceinit: set ngbehavior=psa")
print("Original evidence head: 6370e1806f29150bd3f3e9f340f4b3c7b49d963d")
print(subprocess.run(["ngspice", "--version"], text=True, capture_output=True,
                     check=True).stdout)
for switches in (2, 1):
    for sweep in ("-2 2", "-0.5 -0.25"):
        lines = DECK.splitlines()
        if switches == 1:
            lines = [line for line in lines if not line.startswith(
                ("R2 ", "S2 ", ".MODEL SMOD2 "))]
        lines = [f".dc Vc {sweep} 0.25" if line.startswith(".dc ") else line
                 for line in lines]
        signals = "v(out) v(out2)" if switches == 2 else "v(out)"
        lines.insert(-1, f".print dc {signals}")
        deck = "\n".join(lines) + "\n"
        # Use a local init file, not the user's ngspice configuration.
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            directory = Path(directory)
            (directory / ".spiceinit").write_text("set ngbehavior=psa\n")
            (directory / "control.cir").write_text(deck)
            result = subprocess.run(["ngspice", "-b", "control.cir"],
                                    cwd=directory, text=True, capture_output=True)
        print(f"\n=== {switches} switch(es), .dc Vc {sweep} 0.25 ===")
        print(deck, end="")
        print(result.stdout, end="")
        print(result.stderr, end="")
        print(f"Exit code: {result.returncode}")
        result.check_returncode()
        rows = [line.split() for line in result.stdout.splitlines()
                if line.split() and line.split()[0].isdigit()]
        point = next(row for row in rows if float(row[1]) == -0.25)
        expected = "9.919552e-01" if switches == 2 else "9.914147e-01"
        assert point[2] == expected, point
        if switches == 2:
            assert point[3] == "4.256259e-02", point
        print("Control at -0.25:", " ".join(point[1:]))
print("\nAll four control assertions passed.")
