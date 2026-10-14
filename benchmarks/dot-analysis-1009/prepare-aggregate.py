"""Instrument an ignored copy of the aggregate checker; never rewrite its artifacts."""
import pathlib
import re

root = pathlib.Path.cwd()
snapshot = root / 'benchmarks/dot-analysis-1009/.snapshot'
name = 'benchmarks/aggregate-report.ts'
text = (root / name).read_text()
text = text.removeprefix('#!/usr/bin/env tsx\n')
# The canonical checker is stale on main. This diagnostic still validates every
# manifest input hash but does not pretend to verify the historical pinned report.
text = text.replace('if (stale.length > 0) {', 'if (false && stale.length > 0) {')
text = text.replace("=== 'aggregate-report.ts'", "=== 'diagnostic.ts'")
text = re.sub(r'''(from\s+['"])(\.[^'"]+)(['"])''', lambda m: m[1] + str((root / name).parent.joinpath(m[2]).resolve()) + m[3], text)
text = "import { summarize as auditSummary } from '" + str(root / 'benchmarks/plot-identity-970/audit.js') + "';\nconst deltaRows = [];\n" + text
needle = '      const comparisons = compareExecutions(spiceTs.execution, ngspice.execution);'
assert text.count(needle) == 1
text = text.replace(needle, needle + '''
      // Recover the exact main adapter view from the retained last-per-type runs.
      // No solver rerun. Preserve main's declared-type ordering and non-dot path.
      const own = spiceTs.execution;
      const baseline = own.analyses.some(a => a.plotId?.startsWith('dot:')) ? {
        ...own, analyses: compatible.analyses.flatMap(type => own.analyses.filter(a => a.type === type && (a.plotId === undefined || !a.plotId.startsWith('dot:') || a.plotId === `dot:${type}:1`)).map(({ plotId, ...a }) => plotId?.startsWith('dot:') ? a : { ...a, ...(plotId === undefined ? {} : { plotId }) })),
      } : own;
      const beforeComparisons = compareExecutions(baseline, ngspice.execution);
      deltaRows.push({ key: `${corpus}/${circuit.id}`, before: auditSummary(beforeComparisons, baseline, ngspice.execution), after: auditSummary(comparisons, own, ngspice.execution), beforeComparisons, afterComparisons: comparisons });
''')
needle = '  const corpusFixtures = Object.fromEntries'
assert text.count(needle) == 1
text = text.replace(needle, '''  await writeFile('benchmarks/dot-analysis-1009/raw/aggregate-delta.json', JSON.stringify({ rows: deltaRows }, null, 2) + '\\n');
''' + needle)
(snapshot / 'diagnostic.ts').write_text(text)
print(snapshot / 'diagnostic.ts')
