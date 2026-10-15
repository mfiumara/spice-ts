#!/usr/bin/env python3
"""Re-extract factual reference numbers; never store source HTML or figures.

Tony R. Kuphaldt, Lessons in Electric Circuits, CC BY (see each chapter
footer). Circuit strings below are our normalized reconstructions of component
values/connectivity. PRE indexes are zero-based in the cited HTML chapter.
Review upstream changes before accepting changed page hashes or numbers.
"""
import datetime
import hashlib
import html
import json
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parent
BASE = 'https://www.ibiblio.org/kuphaldt/electricCircuits/'
# id, chapter, circuit PRE, result PREs, reconstructed element/analysis lines
SPECS = [
    ('dc-single-resistor', 'DC/DC_2.html', 4, [5, 6], 'V 1 0 DC 10\nR 1 0 5\n.op'),
    ('dc-series', 'DC/DC_5.html', 0, [1], 'V1 1 0 DC 9\nR1 1 2 3k\nR2 2 3 10k\nR3 3 0 5k\n.dc V1 9 9 1'),
    ('dc-parallel', 'DC/DC_5.html', 2, [3, 4], 'V1 1 0 DC 9\nR1 2 0 10k\nR2 3 0 2k\nR3 4 0 1k\nVR1 1 2 DC 0\nVR2 1 3 DC 0\nVR3 1 4 DC 0\n.dc V1 9 9 1'),
    ('dc-two-source', 'DC/DC_10.html', 0, [1], 'V1 1 0 DC 28\nV2 3 0 DC 7\nR1 1 2 4\nR2 2 0 2\nR3 2 3 1\n.dc V1 28 28 1'),
    ('dc-wheatstone', 'DC/DC_10.html', 3, [4], 'V1 1 0 DC 24\nR1 1 2 150\nR2 1 3 50\nR3 2 3 100\nR4 2 0 300\nR5 3 0 250\n.dc V1 24 24 1'),
    ('ac-series-rl', 'AC/AC_3.html', 0, [1], 'V1 1 0 AC 10\nR1 1 2 5\nL1 2 0 10m\n.ac lin 1 60 60'),
    ('ac-series-rc', 'AC/AC_4.html', 0, [1], 'V1 1 0 AC 10\nR1 1 2 5\nC1 2 0 100u\n.ac lin 1 60 60'),
    ('ac-series-rlc', 'AC/AC_5.html', 0, [1], 'V1 1 0 AC 120\nR1 1 2 250\nL1 2 3 650m\nC1 3 0 1.5u\n.ac lin 1 60 60'),
    ('ac-parallel-rlc', 'AC/AC_5.html', 2, [3], 'V1 1 0 AC 120\nVI 1 2 AC 0\nVIR 2 3 AC 0\nVIL 2 4 AC 0\nRBOGUS 4 5 1e-12\nVIC 2 6 AC 0\nR1 3 0 250\nL1 5 0 650m\nC1 6 0 1.5u\n.ac lin 1 60 60'),
    ('ac-mixed-rlc', 'AC/AC_5.html', 4, [5, 6, 7, 8], 'V1 1 0 AC 120\nVIT 1 2 AC 0\nVILC 3 4 AC 0\nVIR 3 6 AC 0\nC1 2 3 4.7u\nL 4 5 650m\nC2 5 0 1.5u\nR 6 0 470\n.ac lin 1 60 60'),
    ('ac-lc-ladder', 'Ref/REF_7.html', 73, [74], 'V1 2 1 AC 24\nV2 1 0 DC 24\nRLOAD 4 0 1k\nL1 2 3 100m\nL2 3 4 250m\nC1 3 0 100u\n.ac lin 30 500 15k'),
    ('dc-intro-network', 'Ref/REF_7.html', 3, [6], 'V1 1 0 DC 15\nR1 1 0 2.2k\nR2 1 2 3.3k\nR3 2 0 150\n.op'),
    ('tran-rc-delay', 'Ref/REF_7.html', 66, [67], 'V1 1 0 DC 10\nC1 1 2 47u IC=0\nC2 1 2 22u IC=0\nR1 2 0 3.3k\n.tran .05 1 uic'),
    ('ac-multiple-source', 'Ref/REF_7.html', 76, [77], 'V1 1 0 AC 55 0\nV2 4 0 AC 43 25\nL1 1 2 450m\nC1 2 0 330u\nL2 2 3 150m\nRBOGUS 3 4 1e-12\n.ac lin 1 30 30'),
    ('ac-phase-shift', 'Ref/REF_7.html', 78, [79], 'V1 1 0 AC 4\nRSHUNT1 1 2 1\nRSHUNT2 1 3 1\nL1 2 0 1\nR1 3 0 6.3k\n.ac lin 1 1000 1000'),
    ('ac-three-winding-transformer', 'Ref/REF_7.html', 80, [81], 'V1 1 0 AC 120\nRBOGUS0 1 6 1e-3\nL1 6 0 100\nL2 2 4 1\nL3 3 5 25\nK1 L1 L2 .999\nK2 L2 L3 .999\nK3 L1 L3 .999\nR1 2 4 1000\nR2 3 5 1000\nRBOGUS1 5 0 1e10\nRBOGUS2 4 0 1e10\n.ac lin 1 60 60'),
    ('dc-common-base-bjt', 'Ref/REF_7.html', 84, [85], 'VSUPPLY 1 0 DC 24\nVIN 0 4 DC 0\nRC 1 2 800\nRE 3 4 100\nQ1 2 0 3 MOD1\n.model MOD1 NPN BF=50\n.dc VIN 0 5 .1'),
    ('dc-inverting-opamp', 'Ref/REF_7.html', 89, [90], 'V1 2 0 DC 0\nE 3 0 0 1 999k\nR1 3 1 3.29k\nR2 1 2 1.18k\n.dc V1 0 3.5 .05'),
    ('dc-noninverting-opamp', 'Ref/REF_7.html', 91, [92], 'V1 2 0 DC 5\nRBOGUS 2 0 10k\nE 3 0 2 1 999k\nR1 3 1 20k\nR2 1 0 10k\n.op'),
    ('dc-instrumentation-amplifier', 'Ref/REF_7.html', 93, [94], 'V1 1 0 DC 0\nRBOGUS1 1 0 9e12\nV2 4 0 DC 5\nRBOGUS2 4 0 9e12\nE1 3 0 1 2 999k\nE2 6 0 4 5 999k\nE3 9 0 8 7 999k\nRLOAD 9 0 10k\nR1 2 3 10k\nRGAIN 2 5 10k\nR2 5 6 10k\nR3 3 7 10k\nR4 7 9 10k\nR5 6 8 10k\nR6 8 0 10k\n.dc V1 0 10 1'),
]
NUMBER = r'[+-]?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?'


