"""Verify ngspice-47's registered AC capability from its released archive."""
import hashlib
import json
from pathlib import Path
import sys
import tarfile

ARCHIVE_SHA256 = "894e649651f1838a14095e5a5439e7d3aa63e87ede14d283173fda4fcdef675f"
archive = Path(sys.argv[1])
assert hashlib.sha256(archive.read_bytes()).hexdigest() == ARCHIVE_SHA256
files = [
    ("ngspice-47/src/spicelib/devices/mos6/mos6init.c", ".DEVacLoad = NULL,"),
    ("ngspice-47/src/spicelib/analysis/acan.c", "DEVices[i]->DEVacLoad && ckt->CKThead[i]"),
]
receipts = []
with tarfile.open(archive) as source:
    for name, required in files:
        member = source.extractfile(name)
        assert member is not None
        content = member.read()
        text = content.decode()
        assert required in text
        if name.endswith("acan.c"):
            assert "SMPcClear(ckt->CKTmatrix);" in text
        receipts.append({
            "path": name,
            "sha256": hashlib.sha256(content).hexdigest(),
            "evidence": [
                {"line": index, "text": line.strip()}
                for index, line in enumerate(text.splitlines(), 1)
                if required in line or (name.endswith("acan.c") and "SMPcClear(ckt->CKTmatrix);" in line)
            ],
        })
report = {
    "url": "https://downloads.sourceforge.net/project/ngspice/ng-spice-rework/47/ngspice-47.tar.gz",
    "archiveSha256": ARCHIVE_SHA256,
    "checksumBasis": "Homebrew ngspice stable-47 formula (brew info ngspice --json=v2)",
    "files": receipts,
    "conclusion": "AC clears the matrix and invokes only non-null DEVacLoad callbacks. MOS6 has none, so its entire AC stamp is omitted.",
}
Path(__file__).with_name("ngspice-source.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
