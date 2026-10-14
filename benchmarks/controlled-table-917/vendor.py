# SPDX-License-Identifier: MIT
"""Reuse the pinned fetch-only #939 runner, retaining only bounded scalar receipts."""
import importlib.util
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
OLD = HERE.parent / 'vendor-expanded-node-917'
spec = importlib.util.spec_from_file_location('vendor917', OLD / 'run.py')
assert spec is not None and spec.loader is not None
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def capture(source, target):
    data = json.loads(source.read_text())
    for row in data['receipts']:
        row['native'] = {k: row['native'][k] for k in [
            'process', 'status', 'terminalPivot', 'milliseconds', 'errorName',
            'tableUnsupported', 'contextHash',
        ] if k in row['native']}
    data.pop('childBudget', None)
    target.write_text(json.dumps(data, indent=2) + '\n')


if sys.argv[1] == 'capture-before':
    capture(OLD / 'receipts.json', HERE / 'vendor-before.json')
else:
    assert sys.argv[1] in ['before', 'after']
    # Keep new inputs, raw files and generated receipts separate from #939.
    runner.HERE = HERE
    runner.RUN = HERE / '.run' / 'vendor'
    runner.RUN.mkdir(parents=True, exist_ok=True)
    runner.BUDGET = runner.RUN / 'budget.json'
    original_child = runner.child

    def child(argv, cwd=runner.ROOT):
        argv = [HERE / 'vendor-native.mts' if str(a) == str(HERE / 'trace.mts') else a for a in argv]
        return original_child(argv, cwd)

    runner.child = child
    runner.prepare()
    runner.engines()
    capture(HERE / 'receipts.json', HERE / ('vendor-' + sys.argv[1] + '.json'))
    (HERE / 'receipts.json').unlink()
    (HERE / 'inputs.json').rename(HERE / 'vendor-inputs.json')
