#!/usr/bin/env python3
"""Issue #796 bisect helper: write variant source trees with one fast path reverted.

    python3 make-variants.py <branch-src> <out-dir>

Creates <out-dir>/no-lazy-map (lazy element-name map reverted) and
<out-dir>/no-node-memo (node memo / direct resolve reverted).
"""
import shutil
import sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])


def variant(name, edits):
    dest = out / name
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)
    path = dest / 'circuit.ts'
    text = path.read_text()
    for old, new in edits:
        assert old in text, (name, old[:60])
        text = text.replace(old, new)
    path.write_text(text)


variant('no-lazy-map', [
    ('devicesByName().get(', 'deviceMap.get('),
    ('pendingNamed.push([desc.name, devices[devices.length - 1]]);',
     'deviceMap.set(desc.name, devices[devices.length - 1]);'),
    ('if (xspiceInstances.size > 0) bindXspiceSources(devices, devicesByName());',
     'bindXspiceSources(devices, deviceMap);'),
    ('if (pendingBehavioralSources.length > 0) {\n      bindBehavioralControlBranches(pendingBehavioralSources, devicesByName());\n    }',
     'bindBehavioralControlBranches(pendingBehavioralSources, deviceMap);'),
])
variant('no-node-memo', [
    ('if (!canonicalByRaw.has(n)) canonicalByRaw.set(n, this.nodeSet.addCanonical(globalNode(n)));',
     'this.nodeSet.add(globalNode(n));'),
    ('      return nodeIndexMap.get(name)\n        ?? nodeIndexMap.get(canonicalByRaw.get(name) ?? canonicalNode(name))!;',
     '      return nodeIndexMap.get(canonicalNode(name))!;'),
])
