#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Localize and guard the recorded checkpoints, without executing vendor decks."""
import gzip
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
load = lambda name: json.loads(gzip.decompress((HERE/name).read_bytes()))
summary = {}
native_receipts = json.loads((HERE/'native-receipt.json').read_text())
assert [r['exitCode'] for r in native_receipts]==[0,1,0]
assert all(r['observationNeutral'] and r['exitCode']==r['controlExitCode'] for r in native_receipts)
ts_receipts = json.loads((HERE/'ts-receipt.json').read_text())
assert len(ts_receipts)==9 and all(r['exitCode']==0 for r in ts_receipts)
for label in ['base','variant']:
    assert [r['factors'] for r in ts_receipts if r['label']==label]==[173,203,1903]
assert hashlib.sha256((HERE/'island.cir').read_bytes()).hexdigest()==native_receipts[2]['sha256']
for label in ['base','variant','island']:
    native = load(f'{label}-native.json.gz')
    ts = load(f'{label}-source.json.gz')
    n0 = next(x for x in native if x['scale']==0 and x['stage']=='loaded')
    s0 = next((x for x in ts['rows'] if x['scale']==0), ts['rows'][0])
    if label=='island':
        assert abs(n0['state0'][2] - 2**-.5 - 1e-12) < 1e-14
        assert s0['stateAfter']['stampedJunctionVoltage']==0
        summary[label] = dict(firstJunctionLoad=dict(native=n0,spiceTs=s0),
            note='MIT reduction is RED on INITJCT state, not final OP. Its rounded explicit-series block already factors under TS ordering.')
        continue
    ns = next(x for x in native if x['scale']==.001 and x['diag']==0 and x['stage']=='loaded')
    ss = next(x for x in ts['rows'] if x['scale']==.001)
    nf = next(x for x in native if x['scale']==.001 and x['diag']==0 and x['stage'] in ['factor','reorder'])
    summary[label] = dict(firstZeroSource=dict(native=n0,spiceTs=s0),
        firstUnshuntedSource=dict(native=ns,spiceTs=ss,factor=nf,
            identicalBlock=ns['matrix']==ss['matrix'],
            nativeIslandPivot=1/nf['matrix'][8] if label != 'island' else None))
    if label in ['base','variant']:
        assert ns['matrix']==ss['matrix']
        assert nf['error']==0 and ss['error'] is not None
        assert ns['state0'][0] == -2.084701101089635e-19
        assert ss['stateAfter']['previousJunctionVoltage']==0
        assert n0['state0'][0]==0.570454328909948
        assert s0['stateAfter']['stampedJunctionVoltage']==0

    if label=='variant':
        nt = next(x for x in native if x['dt']>0 and x['stage']=='loaded')
        st = next(x for x in load('variant-optran.json.gz')['rows'] if x.get('dt',0)>0)
        failed = next(x for x in native if x['dt']>0 and x['stage']=='iteration-limit')
        attempts = load('variant-optran-attempts.json.gz')
        failed_attempt = next(x for x in attempts if x.get('error',0)!=0)
        failed_start = next(x for x in native if x['attempt']==failed_attempt['attempt'] and x['stage']=='before')
        failed_load = next(x for x in native if x['attempt']==failed_attempt['attempt'] and x['stage']=='loaded')
        assert failed_attempt['attempt']==failed['attempt']==3
        assert attempts[1]['error']==0
        assert nt['mode']==4097 and nt['dt']==st['dt']==1e-9
        assert failed['iteration']==101 and failed['error']!=0
        assert nt['state1'][0]==-2.084481855026512e-19
        assert st['stateBefore']['acceptedJunctionVoltage']==0
        summary[label]['transientCheckpoints'] = dict(nativeStartupLoad=nt,spiceTsStartupLoad=st,nativeFirstFailedAttempt=failed_attempt,
            nativeFailedStart=failed_start,nativeFailedLoad=failed_load,nativeFailure=failed,
            note='Native startup Newton succeeds at 1ns; TS candidate rejects its first startup Newton. Native first failed Newton attempt is #3, after a successful #2 solve and LTE retry. Diode/three-row observation only, not a full vendor model-state bisect. Native optime is local; CKTtime remains zero.')
replay=json.loads((HERE/'replay.json').read_text())
assert 'SingularMatrixError' in replay['error'] and replay['rowSums']==[0,0,0]
summary['replay']=replay
summary['parity']=dict(before=dict(base='singular pivot10',variant='singular pivot10',maxError=None,rmsError=None),
    after=dict(base='singular pivot10',variant='singular pivot10',maxError=None,rmsError=None),
    reason='Evidence only; production simulator unchanged. Shared variant failure is not parity.')
(HERE/'localization.json').write_text(json.dumps(summary,indent=2)+'\n')
print('PASS: zero-source INITJCT, unshunted source factor/state, MODEINITTRAN transfer, first iteration-limit, identical-block replay')
