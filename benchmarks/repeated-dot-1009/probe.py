"""Record unmodified ngspice-47 batch dot-card semantics (#1009)."""
import json
import hashlib
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'benchmarks/repeated-dot-1009/raw'
OUT.mkdir(parents=True, exist_ok=True)
fixtures = {
    'bjt-diffpair-current-source': 'benchmarks/corpus/corpus-e/fixtures/tests/d_bjt-diffpair-ccs.ckt',
    'vcvs-operating-point': 'benchmarks/corpus/corpus-e-spice3/fixtures/d_vcvs.1.cir',
    'diode-temperature-sweep': 'benchmarks/corpus/corpus-e-spice3/fixtures/d_diode.6.cir',
    'mos1-nand-transient': 'benchmarks/corpus/corpus-e-spice3/fixtures/d_mos1.nand1.cir',
    'dual-lc-uic-rejection': 'benchmarks/corpus/corpus-e-spice3/fixtures/oscillator.7.cir',
}
# A deliberately interleaved deck distinguishes input order from job-type order.
probe = OUT / 'interleaved.cir'
probe.write_text('Repeated dot-card order probe\nV1 in 0 1 ac 1\nR1 in 0 1k\n.ac lin 4 10 40\n.op\n.dc V1 0 1 1\n.ac lin 3 30 50\n.op\n.dc V1 2 4 1\n.op\n.end\n')
fixtures['interleaved'] = str(probe.relative_to(ROOT))
receipts = []
for name, relative in fixtures.items():
    deck = ROOT / relative
    raw = OUT / f'{name}.raw'
    command = ['ngspice', '-b', '-r', str(raw), str(deck)]
    result = subprocess.run(command, cwd=deck.parent, env={**os.environ, 'SPICE_ASCIIRAWFILE': '1'}, capture_output=True, text=True)
    (OUT / f'{name}.stdout.txt').write_text(result.stdout)
    (OUT / f'{name}.stderr.txt').write_text(result.stderr)
    text = raw.read_text() if raw.exists() else ''
    plots = [{'name': m.group(1), 'points': int(m.group(2))} for m in re.finditer(r'Plotname: ([^\n]+).*?No\. Points: (\d+)', text, re.S)]
    cards = [line for line in deck.read_text().splitlines() if re.match(r'^\.(op|dc|ac|tran)\b', line, re.I)]
    assert result.returncode == 0, (name, result.stderr)
    assert len(plots) == len(cards), (name, cards, plots)
    if name == 'interleaved':
        assert [plot['points'] for plot in plots] == [3, 4, 3, 2, 1, 1, 1]
    receipts.append({'fixture': name, 'deck': relative, 'deck_sha256': hashlib.sha256(deck.read_bytes()).hexdigest(), 'cards': cards, 'command': command, 'exit_code': result.returncode, 'raw_sha256': hashlib.sha256(raw.read_bytes()).hexdigest(), 'raw_plots_in_file_order': plots})
(OUT.parent / 'ngspice-semantics.json').write_text(json.dumps(receipts, indent=2) + '\n')
print(json.dumps(receipts, indent=2))
