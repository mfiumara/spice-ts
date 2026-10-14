"""Reuse the #951 bounded controller for the two-deck #991 delta experiment.
Run only via spice-heavy. Prepared control is the fresh pre-candidate build.
"""
import importlib.util
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('controller', ROOT / 'benchmarks/performance/solver-growth-991.py')
assert spec is not None and spec.loader is not None
controller = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controller)


def prepare(argv, **kwargs):
    assert argv[:2] == ['node', 'benchmarks/performance/solver-growth-991-prepare.mjs']
    return subprocess.run(['node', 'benchmarks/performance/linear-10k-prepare.mjs', argv[2],
                           '--before', str(Path(__file__).parent / 'profile')], **kwargs)


controller.subprocess = SimpleNamespace(run=prepare, check_output=subprocess.check_output, Popen=subprocess.Popen)
controller.plan = lambda: [dict(round=r + 1, circuit=c, size=s, mode=m)
                          for r in range(10) for s in [1000, 10000, 50000]
                          for c in ['rc-ladder-tran', 'resistor-mesh-op']
                          for m in (['control', 'candidate', 'ngspice'][r % 3:]
                                    + ['control', 'candidate', 'ngspice'][:r % 3])]
if __name__ == '__main__':
    raise SystemExit(controller.main())