def point(signal, coordinate, token, analysis):
    mantissa, _, exponent = token.lower().partition('e')
    decimals = len(mantissa.split('.')[1]) if '.' in mantissa else 0
    phase = signal.startswith(('vp(', 'ip('))
    return dict(signal=signal.lower(), coordinate=coordinate,
                publishedToken=token, published=float(token),
                roundingHalfWidth=0.5 * 10 ** (int(exponent or 0) - decimals),
                digitizationUncertainty=0,
                unit='degree' if phase else 'A' if signal.startswith('i') else 'V',
                quantity='phase' if phase else 'magnitude' if analysis == 'ac' else 'real')


def extract(block, analysis):
    points = []
    if analysis == 'op':
        for node, token in re.findall(r'\(\s*(\d+)\)\s*(' + NUMBER + ')', block):
            points.append(point('v(' + node + ')', 0, token, analysis))
        # Single-resistor source-current output has no node table.
        m = re.search(r'^v\s+(' + NUMBER + r')\s*$', block, re.M)
        if m:
            points.append(point('i(v)', 0, m[1], analysis))
        return points
    signals = []
    for line in block.splitlines():
        if re.match(r'^\s*(?:freq|time|v1|vin)\s', line, re.I):
            signals = re.findall(r'(?:vp?|ip?)\([^)]*\)', line.lower())
            continue
        tokens = line.split()
        if signals and len(tokens) == len(signals) + 1 and all(re.fullmatch(NUMBER, t) for t in tokens):
            points.extend(point(s, float(tokens[0]), t, analysis) for s, t in zip(signals, tokens[1:]))
    return points


