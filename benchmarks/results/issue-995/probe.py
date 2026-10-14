"""Reproduce raw ngspice-47 temperature probes, without modifying fixtures."""
import pathlib
import subprocess

root = pathlib.Path('benchmarks/results/issue-995')
fixture = pathlib.Path('benchmarks/corpus/corpus-k/fixtures/xyce/Netlists/CircuitSim90/MOS2/gm6.cir').read_text()
for name, option in [('device125', '.options device temp=125'), ('plain125', '.options temp=125'), ('plain27', '.options temp=27')]:
    deck = fixture.replace('.options device temp=125', option).replace('.end', '.control\nset numdgt=15\nop\nprint @mp2[temp] @mn3[temp] v(7) v(11) v(12) v(13)\n.endc\n.end')
    path = root / f'gm6-{name}.cir'
    path.write_text(deck)
    run = subprocess.run(['ngspice', '-b', str(path)], text=True, capture_output=True)
    (root / f'gm6-{name}.log').write_text('\n'.join(line.rstrip() for line in (run.stdout + run.stderr).splitlines()) + '\n')
    path.unlink()
    print(name, run.returncode)
    print('\n'.join(line for line in run.stdout.splitlines() if '[temp]' in line or line.startswith('v(') or 'TEMP =' in line))
