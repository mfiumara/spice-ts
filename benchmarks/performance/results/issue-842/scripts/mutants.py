"""Issue #842: mutants of the MOS1 load cache; each must fail the #842 test.

    python3 benchmarks/performance/results/issue-842/scripts/mutants.py
"""
import os
import subprocess

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../..'))
f = root + '/packages/core/src/devices/mosfet.ts'
orig = open(f).read()
mutants = [
    # invalidateLoad forgets nothing (every per-device state write goes stale-unnoticed).
    ('invalidateLoad is a no-op', 'if (this.loads !== undefined) this.loads[(stateBase / STATE_STRIDE) * LOAD_STRIDE + LOAD_VD] = NaN;',
     'if (this.loads !== undefined) this.loads[(stateBase / STATE_STRIDE) * LOAD_STRIDE + LOAD_VG] = this.loads[(stateBase / STATE_STRIDE) * LOAD_STRIDE + LOAD_VG];'),
    # Constants change does not empty the cache. applyTemperature also writes
    # lastVon (which invalidates the row), so this one is expected to survive.
    ('constants change keeps the cache', 'if (loads === undefined || this.loadsEpoch !== constantsEpoch) {', 'if (loads === undefined) {'),
    # Key misses an input (both the === and the Object.is test).
    ('key without vG', 'kD === vD && kG === vG && kS === vS && kB === vB\n        && kVbs === inVbs && kVbd === inVbd && kGmin === gmin\n        && Object.is(kD, vD) && Object.is(kG, vG) && Object.is(kS, vS) && Object.is(kB, vB)\n        && Object.is(kVbs, inVbs) && Object.is(kVbd, inVbd) && Object.is(kGmin, gmin)\n',
     'kD === vD && kS === vS && kB === vB\n        && kVbs === inVbs && kVbd === inVbd && kGmin === gmin\n        && Object.is(kD, vD) && Object.is(kS, vS) && Object.is(kB, vB)\n        && Object.is(kVbs, inVbs) && Object.is(kVbd, inVbd) && Object.is(kGmin, gmin)\n'),
    ('key without gmin', 'kD === vD && kG === vG && kS === vS && kB === vB\n        && kVbs === inVbs && kVbd === inVbd && kGmin === gmin\n        && Object.is(kD, vD) && Object.is(kG, vG) && Object.is(kS, vS) && Object.is(kB, vB)\n        && Object.is(kVbs, inVbs) && Object.is(kVbd, inVbd) && Object.is(kGmin, gmin)\n',
     'kD === vD && kG === vG && kS === vS && kB === vB\n        && kVbs === inVbs && kVbd === inVbd\n        && Object.is(kD, vD) && Object.is(kG, vG) && Object.is(kS, vS) && Object.is(kB, vB)\n        && Object.is(kVbs, inVbs) && Object.is(kVbd, inVbd)\n'),
    ('key without previous vbs/vbd', 'kD === vD && kG === vG && kS === vS && kB === vB\n        && kVbs === inVbs && kVbd === inVbd && kGmin === gmin\n        && Object.is(kD, vD) && Object.is(kG, vG) && Object.is(kS, vS) && Object.is(kB, vB)\n        && Object.is(kVbs, inVbs) && Object.is(kVbd, inVbd) && Object.is(kGmin, gmin)\n',
     'kD === vD && kG === vG && kS === vS && kB === vB\n        && kGmin === gmin\n        && Object.is(kD, vD) && Object.is(kG, vG) && Object.is(kS, vS) && Object.is(kB, vB)\n        && Object.is(kGmin, gmin)\n'),
    # Signed zeros treated as equal.
    ('signed zeros compare equal', '        && Object.is(kD, vD) && Object.is(kG, vG) && Object.is(kS, vS) && Object.is(kB, vB)\n        && Object.is(kVbs, inVbs) && Object.is(kVbd, inVbd) && Object.is(kGmin, gmin)\n', ''),
    # A cached companion value is stored or read wrong.
    ('cached Ieq stores ID', '        loads[c + LOAD_IEQ] = Ieq;\n', '        loads[c + LOAD_IEQ] = ID;\n'),
    ('cached gds read from gm', '        gds = loads[c + LOAD_GDS];\n', '        gds = loads[c + LOAD_GM];\n'),
    # Key records the limited instead of the previous junction voltages.
    ('key stores limited vbs/vbd', '        loads[c + LOAD_LAST_VBS] = inVbs;\n        loads[c + LOAD_LAST_VBD] = inVbd;\n', '        loads[c + LOAD_LAST_VBS] = lastVbs;\n        loads[c + LOAD_LAST_VBD] = lastVbd;\n'),
]
try:
    for label, old, new in mutants:
        assert orig.count(old) == 1, old
        open(f, 'w').write(orig.replace(old, new))
        r = subprocess.run(
            ['pnpm', '-C', root + '/packages/core', 'exec', 'vitest', 'run', 'src/devices/mosfet-load-cache-842.test.ts'],
            capture_output=True, text=True)
        print(('KILLED   ' if r.returncode != 0 else 'SURVIVED ') + label)
finally:
    open(f, 'w').write(orig)
