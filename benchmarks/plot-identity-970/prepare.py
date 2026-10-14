"""Extract exact merge-base comparison modules; no fixture or aggregate edits."""
import pathlib
import re
import subprocess

root = pathlib.Path.cwd()
base_sha = 'bd4ac625f15e344043a7431b24f64828966e2d41'
snapshot = root / 'benchmarks/plot-identity-970/.snapshot'
base = snapshot / 'base'
paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', base_sha, 'benchmarks'], text=True).splitlines()
for name in paths:
    if not name.endswith('.ts'):
        continue
    destination = base / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    text = subprocess.check_output(['git', 'show', base_sha + ':' + name], text=True)
    if name in ['benchmarks/corpus/classic/report.ts', 'benchmarks/corpus/corpus-f/plot-adapter.ts']:
        text = text.replace("resolve('packages/core/dist/index.js')", f"resolve('{snapshot / 'core.js'}')")
    destination.write_text(text)
snapshot.mkdir(parents=True, exist_ok=True)
(snapshot / 'core.js').write_text(f'''import * as core from '{(root / 'packages/core/dist/index.js').as_uri()}';
export const parse = core.parse;
let pending;
export let calls = 0;
export function simulate(text) {{
  if (!pending) {{ calls += 1; pending = core.simulate(text); }}
  return pending;
}}
''')
name = 'benchmarks/corpus/classic/report.ts'
text = (root / name).read_text()
text = re.sub(r'''(from\s+['"])(\.[^'"]+)(['"])''', lambda m: m[1] + str((root / name).parent.joinpath(m[2]).resolve()) + m[3], text)
text = text.replace("resolve('packages/core/dist/index.js')", f"resolve('{snapshot / 'core.js'}')")
(snapshot / 'current-adapter.ts').write_text(text)
name = 'benchmarks/corpus/corpus-f/plot-adapter.ts'
text = (root / name).read_text()
text = re.sub(r'''(from\s+['"])(\.[^'"]+)(['"])''', lambda m: m[1] + str((root / name).parent.joinpath(m[2]).resolve()) + m[3], text)
text = text.replace(str(root / 'benchmarks/corpus/classic/report.js'), str(snapshot / 'current-adapter.js'))
text = text.replace("resolve('packages/core/dist/index.js')", f"resolve('{snapshot / 'core.js'}')")
(snapshot / 'current-plot-adapter.ts').write_text(text)
