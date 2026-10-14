"""Lossless deterministic receipt archive; raw payloads deduplicated by SHA256."""
import gzip
import hashlib
import json
from pathlib import Path
HERE = Path(__file__).resolve().parent
for name in ['aborted-nine-deck', 'baseline', 'comparison']:
    directory = HERE / name
    hash_path = directory / 'native-raw-sha256.json'
    raw_hashes = json.loads(hash_path.read_text()) if hash_path.exists() else {}
    for path in directory.glob('*.raw'):
        raw = path.read_bytes()
        raw_hashes[path.stem] = hashlib.sha256(raw).hexdigest()
        marker = raw.find(b'Binary:\n')
        if marker < 0:
            path.with_suffix('.raw.gz').write_bytes(gzip.compress(raw, mtime=0))
        else:
            payload = raw[marker + 8:]
            sha = hashlib.sha256(payload).hexdigest()
            payloads = directory / 'native-payloads'
            payloads.mkdir(exist_ok=True)
            (payloads / (sha + '.bin.gz')).write_bytes(gzip.compress(payload, mtime=0))
            path.with_suffix('.header.gz').write_bytes(gzip.compress(raw[:marker + 8], mtime=0))
        path.unlink()
    (directory / 'native-raw-sha256.json').write_text(json.dumps(raw_hashes, indent=2) + '\n')
for path in list(HERE.rglob('*')):
    if path.is_file() and path.suffix in ['.js', '.cir', '.log'] or path.is_file() and path.name.endswith('.stdout.txt'):
        path.with_name(path.name + '.gz').write_bytes(gzip.compress(path.read_bytes(), mtime=0))
        path.unlink()
