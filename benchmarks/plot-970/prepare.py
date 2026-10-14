"""Prepare ignored baseline adapters and the exact #968 reference engine."""
import pathlib
import re
import subprocess

root = pathlib.Path.cwd()
base = root / 'benchmarks/plot-970/.reference'
base.mkdir(parents=True, exist_ok=True)
for name, output in [('benchmarks/aggregate-report.ts', 'baseline-compare.ts'), ('benchmarks/comparison-harness.ts', 'baseline-harness.ts'), ('benchmarks/corpus/classic/report.ts', 'baseline-adapter.ts')]:
    source = subprocess.check_output(['git', 'show', 'c4858434e58fedeeedab142f2479252e0a59e851:' + name], text=True)
    source = re.sub(r'''(from\s+['"])(\.[^'"]+)(['"])''', lambda match: match[1] + str((root / name).parent.joinpath(match[2]).resolve()) + match[3], source)
    if output == 'baseline-adapter.ts':
        source = source.replace("resolve('packages/core/dist/index.js')", "resolve('benchmarks/plot-970/.reference/index.js')")
    if output == 'baseline-compare.ts':
        source = source.replace(str(root / 'benchmarks/comparison-harness.js'), str(base / 'baseline-harness.js'))
    (base / output).write_text(source)
# Current adapter with the same pinned reference engine, without changing production source/dist.
name = 'benchmarks/corpus/classic/report.ts'
source = (root / name).read_text()
source = re.sub(r'''(from\s+['"])(\.[^'"]+)(['"])''', lambda match: match[1] + str((root / name).parent.joinpath(match[2]).resolve()) + match[3], source)
source = source.replace("resolve('packages/core/dist/index.js')", "resolve('benchmarks/plot-970/.reference/index.js')")
(base / 'current-adapter.ts').write_text(source)
