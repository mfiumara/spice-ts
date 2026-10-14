"""Observation-only instrumentation of the verified ngspice-47 source archive."""
from pathlib import Path
import sys
root = Path(sys.argv[1])
p = root/'src/spicelib/devices/mos2/mos2load.c'
s = p.read_text()
marker = '                von = model->MOS2type * here->MOS2von;'
insert = '                if (ckt->CKTtime > 0 && ckt->CKTtime < 3.1e-9) fprintf(stderr, "PREDTRACE %.17g %s %ld %.17g %.17g %.17g\\n", ckt->CKTtime, (char *) here->MOS2name, (long) ckt->CKTmode, vgs, vds, vbs);\n'
assert s.count(marker) == 1
s = s.replace(marker, insert + marker)
marker = '            /*\n             *     store charge storage info for meyer\'s cap in lx table'
fields = ['qgs', 'qgd', 'qgb', 'qbs', 'qbd', 'cqgs', 'cqgd', 'cqgb', 'cqbs', 'cqbd', 'vgs', 'vds', 'vbs', 'capgs', 'capgd', 'capgb']
fmt = ' '.join(['MOS2TRACE %.17g %s %ld'] + ['%.17g']*len(fields)) + '\\n'
args = ', '.join(['ckt->CKTtime', '(char *) here->MOS2name', '(long) ckt->CKTmode'] + [f'*(ckt->CKTstate0 + here->MOS2{f})' for f in fields])
assert s.count(marker) == 1
s = s.replace(marker, f'            if (ckt->CKTtime > 0 && ckt->CKTtime < 3.1e-9) fprintf(stderr, "{fmt}", {args});\n' + marker)
p.write_text(s)
p = root/'src/spicelib/analysis/dctran.c'
s = p.read_text()
marker = '        converged = NIiter(ckt,ckt->CKTtranMaxIter);'
assert s.count(marker) == 1
s = s.replace(marker, '        int trace_before = ckt->CKTstat->STATnumIter;\n' + marker + '\n        fprintf(stderr, "STEPTRACE %.17g %.17g %d %d %d\\n", ckt->CKTtime, ckt->CKTdelta, ckt->CKTorder, ckt->CKTstat->STATnumIter - trace_before, converged);')
p.write_text(s)
