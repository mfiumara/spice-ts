A simple test case of a resistor with negative resistance

*Prior to 24 May, but after the zero-resistance fix, this
* netlist would be incorrect and would act the same as
* a short across the negative resistor.

* test case when resistance is given a negative resistance
V1 a 0 5V
R1 a 0 -100

.DC V1 0 5V 1V
.PRINT dc V(a) I(V1)

.END
