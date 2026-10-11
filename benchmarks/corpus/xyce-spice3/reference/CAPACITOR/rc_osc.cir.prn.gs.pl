#!/usr/bin/env perl

# tscoffe/tmei 12/12/07
# The differential equation we're solving here is:
# y'(x) - a*y(x) = -a*sin(s*x)
# Solution from CRC Standard Mathematical Tables and Formulae 31st Ed. by Daniel Zwillinger
# y(x) = y_0*exp(a*x)+(a/(a^2+s^2))*(a*sin(s*x)+s*cos(s*x))
# y(0) = -a*s/(a^2+s^2)
#
# a = -1/(R*C)
# s = 2*pi*f

open(INPUT,"rc_osc.cir.prn");
open(OUTPUT,">rc_osc.cir.prn.gs");

# These are values from the netlist.
$R1 = 1000.0;
$C1 = 2e-6;
$mpi=3.1415927;
$RC_const = $R1 * $C1;
$FREQ=1e5;
$offset = 0.002;
$a = -1.0/$RC_const;
$s = 2.0*$mpi*$FREQ;
$y0 = -$a*$s/($a**2+$s**2);

while ($line = <INPUT>)
{
  # Handle first and last lines:
  if ($line =~ m/^[IE]/) 
  { 
    print OUTPUT "$line"; 
    next; 
  }
  @data = split(" ",$line);
  $t = $data[1];
  $y = $offset + $y0*exp($a*$t)+$a*($a*sin($s*$t)+$s*cos($s*$t))/($a**2+$s**2);
  printf OUTPUT "%3d   %14.8e   %14.8e\n",$data[0],$data[1],$y
}
close(INPUT);
close(OUTPUT);
