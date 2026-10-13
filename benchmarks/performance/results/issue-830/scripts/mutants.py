import subprocess, shutil, sys
import os
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../..'))
f = root + '/packages/core/src/devices/mosfet.ts'
orig = open(f).read()
mutants = [
    ('(reverse ? prevD : prevS)', '(reverse ? prevS : prevD)'),
    ('const reverse = !(previousVds >= 0);', 'const reverse = previousVds <= 0;'),
    ('if (delta === 0) return Math.min(terminalScale, 1);', 'if (delta === 0) return 1;'),
    ('state[stateBases[m] + STATE_VON],', 'state[stateBases[m] + STATE_VBS],'),
    ('previous, candidate, nodes[q], nodes[q + 1], nodes[q + 2],\n        polarity[m]', 'previous, candidate, nodes[q], nodes[q + 1], nodes[q + 1],\n        polarity[m]'),
    ('const candS = nS >= 0 ? candidate[nS] : 0;', 'const candS = nS > 0 ? candidate[nS] : 0;'),
    ('largestStep > MAX_NEWTON_TERMINAL_STEP\n    ? MAX_NEWTON_TERMINAL_STEP / largestStep', 'largestStep >= MAX_NEWTON_TERMINAL_STEP * 2\n    ? MAX_NEWTON_TERMINAL_STEP / largestStep'),
]
try:
    for old, new in mutants:
        assert orig.count(old) == 1, old
        open(f, 'w').write(orig.replace(old, new))
        r = subprocess.run(['pnpm', '-C', root + '/packages/core', 'exec', 'vitest', 'run', 'src/devices/mosfet-step-limit-830.test.ts'], capture_output=True, text=True)
        killed = r.returncode != 0
        print(('KILLED ' if killed else 'SURVIVED ') + old.splitlines()[0] + ' -> ' + new.splitlines()[0])
finally:
    open(f, 'w').write(orig)
