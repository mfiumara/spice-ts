# SPDX-License-Identifier: MIT
"""Fetch-only originals; serial bounded child process groups; redacted receipts."""
import hashlib
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
RUN = HERE / '.run'
RUN.mkdir(exist_ok=True)
BUDGET = RUN / 'budget.json'


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def share_details(native):
    """Keep every factor identity, but store repeated redacted proofs only once."""
    details = {}
    for factor in native['factors']:
        for key in ['witness','commonModePairs','incidentTopology','diagonalSlots','missingNodeDiagonals']:
            if key not in factor:
                continue
            value = factor.pop(key)
            identity = hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
            details[identity] = value
            factor[key+'Id'] = identity
    native['details'] = details
    return native


def child(argv, cwd=ROOT):
    # Serialize even accidentally concurrent invocations, including ledger writes.
    with (RUN/'child.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return _child(argv, cwd)


def _child(argv, cwd):
    ledger = json.loads(BUDGET.read_text()) if BUDGET.exists() else []
    used = sum(row['wallSeconds'] for row in ledger)
    limit = min(29, 600 - used)  # leave teardown margin inside the 30-second wall ceiling
    if limit <= 0:
        raise RuntimeError('Cumulative actual child wall budget exhausted')
    start = time.monotonic()
    p = subprocess.Popen(list(map(str, argv)), cwd=cwd, start_new_session=True,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    timed_out = False
    try:
        out, err = p.communicate(timeout=limit)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(p.pid, signal.SIGKILL)
        out, err = p.communicate()
    row = dict(argv=list(map(str, argv)), cwd=str(cwd), exit=p.returncode,
               timedOut=timed_out, limitSeconds=limit, wallSeconds=time.monotonic()-start)
    ledger.append(row)
    BUDGET.write_text(json.dumps(ledger, indent=2)+'\n')
    return row, out, err


def prepare():
    manifest = json.loads((ROOT/'benchmarks/corpus/ngspice-bugs/manifest.json').read_text())
    attachment = next(t for t in manifest['tickets'] if t['ticket'] == 784)['attachments'][0]
    archive = RUN / 'question.7z'
    if not archive.exists():
        with urllib.request.urlopen(attachment['url'], timeout=25) as response:
            archive.write_bytes(response.read())
    assert digest(archive) == attachment['sha256']
    extracted = RUN/'extracted'
    extracted.mkdir(exist_ok=True)
    receipt, _, _ = child(['/usr/bin/tar','-xf',archive,'-C',extracted])
    assert receipt['exit'] == 0 and not receipt['timedOut']
    paths = [p for p in extracted.rglob('*') if p.is_file()]
    import re
    sources = []
    for name in ['base_159.cir','variant_159.cir']:
        source = extracted/name
        raw = source.read_bytes()
        # Preserve CRLF and every other byte; relocate only quoted absolute include paths.
        def relocate(match):
            suffix = match[1].decode().lower()
            path = next(p for p in paths if str(p).lower().endswith('/spice_lib/'+suffix))
            return b'"'+str(path).encode()+b'"'
        local = re.sub(rb'"D:/spice_lib/([^"\r\n]+)"', relocate, raw, flags=re.I)
        deck = RUN/name
        deck.write_bytes(local)
        includes = {Path(p.decode()).name: digest(p.decode())
                    for p in re.findall(rb'^\s*\.include\s+"([^"]+)"',local,re.I|re.M)}
        sources.append(dict(name=name, sourceHash=digest(source), localHash=digest(deck), includes=includes))
    (RUN/'.spiceinit').write_text('set ngbehavior=ltps\nset filetype=ascii\n')
    (HERE/'inputs.json').write_text(json.dumps(dict(url=attachment['url'], archiveHash=digest(archive),
        licence='fetch-only vendor material; existing benchmarks/SOURCES.md policy', decks=sources),indent=2)+'\n')
    print(json.dumps(sources,indent=2))


def engines():
    inputs = json.loads((HERE/'inputs.json').read_text())
    receipts = []
    for deck in inputs['decks']:
        path = RUN/deck['name']
        before = digest(path)
        record, out, _ = child(['node','--import','tsx',HERE/'trace.mts',path])
        native = share_details(json.loads(out)) if record['exit'] == 0 else dict(status='process-failure')
        raw = RUN/(deck['name']+'.raw')
        ref, out, err = child(['ngspice','-b','-r',raw,path], RUN)
        text = raw.read_text() if raw.exists() else ''
        import re
        match = re.search(r'No\. Points:\s*(\d+)',text)
        rows = int(match[1]) if match and 'Plotname: AC Analysis' in text else None
        log = out+err
        # Never publish raw log: it can contain expanded vendor identifiers/expressions.
        reference = dict(process=ref, acRows=rows,
            solver='SPARSE 1.3' if 'SPARSE 1.3' in log else 'unconfirmed',
            ltpsConfirmed='Compatibility modes selected: ps lt' in log,
            xspicePresent="Reducing trtol to 1 for xspice 'A' devices" in log,
            warnings=dict(singular=bool(re.search('singular matrix',log,re.I)),
                dynamicGminCompleted='Dynamic gmin stepping completed' in log,
                dynamicGminFailed='Dynamic gmin stepping failed' in log,
                trueGminFailed='True gmin stepping failed' in log,
                sourceSteppingFailed='source stepping failed' in log.lower(),
                transientRecovery='transient op finished successfully' in log.lower()))
        receipts.append(dict(name=deck['name'], inputHashBefore=before,inputHashAfter=digest(path),
            includes=deck['includes'],native=dict(process=record,**native), reference=reference,
            maxError=None,rmsError=None))
    git, head, _ = child(['git','rev-parse','HEAD'])
    assert git['exit'] == 0
    (HERE/'receipts.json').write_text(json.dumps(dict(baseline=head.strip(), configuration='set ngbehavior=ltps\nset filetype=ascii\n',
        receipts=receipts,childBudget=json.loads(BUDGET.read_text())),indent=2)+'\n')
    print(json.dumps([dict(name=r['name'],native=r['native']['status'],rows=r['reference']['acRows']) for r in receipts]))


def reductions():
    receipts = []
    for name in ['table.cir', 'table-isolated.cir', 'table-lowered.cir']:
        path = HERE/name
        record, out, err = child(['node','--import','tsx',HERE/'trace.mts',path])
        assert record['exit'] == 0, err
        native = share_details(json.loads(out))
        raw = RUN/(name+'.raw')
        ref, out, err = child(['ngspice','-b','-r',raw,path],RUN)
        import re
        text = raw.read_text() if raw.exists() else ''
        match = re.search(r'No\. Points:\s*(\d+)',text)
        rows = int(match[1]) if match and 'Plotname: AC Analysis' in text else None
        # Authored material only: retain raw log and DC/AC shape, not vendor output.
        receipts.append(dict(name=name,hashBefore=digest(path),hashAfter=digest(path),
            native=dict(process=record,**native),reference=dict(process=ref,acRows=rows,log=out+err),
            maxError=None,rmsError=None,metricsReason='No waveform comparison performed; original loss metrics are separate'))
    red, out, err = child(['node','--import','tsx',HERE/'parity-red.mts'])
    assert red['exit'] == 1 and 'TABLE is syntax' in err
    (HERE/'red.log').write_text(out+err)
    (HERE/'reductions.json').write_text(json.dumps(dict(receipts=receipts,expectedParityRed=red),indent=2)+'\n')
    print(json.dumps([dict(name=r['name'],status=r['native']['status'],rows=r['reference']['acRows'],control=r['native']['authoredControl']) for r in receipts]))


def source():
    repo=RUN/'ngspice-source'
    if not repo.exists():
        record, _, _ = child(['git','clone','--depth','1','--branch','ngspice-47','https://git.code.sf.net/p/ngspice/ngspice',repo])
        assert record['exit'] == 0
    record, head, _ = child(['git','rev-parse','HEAD'],repo)
    assert record['exit'] == 0 and head.strip() == 'a80f6e3e95d51534905b1f23410a951802666656'
    files=['src/frontend/inpcom.c','src/frontend/init.c','src/spicelib/analysis/cktop.c','src/spicelib/analysis/optran.c','src/xspice/icm/analog/pwl/cfunc.mod']
    versions={}
    for name,argv in [('ngspice',['ngspice','--version']),('node',['node','--version']),('pnpm',['pnpm','--version']),('cpu',['sysctl','-n','machdep.cpu.brand_string'])]:
        result,out,_=child(argv)
        assert result['exit']==0
        versions[name]=out.strip()
    import platform
    (HERE/'source.json').write_text(json.dumps(dict(origin='https://git.code.sf.net/p/ngspice/ngspice',tag='ngspice-47',revision=head.strip(),licence='modified BSD, referenced not copied',
        files={p:digest(repo/p) for p in files},versions=versions,host=dict(system=platform.system(),release=platform.release(),machine=platform.machine())),indent=2)+'\n')


def verify():
    receipts=[]
    for name,argv in [('offline',['pnpm','exec','tsx','--test',str(HERE/'evidence.test.mts')]),('build',['pnpm','build']),('lint',['pnpm','lint']),('full-tests',['pnpm','test'])]:
        result,out,err=child(argv)
        if name in ['build','full-tests']:
            import gzip
            (HERE/(name+'.log.gz')).write_bytes(gzip.compress((out+err).encode(),mtime=0))
        else:
            (HERE/(name+'.log')).write_text(out+err)
        receipts.append(dict(name=name,**result))
    (HERE/'verification.json').write_text(json.dumps(receipts,indent=2)+'\n')
    (HERE/'child-budget.json').write_text(BUDGET.read_text())
    print(json.dumps(receipts,indent=2))


if __name__ == '__main__':
    {'prepare':prepare,'engines':engines,'reductions':reductions,'source':source,'verify':verify}[sys.argv[1]]()
