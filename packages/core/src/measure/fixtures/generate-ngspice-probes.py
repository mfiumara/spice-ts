"""Regenerate ngspice-47-probes.json (the ngspice-47 reference for measure.test.ts).

Run in a directory holding the probe decks tran.cir, ac.cir, dc.cir and quirk.cir
(the `deck` fields of the JSON), after, for each deck:

    ngspice -b <deck>.cir > <deck>.log 2>&1        # prints the .meas results
    ngspice -b g-<deck>.cir                        # same deck + `.control / set filetype=ascii /
                                                   #   run / write <deck>.raw / .endc` (tran, ac, dc)

The raw vectors are ngspice's own data, so measure.test.ts can check the measure
port on exactly the points ngspice measured. Run with HOME pointing at an empty
directory so no ~/.spiceinit changes the result.
"""
import json, re
def raw(path):
    lines = open(path).read().split('\n')
    nvar = int(next(l for l in lines if l.startswith('No. Variables')).split(':')[1])
    npts = int(next(l for l in lines if l.startswith('No. Points')).split(':')[1])
    flags = next(l for l in lines if l.startswith('Flags')).split(':')[1].strip()
    vi = lines.index('Variables:')
    names = [lines[vi+1+k].split('\t')[2] for k in range(nvar)]
    vals = lines.index('Values:') + 1
    data = [l.strip().split('\t')[-1] for l in lines[vals:] if l.strip()]
    cols = {n: [] for n in names}
    for p in range(npts):
        for k, n in enumerate(names):
            cols[n].append(data[p*nvar+k])
    out = {}
    for n, v in cols.items():
        if n.startswith('i(bpa_'): continue
        m = re.match(r'^v\((.*)\)$', n); key = n
        if m: key = m.group(1)
        m = re.match(r'^i\((.*)\)$', n)
        if m: key = m.group(1) + '#branch'
        if flags == 'complex':
            out[key] = {'re': [float(x.split(',')[0]) for x in v], 'im': [float(x.split(',')[1]) for x in v]}
        else:
            out[key] = {'re': [float(x) for x in v]}
    return out
def expected(log):
    res = {}
    for l in open(log):
        m = re.match(r'^(\w+)\s+=\s+(\S+)(.*)$', l)
        if m and not l.startswith('Total') and not l.startswith('No.'):
            ent = {'value': float(m.group(2))}
            for k, v in re.findall(r'(\w+)=\s+(\S+)', m.group(3)): ent[k] = float(v)
            res[m.group(1)] = ent
        m = re.match(r'^ \.meas \w+ (\w+) .* failed!', l)
        if m: res[m.group(1)] = {'failed': True}
    return res
cards = lambda f: [l.strip() for l in open(f) if l.lower().startswith('.meas')]
fx = {}
for name, scale in [('tran','time'),('ac','frequency'),('dc','v-sweep')]:
    fx[name] = {'deck': open(f'{name}.cir').read(), 'scale': scale, 'vectors': raw(f'{name}.raw'), 'expected': expected(f'{name}.log')}
fx['quirk'] = {'deck': open('quirk.cir').read(), 'expected': expected('quirk.log')}
json.dump(fx, open('ngspice-47-probes.json','w'), separators=(',', ':'))
for k in fx: print(k, fx[k]['expected'])
