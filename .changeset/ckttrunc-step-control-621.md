---
'@spice-ts/core': patch
---

Transient step control follows ngspice-47 CKTtrunc: CAPtrunc, INDtrunc and DIOtrunc bound the step on device charges, and the node-voltage LTE only remains on nodes of devices without a DEVtrunc port (#621). Fixes the CJSW diode transient that stopped with TimestepTooSmallError (#646).
