from pathlib import Path
import subprocess, json, hashlib
root = Path(__file__).resolve().parent
cases = {
    'single': '.temp 77',
    'before-options': '.temp 77\n.options temp=127',
    'after-options': '.options temp=127\n.temp 77',
    'repeated': '.temp 77\n.temp 127',
    'multiple': '.temp 77 127',
    'empty': '.temp',
    'invalid': '.temp abc',
    'suffix': '.temp 77C',
    'equals': '.temp=77',
    'spaced-equals': '.temp = 77',
    'expression': '.param t=77\n.temp {t}',
    'quote': ".temp '77'",
}
rows = []
for name, card in cases.items():
    deck = f'temp directive {name}\nV1 a 0 1\nR1 a 0 {{1000+temper}}\nB1 b 0 V=temper\nR2 b 0 1k\n{card}\n.op\n.end\n'
    path = root / 'controls' / f'{name}.cir'
    path.parent.mkdir(exist_ok=True)
    path.write_text(deck)
    run = subprocess.run(['ngspice', '-n', '-b', str(path)], capture_output=True, text=True, timeout=30)
    log = run.stdout + run.stderr
    (root / 'controls' / f'{name}.ngspice.log').write_text(log)
    rows.append(dict(name=name, sha256=hashlib.sha256(deck.encode()).hexdigest(), exit=run.returncode, log=log))
(root / 'ngspice-controls.json').write_text(json.dumps(rows, indent=2)+'\n')
for row in rows:
    print(row['name'], row['exit'], '\n'.join(line for line in row['log'].splitlines() if 'TEMP' in line or 'Warning' in line or line.strip().startswith(('b ', 'v1#branch'))))
