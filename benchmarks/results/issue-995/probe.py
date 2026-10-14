"""Reproduce scalar ngspice temperature probes without writing tracked logs."""
import json
import os
import pathlib
import re
import subprocess
import tempfile

fixture = pathlib.Path('benchmarks/corpus/corpus-k/fixtures/xyce/Netlists/CircuitSim90/MOS2/gm6.cir').read_text()
probes = []
for name, option in [('device125', '.options device temp=125'), ('plain125', '.options temp=125'), ('plain27', '.options temp=27')]:
    deck = fixture.replace('.options device temp=125', option).replace('.end', '.control\nset numdgt=15\nop\nprint @mp2[temp] @mn3[temp] v(7) v(11) v(12) v(13)\n.endc\n.end')
    with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as directory:
        path = pathlib.Path(directory) / f'gm6-{name}.cir'
        path.write_text(deck)
        run = subprocess.run(['ngspice', '-b', str(path)], text=True, capture_output=True)
    temperatures = re.search(r'TEMP = ([\d.]+) and TNOM = ([\d.]+)', run.stdout)
    values = dict(re.findall(r'^(@\w+\[temp\]|v\(\d+\)) = ([\deE+.-]+)$', run.stdout, re.MULTILINE))
    if temperatures is None or len(values) != 6:
        raise RuntimeError(f'{name}: missing temperature or OP diagnostics (exit {run.returncode})')
    probes.append({
        'name': name,
        'option': option,
        'ngspiceExitCode': run.returncode,
        'temperatureC': float(temperatures[1]),
        'nominalTemperatureC': float(temperatures[2]),
        'deviceTemperatureC': {device: float(values[f'@{device}[temp]']) for device in ['mp2', 'mn3']},
        'opVoltageV': {node: float(values[f'v({node})']) for node in ['7', '11', '12', '13']},
        'dataRows': [int(value) for value in re.findall(r'No\. of Data Rows\s*:\s*(\d+)', run.stdout)],
        'diagnosticErrors': [line.strip() for line in run.stderr.splitlines() if line.startswith('Error:') or line.strip().startswith('or {v(')],
    })
print(json.dumps({'schemaVersion': 1, 'temperatureProbes': probes}, indent=2))
