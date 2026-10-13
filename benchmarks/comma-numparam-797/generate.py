# SPDX-License-Identifier: MIT
"""Generate only self-authored controls; original corpus decks are never copied/edited."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
lists = [
    ('issue-1', 'p1=2,p2=3,p3=4'),
    ('issue-2', 'p1={2},p2={3},p3={4}'),
    ('issue-3', 'p1=2, p2=3, p3=4'),
    ('issue-4', 'p1={2}, p2={3},p3={4}'),
    ('issue-5', 'p1=2 p2=3,p3=4'),
    ('issue-6', 'p1={2},p2=3'),
    ('issue-7', 'p1=2 ,p2=3'),
    ('defaults', ''),
    ('plain-whitespace', 'p1=2 p2=3 p3=4'),
    ('braced-whitespace', 'p1={2} p2={3} p3={4}'),
    ('braced-comma-space', 'p1={2}, p2={3}, p3={4}'),
    ('braced-comma-tab', 'p1={2},\tp2={3},\tp3={4}'),
    ('explicit-first', 'p1={2}'),
    ('reordered-glued', 'p3={4},p2={3},p1={2}'),
    ('function-comma', 'p1={max(2,1)} p2={3} p3={4}'),
    ('unbraced-trailing', 'p1=2,'),
    ('unbraced-missing-value', 'p1= p2=3'),
]
(HERE / 'decks').mkdir(exist_ok=True)
matrix = []
for name, params in lists:
    path = HERE / 'decks' / (name + '.cir')
    path.write_text('comma numparam control\n* SPDX-License-Identifier: MIT\n'
                    '.subckt s o params: p1=1 p2=1 p3=1\n'
                    'I1 0 o {p1*100+p2*10+p3}\nR0 o 0 1\n.ends\n'
                    + 'X1 o s' + (' params: ' + params if params else '')
                    + '\n.op\n.end\n')
    matrix.append(dict(id=name, path=str(path.relative_to(HERE.parent.parent)),
                       purpose='Issue-listed list' if name.startswith('issue-') else 'Boundary control',
                       params=params))
for name in ['example01', 'example01_stringwriter', 'example01_without_params']:
    matrix.append(dict(id=name, path='benchmarks/corpus/corpus-h/fixtures/spicesharpparser/src/'
                       'SpiceSharpParser.IntegrationTests/Examples/Circuits/' + name + '.cir',
                       purpose='Unchanged MIT corpus-h fixture', params=None))
assert len(matrix) == 20
(HERE / 'matrix.json').write_text(json.dumps(matrix, indent=2) + '\n')
