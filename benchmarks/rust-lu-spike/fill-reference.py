#!/usr/bin/env python3
"""Issue #802 spike, optional context: fill and factor time of a mature sparse
LU (SciPy's SuperLU, BSD) on the same dumped matrices, under different
column orderings. Used only to separate "algorithm" from "language" in
docs/spikes/rust-lu.md; nothing here is vendored or linked into spice-ts.

Usage: python3 -m venv .venv && .venv/bin/pip install scipy
       .venv/bin/python benchmarks/rust-lu-spike/fill-reference.py [deck ...]
Prints one JSON line per deck/ordering: L+U nnz (SuperLU counts the unit
diagonal of L, so subtract n to compare with spice-ts' factorNonzeros) and
median factor time of 5 runs.
"""
import json
import os
import sys
import time

import numpy as np
import scipy
from scipy.io import mmread
from scipy.sparse.linalg import splu

HERE = os.path.dirname(os.path.abspath(__file__))
DECKS = sys.argv[1:] or [
    "rc-ladder-10k", "rc-ladder-50k", "resistor-mesh-10k", "resistor-mesh-50k",
    "cmos-chain-10k", "cmos-chain-50k",
]
for deck in DECKS:
    a = mmread(os.path.join(HERE, "matrices", f"{deck}.first.A.mtx")).tocsc()
    n = a.shape[0]
    for spec in ("COLAMD", "MMD_AT_PLUS_A"):
        times = []
        lu = None
        for _ in range(5):
            t = time.perf_counter()
            # diag_pivot_thresh=0.1 matches spice-ts' threshold partial pivoting.
            lu = splu(a, permc_spec=spec, diag_pivot_thresh=0.1)
            times.append((time.perf_counter() - t) * 1e3)
        print(json.dumps({
            "deck": deck, "n": n, "nnz": int(a.nnz), "ordering": spec,
            "luNnzExclUnitDiag": int(lu.L.nnz + lu.U.nnz - n),
            "factorMsMedian": float(np.median(times)), "scipy": scipy.__version__,
        }))
