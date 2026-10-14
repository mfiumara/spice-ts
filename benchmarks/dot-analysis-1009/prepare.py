"""Snapshot exact main adapter and memoize one native simulation per fixture."""
import pathlib
import re
import subprocess

root = pathlib.Path.cwd()
snapshot = root / 'benchmarks/dot-analysis-1009/.snapshot'
snapshot.mkdir(parents=True, exist_ok=True)
base_sha = '169d683d89b77c8ccb5a9459bc3888c4ec0aba62'
name = 'benchmarks/corpus/classic/report.ts'
for label in ['before', 'after']:
    text = subprocess.check_output(['git', 'show', base_sha + ':' + name], text=True) if label == 'before' else (root / name).read_text()
    text = re.sub(r'''(from\s+['"])(\.[^'"]+)(['"])''', lambda m: m[1] + str((root / name).parent.joinpath(m[2]).resolve()) + m[3], text)
    text = text.replace("resolve('packages/core/dist/index.js')", f"resolve('{snapshot / 'core.js'}')")
    (snapshot / f'{label}.ts').write_text(text)
(snapshot / 'core.js').write_text(f'''import * as core from '{(root / 'packages/core/dist/index.js').as_uri()}';
export const parse = core.parse;
let pending;
export let calls = 0;
export function reset() {{ pending = undefined; calls = 0; }}
export function simulate(text) {{
  if (!pending) {{ calls += 1; pending = core.simulate(text); }}
  return pending;
}}
''')
print(f'baseline {base_sha}; snapshots {snapshot}')
name = 'benchmarks/aggregate-report.ts'
text = subprocess.check_output(['git', 'show', base_sha + ':' + name], text=True)
text = re.sub(r'''(from\s+['"])(\.[^'"]+)(['"])''', lambda m: m[1] + str((root / name).parent.joinpath(m[2]).resolve()) + m[3], text)
(snapshot / 'main').mkdir(exist_ok=True)
(snapshot / 'main/before-check.ts').write_text(text.replace("=== 'aggregate-report.ts'", "=== 'before-check.ts'"))
