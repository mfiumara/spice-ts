"""Assemble measured receipts; does not change scores or classify a loss as a pass."""
import gzip
import json
import subprocess
from pathlib import Path
root = Path(__file__).parent
before_sha = 'a521e9e221f4445639d899265589e5893a07e165'
base_sha = 'd8ab9d3374d8ada21f7d9dd221c3fc3595aa5783'
before = json.loads(subprocess.check_output(['git','show',f'{before_sha}:benchmarks/reference/maxord-983/report.json']))
(root/'before.json').write_text(json.dumps(before,indent=2)+'\n')
after = json.loads(Path('benchmarks/reference/maxord-983/report.json').read_text())
related = json.loads((root/'related.json').read_text())
mosamp = json.loads((root/'mosamp.json').read_text())
state = json.loads((root/'state-localization.json').read_text())
local = json.loads((root/'localization.json').read_text())
ng = json.loads(gzip.decompress((root/'native-trace.json.gz').read_bytes()))
ts = json.loads(gzip.decompress((root/'ts-trace.json.gz').read_bytes()))
window = state['windows']['firstRisingEdge']
receipt = dict(baseSha=base_sha,beforeSha=before_sha,coreTree=after['coreTree'],productionFilesChanged=[],
    outcome='unresolved loss, evidence-only investigation; #1019 remains open',
    pump=dict(before=before['fixtures'][0],after=after['fixtures'][0]),
    rc=[{k:r[k] for k in ['id','outcome','worstNormalizedError','ngspice','spiceTs']} for r in after['fixtures'][1:]],
    guards=dict(mosamp2=dict(errorV=mosamp['maxAbsAtStop'],boundV=mosamp['originalTestBound'],points=mosamp['points']),
        related={k:dict(points=v['points'],worstNormalized=max(s['normalized'] for s in v['signals'].values())) for k,v in related.items()}),
    nativeVerification=state['nativeWaveformVerification'],currentLocalization=local['i(vnin)'],
    firstEdge=window,
    nearestLteAtFirstGridDifference=dict(
        native=min(ng['lte'], key=lambda r:abs(r['time']-5.0237739315258896e-9)),
        spiceTs=min(ts['lte'], key=lambda r:abs(r['time']-5.0237739315258896e-9))),
    caveats=['Native state0 Meyer caps are half-capacitances without overlap; TS accepted caps are full including overlap.',
        'TS iterations per advance include rejected trial work; native STEPTRACE iterations count one NIiter trial.',
        'First grid difference uses a 1 as diagnostic resolution, not a scoring tolerance.',
        'Tiny t=0/first-step floating-point state differences precede the first-edge divergence.',
        'No causal root fix established. Native bypass/limiting/convergence and loaded history require a separate controlled investigation.'])
(root/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k in ['guards','nearestLteAtFirstGridDifference']},indent=2))
