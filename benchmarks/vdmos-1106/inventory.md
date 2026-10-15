## Measured outcomes

Uniform normalized-error threshold 0.01. Common-vector corpus metric unchanged. Null means no comparison.

| Deck | Before | Signals | Error | After | Signals | Error | Worst signal |
|---|---|---:|---:|---|---:|---:|---|
| n-6 | matched | 7 | 1.52e-08 | matched | 7 | 1.52e-08 | dc i(vdd) |
| n-7 | matched | 5 | 0.00104 | matched | 5 | 0.00104 | tran i(vdd) |
| n-8 | not-compared | 0 | None | matched | 10 | 6.54e-13 | ac i(va) |
| n-9 | not-compared | 0 | None | matched | 10 | 0.00424 | tran i(vg) |
| n-10 | not-compared | 0 | None | matched | 8 | 8.34e-05 | dc i(vs) |
| n-11 | not-compared | 0 | None | matched | 8 | 8.66e-05 | dc i(vd) |
| n-12 | not-compared | 0 | None | mismatch | 10 | 3.16e-05 | dc i(vs2) |
| n-13 | not-compared | 0 | None | matched | 8 | 1.48e-08 | dc i(vs) |

No revealed numerical error exceeds 0.01, so no numerical mismatch issue is filed. n-12 remains a coverage loss, not a numerical failure. Its extra spice-ts dc2 (486 points) has no batch raw counterpart and remains an unmatched ngspice record.

## Input hashes and complete export inventory

Names and vectors below are captured from real before/after exports. No input edits. Every waveform and plot inventory is unchanged; only reference secondary-coordinate metadata changes. `after.json.gz` coverage lists every vector missing on either side. Matched here means matched common-vector metric, not full saved-vector coverage.

### n-6: inv_vdmos_dc.cir

SHA-256 `b20eb59e3de6e8ac27f44097b7b19f2ebd1f821425c69b731f9b1c8a11a862e1`

ngspice: type=dc, plotName=`DC transfer characteristic`, plotId=`None`, points=101, secondary values=[]

Vectors: `v(1)`, `v(4)`, `v(3)`, `v(2)`, `i(vin)`, `i(vss)`, `i(vdd)`, `v(m.xinv.mn1#gate)`, `v(m.xinv.mp1#gate)`

spiceTs: type=dc, plotName=`DC transfer characteristic`, plotId=`None`, points=101, secondary values=[]

Vectors: `v(1)`, `v(2)`, `v(3)`, `v(4)`, `v(xinv.mn1.gate)`, `v(xinv.mp1.gate)`, `i(vdd)`, `i(vin)`, `i(vss)`

Coverage `DC transfer characteristic` vs `DC transfer characteristic`.

Missing from spice-ts: `v(m.xinv.mn1#gate)`, `v(m.xinv.mp1#gate)`

Missing from ngspice: `v(xinv.mn1.gate)`, `v(xinv.mp1.gate)`

### n-7: inv_vdmos.cir

SHA-256 `7ba5f6c24e3c6c5c1b22595173e635c0106e734232c170b8ea110d4f3480f737`

ngspice: type=tran, plotName=`Transient Analysis`, plotId=`None`, points=1050, secondary values=[]

Vectors: `v(1)`, `v(3)`, `v(2)`, `i(vin)`, `i(vdd)`, `v(m.xinv.mn1#gate)`, `v(m.xinv.mn1#body_diode)`, `v(m.xinv.mp1#gate)`, `v(m.xinv.mp1#body_diode)`

spiceTs: type=tran, plotName=`Transient Analysis`, plotId=`None`, points=1050, secondary values=[]

Vectors: `v(1)`, `v(2)`, `v(3)`, `v(xinv.mn1.body_diode)`, `v(xinv.mn1.gate)`, `v(xinv.mp1.body_diode)`, `v(xinv.mp1.gate)`, `i(vdd)`, `i(vin)`

Coverage `Transient Analysis` vs `Transient Analysis`.

Missing from spice-ts: `v(m.xinv.mn1#gate)`, `v(m.xinv.mn1#body_diode)`, `v(m.xinv.mp1#gate)`, `v(m.xinv.mp1#body_diode)`

Missing from ngspice: `v(xinv.mn1.body_diode)`, `v(xinv.mn1.gate)`, `v(xinv.mp1.body_diode)`, `v(xinv.mp1.gate)`

### n-8: VDMOS-DIO-AC.cir

SHA-256 `5353769bf39031ee971d955dd92bdaae8ef827d99fdb0242d635ef4fc56b3d99`

ngspice: type=ac, plotName=`AC Analysis`, plotId=`None`, points=51, secondary values=[]

