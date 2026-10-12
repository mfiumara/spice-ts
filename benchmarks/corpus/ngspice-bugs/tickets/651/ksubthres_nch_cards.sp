VDMOS ksubthres test
M1 D G 0 MRF101
VG G 0 5V
VD D 0 10V
.model MRF101 VDMOS (Rg=4 Vto=2.2 Rd=1 Rs=0.1 Kp=7.1 Lambda=0.03 mtriode=0.692 Ksubthres=1.07m Cgdmax=5p Cgdmin=1p Cgs=130p Cjo=130p M=0.4 Vj=2.3 BV=140 tt=1n)

.dc VG 0 4 0.01
.print dc i(VD)
.end
