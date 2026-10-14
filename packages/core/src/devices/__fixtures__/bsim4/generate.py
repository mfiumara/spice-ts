#!/usr/bin/env python3
"""Reproduce static BSIM4 oracles. Run from the repo root through spice-heavy."""
from dataclasses import dataclass
from pathlib import Path
import argparse
import hashlib
import json
import math
import platform
import re
import subprocess
import tempfile
import os

ROOT = Path(__file__).resolve().parents[6]
HERE = Path(__file__).resolve().parent
F = ROOT / 'benchmarks/corpus/corpus-f/fixtures'


@dataclass(frozen=True)
class Case:
    name: str
    polarity: str
    card: str
    geometry: str
    source: str | None
    source_model: str | None


def model(path, name):
    text = path.read_text()
    match = re.search(r'^\.model\s+' + re.escape(name) + r'\s+(.*)$', text, re.I | re.M)
    if not match:
        raise ValueError(f'Model {name} not found in {path}')
    return '.model DUT ' + match[1]


def cases():
    pair = F / 'examples/mos/nmos_pmos_BSIM482.sp'
    bins = F / 'tests/regression/model/binning-1.cir'
    gain = F / 'examples/various/gain_stage.cir'
    return [
        Case('bsim482-nmos', 'n', model(pair, 'n1'), 'W=1u L=0.35u Pd=1.5u Ps=1.5u ad=1.5p as=1.5p', str(pair.relative_to(ROOT)), 'n1'),
        Case('bsim482-pmos', 'p', model(pair, 'p1'), 'W=2.5u L=0.35u Pd=3u Ps=3u ad=2.5p as=2.5p', str(pair.relative_to(ROOT)), 'p1'),
        Case('binning-vth07', 'n', model(bins, 'nmos0v7'), 'L=5u W=5u', str(bins.relative_to(ROOT)), 'nmos0v7'),
        Case('binning-vth09', 'n', model(bins, 'nmos0v9'), 'L=5u W=6u', str(bins.relative_to(ROOT)), 'nmos0v9'),
        Case('gain-v43', 'n', model(gain, 'N1'), 'L=1u W=4u', str(gain.relative_to(ROOT)), 'N1'),
        # Original project probes, not copied from the separately GPL-licensed G deck.
        # The minimal NMOS has the same default model/nominal geometry as that deck.
        Case('minimal-nmos', 'n', '.model DUT NMOS LEVEL=54', 'L=0.15u W=0.65u', None, None),
        Case('minimal-pmos', 'p', '.model DUT PMOS LEVEL=14', 'L=0.15u W=0.65u', None, None),
    ]


def parse_raw(raw):
    text = raw.read_text()
    if 'Flags: real' not in text:
        raise ValueError('Expected real vectors')
    count_match = re.search(r'No. Variables:\s+(\d+)', text)
    point_match = re.search(r'No. Points:\s+(\d+)', text)
    if not count_match or not point_match:
        raise ValueError('Missing variable/point count')
    count = int(count_match[1])
    points = int(point_match[1])
    variables, values = text.split('Variables:\n', 1)[1].split('Values:\n', 1)
    names = [line.split()[1].lower() for line in variables.splitlines() if line.strip()]
    lines = [line.split() for line in values.splitlines() if line.strip()]
    if len(names) != count or len(lines) != count * points:
        raise ValueError('Invalid variable/point counts')
    numbers = [float(line[-1]) for line in lines]
    if not all(math.isfinite(x) for x in numbers) or len(set(names)) != count:
        raise ValueError('Non-finite or duplicate raw vectors')
    for point in range(points):
        if lines[point * count][0] != str(point):
            raise ValueError('Invalid point index')
    return {name: numbers[i::count] for i, name in enumerate(names)}


def parse_op(raw):
    vectors = parse_raw(raw)
    if any(len(values) != 1 for values in vectors.values()):
        raise ValueError('Expected one OP point')
    return {name: values[0] for name, values in vectors.items()}


def pair_dc(out):
    original = F / 'examples/mos/nmos_pmos_BSIM482.sp'
    lines = []
    commands = []
    for line in original.read_text().splitlines():
        if line.strip().startswith('plot '):
            lines.append('* Output-only plot omitted by reference instrumentation')
        elif line.strip() == '.control':
            lines += [line, 'set filetype=ascii', 'set numdgt=17']
        elif line.strip().startswith('dc '):
            commands.append(line.strip())
            lines += [line, f'write dc-{len(commands)}.raw all']
        elif line.strip() == '.endc':
            lines += ['quit', line]
        else:
            lines.append(line)
    deck = '\n'.join(lines) + '\n'
    (out / 'pair-dc.cir').write_text(deck)
    with tempfile.TemporaryDirectory(prefix='bsim4-dc-', dir=os.environ.get('TMPDIR')) as tmp:
        work = Path(tmp)
        (work / 'input.cir').write_text(deck)
        result = subprocess.run(['ngspice', '-n', '-b', 'input.cir'], cwd=work,
                                text=True, capture_output=True, timeout=60)
        log = result.stdout + result.stderr
        (out / 'pair-dc.log').write_text(log)
        if result.returncode or re.search(r'^\s*(error|fatal)\b', log, re.I | re.M):
            raise RuntimeError(f'Pair DC failed: {log}')
        records = []
        for i, command in enumerate(commands, 1):
            raw = work / f'dc-{i}.raw'
            vectors = parse_raw(raw)
            (out / f'pair-dc-{i}.raw').write_bytes(raw.read_bytes())
            records.append({'command': command, 'vectors': vectors})
    return {'sourcePath': str(original.relative_to(ROOT)),
            'sourceSha256': hashlib.sha256(original.read_bytes()).hexdigest(),
            'deckSha256': hashlib.sha256(deck.encode()).hexdigest(), 'analyses': records}


