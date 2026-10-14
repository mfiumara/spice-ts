"""Expand an archived receipt into a NEW directory for accuracy replay."""
import gzip
from pathlib import Path
import shutil
import sys
source, target = map(Path, sys.argv[1:])
target.mkdir(parents=True, exist_ok=False)
for path in source.rglob('*'):
    if not path.is_file():
        continue
    relative = path.relative_to(source)
    destination = target / relative
    unpack = path.suffix == '.gz' and not path.name.endswith(('.header.gz', '.bin.gz'))
    if unpack:
        destination = destination.with_suffix('')
    destination.parent.mkdir(parents=True, exist_ok=True)
    if unpack:
        destination.write_bytes(gzip.decompress(path.read_bytes()))
    else:
        shutil.copyfile(path, destination)
