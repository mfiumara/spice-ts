#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Add observation-only NIiter tracing to a pristine pinned ngspice-47 checkout."""
import hashlib
from pathlib import Path
import sys

source = Path(sys.argv[1])
p = source / 'src/maths/ni/niiter.c'
original = p.read_text()
assert hashlib.sha256(p.read_bytes()).hexdigest() == '85ed2001b0f4589e43a1e4d11f1fafc8a30f90d25d8ad361efe92c51a8e023a1'
helper = r'''
#include "ngspice/inpdefs.h"
#include "../../spicelib/devices/dio/diodefs.h"
int trace917Attempt = 0;
/* Observation only. No matrix allocation, writes or state changes. */
static void trace917(CKTcircuit *ckt, const char *stage, int iteration, int error) {
    static int dcserial = 0, transerial = 0;
    int type = INPtypelook("Diode"), ids[3], r, c, k;
    DIOmodel *model;
    DIOinstance *d;
    if (!getenv("TRACE917") || type < 0) return;
    if (ckt->CKTmode & MODETRAN) { if (transerial++ > 3000) return; }
    else { if (dcserial++ > 30000) return; }
    for (model = (DIOmodel *)ckt->CKThead[type]; model; model = DIOnextModel(model)) {
        for (d = DIOinstances(model); d; d = DIOnextInstance(d)) {
            if (strcmp(d->DIOname, "d183") && strcmp(d->DIOname, "d1")) continue;
            ids[0] = d->DIOposPrimeNode; ids[1] = d->DIOnegNode; ids[2] = d->DIOposNode;
            fprintf(stderr, "N917 {\"attempt\":%d,", trace917Attempt);
            fprintf(stderr, "N917 {\"stage\":\"%s\",\"iteration\":%d,\"error\":%d,\"mode\":%ld,\"ni\":%d,\"time\":%.17g,\"dt\":%.17g,\"scale\":%.17g,\"diag\":%.17g,\"gmin\":%.17g,\"noncon\":%d,\"ids\":[%d,%d,%d],\"old\":[", stage, iteration, error, ckt->CKTmode, ckt->CKTniState, ckt->CKTtime, ckt->CKTdelta, ckt->CKTsrcFact, ckt->CKTdiagGmin, ckt->CKTgmin, ckt->CKTnoncon, ids[0],ids[1],ids[2]);
            for (k=0;k<3;k++) fprintf(stderr,"%s%.17g", k?",":"",ckt->CKTrhsOld[ids[k]]);
            fprintf(stderr,"],\"rhs\":[");
            for(k=0;k<3;k++) fprintf(stderr,"%s%.17g",k?",":"",ckt->CKTrhs[ids[k]]);
            fprintf(stderr,"],\"state0\":[");
            for(k=0;k<8;k++) fprintf(stderr,"%s%.17g",k?",":"",ckt->CKTstate0[d->DIOstate+k]);
            fprintf(stderr,"],\"state1\":[");
            for(k=0;k<8;k++) fprintf(stderr,"%s%.17g",k?",":"",ckt->CKTstate1[d->DIOstate+k]);
            fprintf(stderr,"],\"matrix\":[");
            for(r=0;r<3;r++) for(c=0;c<3;c++) {
                SMPelement *e = SMPfindElt(ckt->CKTmatrix,ids[r],ids[c],0);
                fprintf(stderr,"%s%.17g",r||c?",":"",e?*(double *)e:0.0);
            }
            fprintf(stderr,"]}\n");
        }
    }
}
'''
assert original.count('            error = CKTload(ckt);') == 1
text = original.replace('/* Limit the number', helper + '\n/* Limit the number', 1)
text = text.replace('N917 {\\"stage\\"', '\\"stage\\"')
text = text.replace('            error = CKTload(ckt);', '            trace917(ckt, "before", iterno+1, 0);\n            error = CKTload(ckt);\n            trace917(ckt, "loaded", iterno+1, error);', 1)
text = text.replace('                ckt->CKTstat->STATreorderTime +=', '                trace917(ckt, "reorder", iterno, error);\n                ckt->CKTstat->STATreorderTime +=', 1)
text = text.replace('                ckt->CKTstat->STATdecompTime +=', '                trace917(ckt, "factor", iterno, error);\n                ckt->CKTstat->STATdecompTime +=', 1)
text = text.replace('                return(E_ITERLIM);', '                trace917(ckt, "iteration-limit", iterno, E_ITERLIM);\n                return(E_ITERLIM);', 1)
p.write_text(text)
print('instrumented', p)
op = source / 'src/spicelib/analysis/optran.c'
assert hashlib.sha256(op.read_bytes()).hexdigest() == '293bd182839ac8f53e5b47186abfcdf9128ed17bd8cb33ba4083e10f71b00742'
old = op.read_text()
needle = '        converged = NIiter(ckt,ckt->CKTtranMaxIter);'
assert old.count(needle) == 1
replacement = r'''
        {
            extern int trace917Attempt;
            trace917Attempt++;
            if (getenv("TRACE917")) fprintf(stderr, "O917 {\"attempt\":%d,\"stage\":\"before\",\"optime\":%.17g,\"dt\":%.17g}\n", trace917Attempt, optime, ckt->CKTdelta);
            converged = NIiter(ckt,ckt->CKTtranMaxIter);
            if (getenv("TRACE917")) fprintf(stderr, "O917 {\"attempt\":%d,\"stage\":\"after\",\"optime\":%.17g,\"dt\":%.17g,\"error\":%d}\n", trace917Attempt, optime, ckt->CKTdelta, converged);
        }
'''
op.write_text(old.replace(needle, replacement, 1))
print('instrumented', op)
