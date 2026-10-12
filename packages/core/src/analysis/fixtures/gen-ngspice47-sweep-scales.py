"""Regenerate ngspice47-sweep-scales.json from ngspice-47 (issue #654).

Run from this directory with ngspice-47 on PATH: python3 gen-ngspice47-sweep-scales.py
Secondary values are only kept where ngspice parses the deck numbers exactly: it reads `700m`
as 7 * 0.1 = 0.7000000000000001, a parser difference outside the sweep accumulation.
"""
import subprocess,struct,json,tempfile
TMP=tempfile.mkdtemp()
def run(net):
    open(TMP+'/t.cir','w').write('t\n'+net+'\n.end\n')
    subprocess.run(['ngspice','-b','-r',TMP+'/t.raw',TMP+'/t.cir'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
    d=open(TMP+'/t.raw','rb').read(); i=d.index(b'Binary:\n'); hdr=d[:i].decode(); body=d[i+8:]
    L=hdr.splitlines()
    nv=int([l for l in L if l.startswith('No. Variables')][0].split(':')[1]); n=int([l for l in L if l.startswith('No. Points')][0].split(':')[1])
    cplx='complex' in [l for l in L if l.startswith('Flags')][0]
    w=2 if cplx else 1
    names=[]; vi=L.index('Variables:')
    for l in L[vi+1:vi+1+nv]: names.append(l.split()[1])
    vals=struct.unpack('<%dd'%(nv*n*w),body[:8*nv*n*w])
    vec=lambda j:[vals[k*nv*w+j*w] for k in range(n)]
    return names,vec
cases={}
dc=[('dc v1 -1 2 0.01','V1 a 0 0\nR1 a 0 1k\n.dc v1 -1 2 0.01'),
    ('dc v1 2 -1 -0.01','V1 a 0 0\nR1 a 0 1k\n.dc v1 2 -1 -0.01'),
    ('dc v1 0 0.3 0.1','V1 a 0 0\nR1 a 0 1k\n.dc v1 0 0.3 0.1'),
    ('dc i1 0 1m 0.1m','I1 0 a 0\nR1 a 0 1k\n.dc i1 0 1m 0.1m'),
    ('dc vinner 0 5 50m vouter 700m 1 50m','Vinner inner 0 0\nVouter outer 0 0\nR1 inner outer 1k\n.dc vinner 0 5 50m vouter 700m 1 50m'),
    ('dc v1 0 60 0.1','V1 a 0 0\nR1 a 0 1k\n.dc v1 0 60 0.1'),
    ('dc v1 9.999 10.001 .001','V1 a 0 0\nR1 a 0 1k\n.dc v1 9.999 10.001 .001'),
    ('dc v1 0 1 0.1 v2 -0.5 1 0.25','V1 inner 0 0\nV2 outer 0 0\nR1 inner outer 1k\n.dc v1 0 1 0.1 v2 -0.5 1 0.25')]
for k,net in dc:
    names,vec=run(net)
    e={'netlist':net,'sweep':vec(0)}
    if 'v(outer)' in names and '700m' not in net: e['secondary']=vec(names.index('v(outer)'))
    cases[k]=e
ac=['dec 50 100 100k','dec 10 1 5k','dec 10 1 9.999','dec 1 1 50','oct 4 1 50','oct 2 10 100','lin 10 1 1k','lin 7 0.1 1.3','lin 2 10 100']
for s in ac:
    names,vec=run('V1 a 0 ac 1\nR1 a b 1k\nC1 b 0 1u\n.ac '+s)
    cases['ac '+s]={'netlist':'V1 a 0 ac 1\nR1 a b 1k\nC1 b 0 1u\n.ac '+s,'frequency':vec(0)}
json.dump({'source':'ngspice-47 (Homebrew, KLU) `ngspice -b -r out.raw` binary rawfile: the scale vector, plus v(outer) as the nested secondary. Regenerate with gen-ngspice47-sweep-scales.py.','cases':cases},open('ngspice47-sweep-scales.json','w'),indent=1)
with open('ngspice47-sweep-scales.json','a') as f: f.write('\n')
for k,v in cases.items(): print(k,{kk:len(vv) for kk,vv in v.items() if kk!='netlist'})
