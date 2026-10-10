Netlist to Test the Xyce Resistor Model
*********************************************************************
* Tier No.:	1                                               
* Description:  Circuit to demonstrate the validity of the 
*               the linear resistor model implemented in Xyce. 
* Input: VIN=0-5V DC 
* Output: Current through R1
* Circuit Elements: R1
* Analysis:     
*	A DC voltage source, in parallel with a 1K Ohm resistor,
*	is swept from 0-5V in 1V increments.  The measured output
*	is the current through the resistor.  This is calculated
*	using Ohm's Law (Voltage=Current*Resistance, V=IR), which
*	yields a linear I-V characteristics for a resistor.
*
*			V(volts)  |  I(mA)
*			  0       |    0
*			  1       |    1
*			  2       |    2
*			  3       |    3
*			  4       |    4
*			  5       |    5
*
*		     	
* NOTE: Xyce does not currently print out the voltage sweep
*       for V1, which is the independent variable. According to the 
*       print statement below, the output should V1 (independent
*       variable), voltage at node 1 or V(1), and current through the
*       voltage source V1 or I(V1).  The output file will be changed
*       when the correction is made in the code. (01/16/01)
*********************************************************************** 
R1 1 0 1K 
V1 1 0 5V
.DC V1 0 5V 1V
.PRINT DC V(1) I(V1)
.END
