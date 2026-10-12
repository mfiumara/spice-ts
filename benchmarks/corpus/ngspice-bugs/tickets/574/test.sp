
v1 1 0 dc 0
r1 1 0 1k

*.dc v1 0 1 0.05   ; fails
.dc v1 0 1 0.025 ; works

.measure dc test find i(v1) when v(1)=0.05

.end