Vectors: `v(ad)`, `v(kd)`, `v(d)`, `v(g)`, `v(s)`, `i(vs)`, `i(vg)`, `i(vd)`, `i(vk)`, `i(va)`, `v(m1#gate)`, `v(m1#body_diode)`, `i(@d1[id])`, `i(@m1[id])`

spiceTs: type=ac, plotName=`AC Analysis`, plotId=`ac1`, points=51, secondary values=[]

Vectors: `v(ad)`, `v(d)`, `v(d1.rs)`, `v(g)`, `v(kd)`, `v(m1.body_diode)`, `v(m1.drain)`, `v(m1.gate)`, `v(m1.source)`, `v(s)`, `i(va)`, `i(vd)`, `i(vg)`, `i(vk)`, `i(vs)`

Coverage `ac1` vs `AC Analysis`.

Missing from spice-ts: `v(m1#gate)`, `v(m1#body_diode)`, `i(@d1[id])`, `i(@m1[id])`

Missing from ngspice: `v(d1.rs)`, `v(m1.body_diode)`, `v(m1.drain)`, `v(m1.gate)`, `v(m1.source)`

### n-9: VDMOS-DIO.cir

SHA-256 `3e571540caef808b4acd9346962846cf0c974f9e95046f1b1cae7b9940b5687c`

ngspice: type=tran, plotName=`Transient Analysis`, plotId=`None`, points=258, secondary values=[]

Vectors: `v(ad)`, `v(kd)`, `v(d)`, `v(g)`, `v(s)`, `i(vs)`, `i(vg)`, `i(vd)`, `i(vk)`, `i(va)`, `v(m1#gate)`, `v(m1#body_diode)`, `@d1[cd]`, `@m1[cds]`

spiceTs: type=tran, plotName=`Transient Analysis`, plotId=`tran1`, points=258, secondary values=[]

Vectors: `v(ad)`, `v(d)`, `v(d1.rs)`, `v(g)`, `v(kd)`, `v(m1.body_diode)`, `v(m1.drain)`, `v(m1.gate)`, `v(m1.source)`, `v(s)`, `i(va)`, `i(vd)`, `i(vg)`, `i(vk)`, `i(vs)`

Coverage `tran1` vs `Transient Analysis`.

Missing from spice-ts: `v(m1#gate)`, `v(m1#body_diode)`, `@d1[cd]`, `@m1[cds]`

Missing from ngspice: `v(d1.rs)`, `v(m1.body_diode)`, `v(m1.drain)`, `v(m1.gate)`, `v(m1.source)`

### n-10: vdmos-out_ir_mtr.cir

SHA-256 `63b7483ca8406aef8f80b44443be204b367a5dc81f86697d15c4138f07455303`

ngspice: type=dc, plotName=`DC transfer characteristic`, plotId=`None`, points=805, secondary values=[3, 4, 5, 6, 7]

Vectors: `v(d)`, `v(g)`, `v(s)`, `v(s2)`, `i(vs2)`, `i(vs)`, `i(vg)`, `i(vd)`, `v(m2#gate)`, `v(m2#body_diode)`, `v(m1#gate)`, `v(m1#body_diode)`

spiceTs: type=dc, plotName=`DC transfer characteristic`, plotId=`None`, points=805, secondary values=[3, 4, 5, 6, 7]

Vectors: `v(d)`, `v(g)`, `v(m1.body_diode)`, `v(m1.gate)`, `v(m1.source)`, `v(m2.body_diode)`, `v(m2.gate)`, `v(m2.source)`, `v(s)`, `v(s2)`, `i(vd)`, `i(vg)`, `i(vs)`, `i(vs2)`

Coverage `DC transfer characteristic` vs `DC transfer characteristic`.

Missing from spice-ts: `v(m2#gate)`, `v(m2#body_diode)`, `v(m1#gate)`, `v(m1#body_diode)`

Missing from ngspice: `v(m1.body_diode)`, `v(m1.gate)`, `v(m1.source)`, `v(m2.body_diode)`, `v(m2.gate)`, `v(m2.source)`

### n-11: vdmos-out_ir.cir

SHA-256 `e991fe10546a7b7b0dc0a60d597782b35d9a5087682f5724b02e145fb5a27b1b`

ngspice: type=dc, plotName=`DC transfer characteristic`, plotId=`None`, points=1605, secondary values=[3, 4, 5, 6, 7]

Vectors: `v(d)`, `v(g)`, `v(s)`, `v(b)`, `i(vb)`, `i(vs)`, `i(vg)`, `i(vd)`, `v(m1#gate)`, `v(m1#body_diode)`

spiceTs: type=dc, plotName=`DC transfer characteristic`, plotId=`None`, points=1605, secondary values=[3, 4, 5, 6, 7]

Vectors: `v(b)`, `v(d)`, `v(g)`, `v(m1.body_diode)`, `v(m1.drain)`, `v(m1.gate)`, `v(s)`, `i(vb)`, `i(vd)`, `i(vg)`, `i(vs)`

