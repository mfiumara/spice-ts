# SPDX-License-Identifier: MIT
"""Generate the one bounded matrix; no upstream example files copied."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
CASES = []

def add(name, body, observe=None, purpose=""):
    CASES.append(dict(id=name, observe=observe or ["v(o)"], purpose=purpose))
    (HERE / "decks" / (name + ".cir")).write_text(name + "\n" + body.strip() + "\n.op\n.end\n")

(HERE / "decks").mkdir(exist_ok=True)
issue = """dynamic numparam scope
.subckt leaf a b
R1 a b {pp}
.ends leaf
.subckt rc in out gnd
.param pp=3k
X1 in out leaf
R2 out gnd 1k
.ends rc
V1 in 0 1
X1 in o 0 rc
.op
.end
"""
(HERE / "decks/issue-888.cir").write_text(issue)
CASES.append(dict(id="issue-888", observe=["v(o)"], purpose="Unchanged #888 deck, no control block appended"))
leaf = ".subckt leaf a b\nR1 a b {pp}\n.ends leaf\n"

def wrapper(param=".param pp=3k", call="X1 in out leaf"):
    return ".subckt rc in out gnd\n" + param + "\n" + call + "\nR2 out gnd 1k\n.ends rc\nV1 in 0 1\nX1 in o 0 rc"

add("caller-shadows-global", ".param pp=9k\n" + leaf + wrapper(), purpose="Caller body pp vs global pp")
add("global-fallback", ".param pp=9k\n" + leaf + wrapper(param=""), purpose="No caller binding")
add("callee-default-shadows-caller", leaf.replace("leaf a b", "leaf a b params: pp=4k") + wrapper(), purpose="Literal default vs caller")
add("callee-local-shadows-caller", leaf.replace(".ends leaf", ".param pp=4k\n.ends leaf") + wrapper(), purpose="Callee body binding vs caller")
add("explicit-shadows-default", leaf.replace("leaf a b", "leaf a b params: pp=4k") + wrapper(call="X1 in out leaf pp=2k"), purpose="Declared X-line override vs default")
add("default-reads-caller", ".subckt leaf a b params: rr={pp}\nR1 a b {rr}\n.ends leaf\n" + wrapper(), purpose="Header default expression reads caller")
add("override-reads-caller", leaf.replace("leaf a b", "leaf a b params: pp=4k") + wrapper(call="X1 in out leaf pp={pp*2}"), purpose="X-line expression reads caller")
add("local-reads-caller", leaf.replace("{pp}", "{rr}").replace(".ends leaf", ".param rr={pp*2}\n.ends leaf") + wrapper(), purpose="Body dependency reads caller")
add("three-level-nearest", leaf + ".subckt middle a b\n.param pp=4k\nX1 a b leaf\n.ends middle\n" + wrapper(call="X1 in out middle"), purpose="Nearest dynamic binding")
add("three-level-fallback", leaf + ".subckt middle a b\nX1 a b leaf\n.ends middle\n" + wrapper(call="X1 in out middle"), purpose="Ancestor through unbound middle")
add("repeated-siblings", leaf + """.subckt rc in out gnd params: pp=1k
X1 in out leaf
R2 out gnd 1k
.ends rc
V1 in 0 1
Xa in o1 0 rc pp=3k
Xb in o2 0 rc pp=4k
Xc in o3 0 rc pp=3k""", ["v(o1)", "v(o2)", "v(o3)"], "No leakage across repeated siblings")
add("lexical-param-857", """.subckt outer in out gnd
.subckt inner a b
R1 a b {rp}
.ends inner
X1 in out inner
R2 out gnd 1k
.param rp=3k
.ends outer
V1 in 0 1
X1 in o 0 outer""", purpose="Nested lexical param order control #857")
add("lexical-model-854", """.subckt A 1 2
D1 1 2 DX
.model DX D (IS=1e-14)
.ends
.subckt B 1 2
D1 1 2 DX
.model DX D (IS=1e-10 RS=10)
.ends
V1 a 0 0.6
X1 a 0 A
V2 b 0 0.6
X2 b 0 B""", ["i(v1)", "i(v2)"], "Issue #854 model control, branch currents")
add("lexical-model-not-dynamic", """.model DX D (IS=1e-14)
.subckt leaf a b
D1 a b DX
.ends leaf
.subckt caller a b
.model DX D (IS=1e-10 RS=10)
X1 a b leaf
.ends caller
V1 a 0 0.6
X1 a 0 caller""", ["i(v1)"], "Top-level callee must not inherit caller model")
add("lexical-definition-dynamic-param", """.subckt outer in out gnd
.param pp=3k
.subckt leaf a b
R1 a b {pp}
.ends leaf
.subckt middle a b
.param pp=4k
X1 a b leaf
.ends middle
X1 in out middle
R2 out gnd 1k
.ends outer
V1 in 0 1
X1 in o 0 outer""", purpose="Lexical outer pp vs dynamic middle pp")
(HERE / "matrix.json").write_text(json.dumps(CASES, indent=2) + "\n")
print(f"Generated {len(CASES)} cases")
