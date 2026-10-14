"""Offline invariant and receipt check. Recompute, do not regenerate on failure."""
from summarize import ROOT, build_summary, load, zipped, series


def verify(summary):
    expected = build_summary()
    assert summary == expected, 'summary drift from retained waveforms/traces'
    for variant in ['e1', 'e2', 'e3', 'e4']:
        assert load(f'{variant}-receipt.json') == summary[variant], variant
    assert summary['e1']['nativeConfiguredBypass'] == [0]
    assert summary['e1']['forcedOffFlags'] == [1]
    assert summary['e1']['nativeWaveformExactlyUnchanged']
    assert summary['baseline']['guards']['mosamp2']['passed']
    assert not summary['e2']['guards']['mosamp2']['passed']
    assert not summary['e2-first']['guards']['mosamp2']['passed']
    assert summary['e3']['guards']['mosamp2']['passed']
    for variant, data in summary.items():
        assert all(r['outcome'] == 'matched' for r in data['guards']['maxordRC'].values()), variant
        # Unchanged shared scorer and independent diagnostic must agree on pump max.
        row = load(f'{variant}.json')['rows']['k-13']
        assert row['worstSignal'] == 'tran i(vnin)'
        maximum = row['comparisons'][0]['metrics']['signals']['i(vnin)']['absoluteError']['max']
        assert maximum == data['pump']['maxAbs'], variant
        assert float(format(data['pump']['normalized'], '.3g')) == data['pump']['error'], variant
    assert summary['e4']['pump']['maxAbs'] == summary['baseline']['pump']['maxAbs']
    assert summary['e4']['pump']['early15_2nsMaxAbs'] < 0.01*summary['e4']['pump']['peak']
    baseline, e4 = zipped('baseline-waveforms.json.gz'), zipped('e4-waveforms.json.gz')
    changed = []
    for id in baseline:
        assert series(baseline[id], 'ngspice') == series(e4[id], 'ngspice')
        a, b = series(baseline[id], 'spiceTs'), series(e4[id], 'spiceTs')
        assert a['signals'] == b['signals']
        changed.extend((id, i) for i, (x, y) in enumerate(zip(a['grid'], b['grid'])) if x != y)
    assert changed == [('k-13', 132)], changed
    return True

if __name__ == '__main__':
    verify(load('summary.json'))
    print('E1-E4 receipts, unchanged guards, rejected-candidate losses, and single-corner E4 sensitivity verified')