Coverage `DC transfer characteristic` vs `DC transfer characteristic`.

Missing from spice-ts: `v(m1#gate)`, `v(m1#body_diode)`

Missing from ngspice: `v(m1.body_diode)`, `v(m1.drain)`, `v(m1.gate)`

### n-12: vdmosp-out-mtr.cir

SHA-256 `64176908ef6c543b9bfbc15195e75aaebd446c6c89bed69bca01eb6a647909fe`

ngspice: type=dc, plotName=`DC transfer characteristic`, plotId=`None`, points=1566, secondary values=[-5, -4, -3, -2, -1, 0]

Vectors: `v(d)`, `v(g)`, `v(s)`, `v(s2)`, `v(s3)`, `i(vs3)`, `i(vs2)`, `i(vs)`, `i(vg)`, `i(vd)`, `v(m3#gate)`, `v(m3#body_diode)`, `v(m2#gate)`, `v(m2#body_diode)`, `v(m1#gate)`, `v(m1#body_diode)`

spiceTs: type=dc, plotName=`DC transfer characteristic`, plotId=`dc1`, points=1566, secondary values=[-5, -4, -3, -2, -1, 0]

Vectors: `v(d)`, `v(g)`, `v(m1.body_diode)`, `v(m1.drain)`, `v(m1.gate)`, `v(m1.source)`, `v(m2.body_diode)`, `v(m2.drain)`, `v(m2.gate)`, `v(m2.source)`, `v(m3.body_diode)`, `v(m3.drain)`, `v(m3.gate)`, `v(m3.source)`, `v(s)`, `v(s2)`, `v(s3)`, `i(vd)`, `i(vg)`, `i(vs)`, `i(vs2)`, `i(vs3)`

spiceTs: type=dc, plotName=`DC transfer characteristic`, plotId=`dc2`, points=486, secondary values=[-11, -9, -7, -5, -3, -1]

Vectors: `v(d)`, `v(g)`, `v(m1.body_diode)`, `v(m1.drain)`, `v(m1.gate)`, `v(m1.source)`, `v(m2.body_diode)`, `v(m2.drain)`, `v(m2.gate)`, `v(m2.source)`, `v(m3.body_diode)`, `v(m3.drain)`, `v(m3.gate)`, `v(m3.source)`, `v(s)`, `v(s2)`, `v(s3)`, `i(vd)`, `i(vg)`, `i(vs)`, `i(vs2)`, `i(vs3)`

Coverage `dc1` vs `DC transfer characteristic`.

Missing from spice-ts: `v(m3#gate)`, `v(m3#body_diode)`, `v(m2#gate)`, `v(m2#body_diode)`, `v(m1#gate)`, `v(m1#body_diode)`

Missing from ngspice: `v(m1.body_diode)`, `v(m1.drain)`, `v(m1.gate)`, `v(m1.source)`, `v(m2.body_diode)`, `v(m2.drain)`, `v(m2.gate)`, `v(m2.source)`, `v(m3.body_diode)`, `v(m3.drain)`, `v(m3.gate)`, `v(m3.source)`

Coverage `dc2` vs `None`.

Missing from spice-ts: 

Missing from ngspice: `v(d)`, `v(g)`, `v(m1.body_diode)`, `v(m1.drain)`, `v(m1.gate)`, `v(m1.source)`, `v(m2.body_diode)`, `v(m2.drain)`, `v(m2.gate)`, `v(m2.source)`, `v(m3.body_diode)`, `v(m3.drain)`, `v(m3.gate)`, `v(m3.source)`, `v(s)`, `v(s2)`, `v(s3)`, `i(vd)`, `i(vg)`, `i(vs)`, `i(vs2)`, `i(vs3)`

### n-13: vdmosp-out.cir

SHA-256 `8c0ed92645e2876fe915703215dd208a8fdf93c9e365c5ec561760bbc3ce0e5c`

ngspice: type=dc, plotName=`DC transfer characteristic`, plotId=`None`, points=966, secondary values=[-5, -4, -3, -2, -1, 0]

Vectors: `v(d)`, `v(g)`, `v(s)`, `v(b)`, `i(vb)`, `i(vs)`, `i(vg)`, `i(vd)`, `v(m1#body_diode)`

spiceTs: type=dc, plotName=`DC transfer characteristic`, plotId=`None`, points=966, secondary values=[-5, -4, -3, -2, -1, 0]

Vectors: `v(b)`, `v(d)`, `v(g)`, `v(m1.body_diode)`, `v(s)`, `i(vb)`, `i(vd)`, `i(vg)`, `i(vs)`

Coverage `DC transfer characteristic` vs `DC transfer characteristic`.

Missing from spice-ts: `v(m1#body_diode)`

Missing from ngspice: `v(m1.body_diode)`

