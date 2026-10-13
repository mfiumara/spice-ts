#!/usr/bin/env python3
"""Relocate Sandia's arm64 serial package without sudo or installer scripts."""
import hashlib
import pathlib
import shutil
import subprocess
import sys
import urllib.request
import zipfile

URL = 'https://xyce.sandia.gov/download/1952/?tmstv=1754510116'
SHA256 = '06cd438e0a3d4dc86948c1d0f6684fa125db3dfa1776ff1d9339ebb77865754b'


def main():
    if sys.platform != 'darwin':
        raise SystemExit('This installer is macOS-only; see build-xyce-serial.sh for Linux.')
    if subprocess.check_output(['uname', '-m'], text=True).strip() != 'arm64':
        raise SystemExit('This package requires arm64.')
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else
                        '~/.hermes/cache/scratch/xyce-7.10').expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    archive = root / 'serial.zip'
    if not archive.exists():
        with urllib.request.urlopen(URL, timeout=120) as response:
            archive.write_bytes(response.read())
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        raise SystemExit('Package hash mismatch; refusing to extract.')
    with zipfile.ZipFile(archive) as package:
        # Pin both member name and archive hash; do not extract arbitrary paths.
        (root / 'XyceNF-7.10.0-Darwin.pkg').write_bytes(package.read('XyceNF-7.10.0-Darwin.pkg'))
    expanded = root / 'expanded'
    if not expanded.exists():
        subprocess.run(['pkgutil', '--expand-full', str(root / 'XyceNF-7.10.0-Darwin.pkg'), str(expanded)], check=True)
    install = root / 'install'
    for component in sorted(expanded.glob('*/Payload/usr/local/XyceNF_7.10')):
        shutil.copytree(component, install, dirs_exist_ok=True)
    executable = install / 'bin/Xyce'
    subprocess.run([str(executable), '-v'], check=True)
    print(f'export XYCE_BIN={executable}')


if __name__ == '__main__':
    main()
