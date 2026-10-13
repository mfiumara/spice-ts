"""Verify archived/source hashes without running simulators or rebuilding."""
import hashlib
import json
from pathlib import Path

out = Path(__file__).resolve().parent
root = out.parents[3]
provenance = json.loads((out / 'provenance.json').read_text())
checked = 0
for name, expected in provenance['sha256'].items():
    path = root / name
    assert not Path(name).is_absolute() and '..' not in Path(name).parts
    if name == 'packages/core/dist/index.js':
        # Build-dependent bytes are captured as provenance, not an offline prerequisite.
        continue
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, name
    checked += 1
print(f'{checked} archived/source file SHA256s verified; measured core bundle digest retained separately')