def run(deck, destination):
    # All invocations belong to the single guarded parent process, run serially.
    with tempfile.TemporaryDirectory(prefix='bsim4-', dir=os.environ.get('TMPDIR')) as tmp:
        work = Path(tmp)
        netlist = work / 'input.cir'
        netlist.write_text(deck)
        result = subprocess.run(['ngspice', '-n', '-b', str(netlist)], cwd=work,
                                text=True, capture_output=True, timeout=60)
        log = result.stdout + result.stderr
        destination.with_suffix('.log').write_text(log)
        if result.returncode or re.search(r'^\s*(error|fatal)\b', log, re.I | re.M):
            raise RuntimeError(f'ngspice failed for {destination.name}: {log}')
        raw = work / 'op.raw'
        data = parse_op(raw)
        destination.with_suffix('.raw').write_bytes(raw.read_bytes())
        return data


def grid_deck(case):
    sign = 1 if case.polarity == 'n' else -1
    points = []
    lines = [f'BSIM4 static oracle {case.name}', '.temp 27', case.card]
    for body in [0, -0.5, -1.0]:
        for gate in [-0.2, 0, 0.4, 0.8, 1.2, 1.8]:
            for drain in [-0.1, 0, 0.05, 0.4, 1.2, 1.8]:
                i = len(points)
                vg, vd, vb = sign * gate, sign * drain, sign * body
                lines += [f'M{i} d{i} g{i} 0 b{i} DUT {case.geometry}',
                          f'VD{i} d{i} 0 {vd:g}', f'VG{i} g{i} 0 {vg:g}', f'VB{i} b{i} 0 {vb:g}']
                points.append({'instance': f'm{i}', 'vgs': vg, 'vds': vd, 'vbs': vb})
    lines += ['.control', 'set filetype=ascii', 'set numdgt=17',
              'save ' + ' '.join(f'@m{i}[{quantity}]' for i in range(len(points)) for quantity in ['id', 'gm', 'gds', 'gmbs']),
              'save ' + ' '.join(f'i(vd{i})' for i in range(len(points))),
              'op', 'write op.raw all', 'quit', '.endc', '.end', '']
    return '\n'.join(lines), points


def generate(out):
    out.mkdir(parents=True, exist_ok=True)
    banner = subprocess.check_output(['ngspice', '--version'], text=True)
    if 'ngspice-47' not in banner:
        raise RuntimeError('Reference requires ngspice-47, not an unpinned version')
    (out / 'ngspice-version.txt').write_text(banner)
    records = []
    for case in cases():
        deck, points = grid_deck(case)
        stem = out / case.name
        stem.with_suffix('.cir').write_text(deck)
        values = run(deck, stem)
        for i, point in enumerate(points):
            point.update({q: values[f'i(@m{i}[id])' if q == 'id' else f'@m{i}[{q}]']
                          for q in ['id', 'gm', 'gds', 'gmbs']})
            point['drainTerminalCurrent'] = -values[f'i(vd{i})']
        record = {'name': case.name, 'polarity': case.polarity, 'modelCard': case.card,
                  'geometry': case.geometry, 'temperatureC': 27, 'sourcePath': case.source,
                  'sourceModel': case.source_model, 'deckSha256': hashlib.sha256(deck.encode()).hexdigest(),
                  'points': points}
        if case.source:
            record['sourceSha256'] = hashlib.sha256((ROOT / case.source).read_bytes()).hexdigest()
        records.append(record)
    # Instrument the original regression in place, preserving all circuit/model
    # bytes and its native mismatch assertions/exit status. This is not a rewrite.
    original = F / 'tests/regression/model/binning-1.cir'
    deck = original.read_text().replace('\nop\n', '\nset filetype=ascii\nset numdgt=17\nop\nwrite op.raw all\n', 1)
    (out / 'binning-op.cir').write_text(deck)
    op = run(deck, out / 'binning-op')
    (out / 'reference.json').write_text(json.dumps({
        'schemaVersion': 1, 'engine': 'ngspice-47',
        'ngspiceSourceRevision': 'a80f6e3e95d51534905b1f23410a951802666656',
        'corpusFSourceRevision': '3ef069fb1f04177a153f342a32d941fc20ff047e',
        'environment': {'system': platform.system(), 'release': platform.release(), 'machine': platform.machine()},
        'command': 'spice-heavy python3 packages/core/src/devices/__fixtures__/bsim4/generate.py',
        'units': {'vgs': 'V', 'vds': 'V', 'vbs': 'V', 'id': 'A', 'gm': 'S', 'gds': 'S', 'gmbs': 'S', 'drainTerminalCurrent': 'A'},
        'currentConvention': 'id/gm/gds/gmbs are native @M vectors, not polarity-normalized by this script; drainTerminalCurrent=-i(VD) is signed into the physical drain terminal, including junction/leakage contributions.',
        'cases': records,
        'pairDc': pair_dc(out),
        'binningOp': {'sourcePath': str(original.relative_to(ROOT)),
                      'sourceSha256': hashlib.sha256(original.read_bytes()).hexdigest(),
                      'deckSha256': hashlib.sha256(deck.encode()).hexdigest(), 'vectors': op},
    }, indent=2) + '\n')
    print(f'Generated {sum(len(c["points"]) for c in records)} bias points in {len(records)} cases; binning OP {op}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=HERE / 'reference')
    generate(parser.parse_args().output.resolve())