def main():
    cache = {}
    cases = []
    for ident, chapter, circuit_pre, result_pres, reconstruction in SPECS:
        if chapter not in cache:
            raw = urllib.request.urlopen(BASE + chapter, timeout=60).read()
            text = raw.decode()
            if 'CC BY' not in text:
                raise ValueError('Source licence footer changed: ' + chapter)
            blocks = [html.unescape(re.sub(r'<[^>]+>', '', s)).strip()
                      for s in re.findall(r'<pre[^>]*>(.*?)</pre>', text, re.S | re.I)]
            cache[chapter] = (hashlib.sha256(raw).hexdigest(), blocks)
        page_hash, blocks = cache[chapter]
        analysis = 'ac' if '.ac ' in reconstruction else 'tran' if '.tran ' in reconstruction else 'dc' if '.dc ' in reconstruction else 'op'
        points = [p for b in result_pres for p in extract(blocks[b], analysis)]
        if not points:
            raise ValueError('No published points: ' + ident)
        # Repeated branch quantities in mixed RLC component tables are one observation.
        points = list({(p['signal'], p['coordinate']): p for p in points}.values())
        assumptions = ['Original node numbers, polarity and ideal component values retained; names capitalized.',
                       'Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.',
                       'No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.']
        if analysis == 'ac':
            assumptions.append('Remove incomplete trailing SIN token from AC-only voltage sources; retain AC amplitude and phase.')
        if analysis == 'dc':
            assumptions.append('Fill omitted initial source DC value with sweep start; published .dc sweep is unchanged.')
        if ident == 'dc-common-base-bjt':
            assumptions.append('BF=50 as published; all unspecified NPN model parameters use engine defaults. Historical SPICE2g6 defaults may differ; comparison is not a measured device validation.')
        exclusion = None
        if ident == 'dc-intro-network':
            exclusion = 'Netlist says R3=150 ohm but explanatory prose says 150 kohm. Use explicit netlist for diagnostic runs only; exclude from totals.'
        if analysis == 'tran':
            assumptions.append('Retain UIC and both capacitor IC=0 cards. Linear interpolation at every published time; historical integration error is not covered by printed rounding.')
        deck = '* Reconstructed published case: ' + ident + '\n' + reconstruction + '\n.end\n'
        (ROOT / (ident + '.cir')).write_text(deck)
        cases.append(dict(id=ident, analysis=analysis, netlist=ident + '.cir',
                          netlistSha256=hashlib.sha256(deck.encode()).hexdigest(),
                          source=dict(url=BASE + chapter, retrieved=datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
                                      author='Tony R. Kuphaldt', title='Lessons in Electric Circuits',
                                      example=blocks[circuit_pre].splitlines()[0], circuitPre=circuit_pre, resultPres=result_pres,
                                      pageSha256=page_hash, licence='CC-BY-4.0; chapter footer links to licence appendix. Attribution: Tony R. Kuphaldt, Lessons in Electric Circuits. Adapted component reconstructions; changes in assumptions. No endorsement; no figures/PDFs/HTML redistributed.',
                                      licenceUrl='https://creativecommons.org/licenses/by/4.0/',
                                      licenceAppendix='https://www.ibiblio.org/kuphaldt/electricCircuits/Ref/REF_A3.html'),
                          referenceKind='published-simulation', measuredReference=None,
                          extraction='HTML PRE numeric table transcription; zero-based PRE locations; uncertainty is half of final displayed digit. No plot digitization.',
                          assumptions=assumptions, exclusion=exclusion, points=points))
    assert len(cases) == 20 and len({c['id'] for c in cases}) == 20
    (ROOT / 'manifest.json').write_text(json.dumps(dict(schemaVersion=1, cases=cases), indent=2) + '\n')
    print(json.dumps(dict(cases=len(cases), points=sum(len(c['points']) for c in cases), chapters=len(cache), excluded=sum(bool(c['exclusion']) for c in cases))))


if __name__ == '__main__':
    main()
