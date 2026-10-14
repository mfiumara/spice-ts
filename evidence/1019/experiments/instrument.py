"""Apply observation hooks and an environment-controlled MOS2-only bypass switch.
Run on a clean pinned ngspice tree after ../instrument-native.py.
No upstream sources/binaries are redistributed.
"""
from pathlib import Path
import sys

root = Path(sys.argv[1])
p = root / 'src/spicelib/devices/mos2/mos2load.c'
s = p.read_text()
s = s.replace('fprintf(stderr, "MOS2TRACE', 'if (getenv("MOS2_TRACE")) fprintf(stderr, "MOS2TRACE')

def insert(marker, text):
    global s
    assert s.count(marker) == 1, marker
    s = s.replace(marker, text + marker)

insert('    /*  loop through all the MOS2 device models */',
       '    if (ckt->CKTtime >= 5e-9 && ckt->CKTtime <= 5.03e-9) fprintf(stderr, "CONFIGTRACE %.17g %d %d\\n", ckt->CKTtime, ckt->CKTbypass, getenv("MOS2_NO_BYPASS") != NULL);\n')
insert('                /* now lets see if we can bypass (ugh) */',
       '                if (ckt->CKTtime >= 5e-9 && ckt->CKTtime <= 5.03e-9) fprintf(stderr, "RAWTRACE %.17g %s %ld %.17g %.17g %.17g\\n", ckt->CKTtime, (char *)here->MOS2name, (long)ckt->CKTmode, vgs, vds, vbs);\n')
marker = '(ckt->CKTbypass) )'
assert s.count(marker) == 1
s = s.replace(marker, '(ckt->CKTbypass && !getenv("MOS2_NO_BYPASS")) )')
insert('                    goto bypass;',
       '                    fprintf(stderr, "BYPASSTRACE %.17g %s\\n", ckt->CKTtime, (char *)here->MOS2name);\n')
insert('            /* now all the preliminaries are over - we can start doing the',
       '            if (ckt->CKTtime >= 5e-9 && ckt->CKTtime <= 5.03e-9) fprintf(stderr, "LIMITTRACE %.17g %s %d %.17g %.17g %.17g\\n", ckt->CKTtime, (char *)here->MOS2name, Check, vgs, vds, vbs);\n')
p.write_text(s)
p = root / 'src/spicelib/devices/mos2/mos2conv.c'
s = p.read_text()
marker = '            /*\n             *  check convergence'
assert s.count(marker) == 1
s = s.replace(marker, '            if (ckt->CKTtime >= 5e-9 && ckt->CKTtime <= 5.03e-9) fprintf(stderr, "CONVTRACE %.17g %s %.17g %.17g %.17g %.17g %.17g %.17g\\n", ckt->CKTtime, (char *)here->MOS2name, cdhat, here->MOS2cd, cbhat, here->MOS2cbs+here->MOS2cbd, ckt->CKTreltol*MAX(fabs(cdhat),fabs(here->MOS2cd))+ckt->CKTabstol, ckt->CKTreltol*MAX(fabs(cbhat),fabs(here->MOS2cbs+here->MOS2cbd))+ckt->CKTabstol);\n' + marker)
p.write_text(s)
p = root / 'src/maths/ni/niiter.c'
s = p.read_text()
marker = '            if ((ckt->CKTnoncon == 0) && (iterno != 1))'
assert s.count(marker) == 1
s = s.replace(marker, '            int trace_load_noncon = ckt->CKTnoncon;\n' + marker)
marker = '                ckt->CKTnoncon = 1;'
assert s.count(marker) == 1
s = s.replace(marker, marker + '\n            if (ckt->CKTtime >= 5e-9 && ckt->CKTtime <= 5.03e-9) fprintf(stderr, "NIITERTRACE %.17g %d %ld %d %d\\n", ckt->CKTtime, iterno, (long)ckt->CKTmode, trace_load_noncon, ckt->CKTnoncon);')
p.write_text(s)
p = root / 'src/spicelib/analysis/dctran.c'
s = p.read_text()
for label in ['STEPTRACE', 'LTETRACE']:
    s = s.replace(f'fprintf(stderr, "{label}', f'if (getenv("MOS2_TRACE")) fprintf(stderr, "{label}')
p.write_text(s)
