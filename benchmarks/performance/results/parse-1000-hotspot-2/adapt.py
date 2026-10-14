"""Adapt the published #1005 harness without editing shared tooling."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
for src, dst in [('linear-10k.py', 'run.py'), ('linear-10k-prepare.mjs', 'prepare.mjs'), ('linear-10k-worker.mjs', 'worker.mjs'), ('linear-10k-verify.mjs', 'verify.mjs')]:
    s = (ROOT / 'benchmarks/performance' / src).read_text()
    if dst == 'run.py':
        s = s.replace('parents[2]', 'parents[4]').replace('((1000, 10000, 50000) if comparison else (10000,))', '(1000, 10000, 50000)').replace("('rc-ladder-tran', 'resistor-mesh-op')", "('rc-ladder-tran', 'resistor-mesh-op', 'cmos-inverter-chain-tran')")
        s = s.replace("ROOT / 'benchmarks/performance/linear-10k-prepare.mjs'", "Path(__file__).with_name('prepare.mjs')").replace("ROOT / 'benchmarks/performance/linear-10k-worker.mjs'", "Path(__file__).with_name('worker.mjs')")
    else:
        for name in ['rc1k-attribution-prepare.mjs', 'rc1k-attribution-data.mjs', 'scaling-m2-fixture.mjs', 'parse-1000-targets.mjs']:
            s = s.replace("'./" + name + "'", "'../../" + name + "'")
    if dst == 'prepare.mjs':
        s = s.replace("const selectedTargets = process.argv.includes('--parse') ? parseTargets : targets;", "const selectedTargets = { ...parseTargets, cardEnd: 'numparam.cardEnd', collectParamFrames: 'numparam.collectParamFrames', braceTokens: 'numparam.braceTokens', parseNumber: 'cardParse.parseNumber', tokenizeLine: 'tokenize.tokenizeLine' };")
        s = s.replace("['rc-ladder-tran', 'resistor-mesh-op']", "['rc-ladder-tran', 'resistor-mesh-op', 'cmos-inverter-chain-tran']")
        s = s.replace('attribution: process.argv.includes', "runSizes: [1000, 10000, 50000], circuits: ['rc-ladder-tran', 'resistor-mesh-op', 'cmos-inverter-chain-tran'], attribution: process.argv.includes")
    if dst == 'worker.mjs':
        s = s.replace("key.startsWith('numparam.')", "key.includes('.')").replace('boundaries.numparam += value;', "boundaries[key.split('.')[0]] += value;")
    if dst == 'verify.mjs':
        s = s.replace('prepared.comparison ? [1000, 10000, 50000] : [10000]', 'prepared.runSizes ?? (prepared.comparison ? [1000, 10000, 50000] : [10000])')
        s = s.replace('sizes.length * 60', 'sizes.length * 90').replace("['rc-ladder-tran', 'resistor-mesh-op']", 'prepared.circuits')
        s = s.replace('prepared.comparison ? `${circuit}-${size}` : circuit', '`${circuit}-${size}`')
        s = s.replace("key.endsWith('-10000')", "['rc-ladder-tran-10000', 'resistor-mesh-op-10000'].includes(key)")
    (OUT / dst).write_text(s)
