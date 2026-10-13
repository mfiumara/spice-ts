"""Fetch a bounded, explicitly named eSim example survey; no simulator selection."""
import os
from pathlib import Path
from urllib.request import urlopen

REVISION = '1a25a46ce15e0ccc35296dd513f40249c089a5a7'
PATHS = ['LICENSE', 'README.md'] + [f'Examples/{name}/{name}.cir' for name in [
    'BJT_Biascircuit', 'BJT_CB_config', 'BJT_CE_config', 'BJT_Frequency_Response',
    'BJT_amplifier', 'Clampercircuit', 'Clippercircuit', 'Diode_characteristics',
    'FET_Amplifier', 'FET_Characteristic', 'FrequencyResponse_JFET',
    'Fullwavebridgerectifier', 'Halfwave_Rectifier', 'High_Pass_Filter',
    'Low_Pass_Filter', 'Parallel_Resonance', 'RC', 'RL', 'RLC', 'Series_Resonance',
    'Transformer', 'UJT_Relaxation_Oscillator', 'Zener_Characteristic',
    'CMOS_NAND_Gate',
]]
root = Path(os.environ['TMPDIR']) / '940-esim'
PATHS += [path + '.out' for path in PATHS if path.endswith('.cir')]
PATHS += [f'Examples/{path}.cir.out' for path in [
    'FullAdder/FullAdder', 'FullAdder/full_adder', 'FullAdder/half_adder',
    'Half_Adder/Half_Adder', 'Mixed_Signal/Cmosinverter/Cmosinverter',
    'Mixed_Signal/Cmosinverter/INVCMOS',
    'Mixed_Signal/PWM_Decremental/PWM_Decremental', 'Mixed_Signal/PWM_Decremental/lm_741',
    'Mixed_Signal/PWM_Incremental/PWM_Incremental', 'Mixed_Signal/PWM_Incremental/lm_741',
    'Mixed_Signal/custom_mixed_signal/custom_mixed_signal', 'Mixed_Signal/custom_mixed_signal/lm_741',
    'Phase_Locked_Loop/Chargepump/Chargepump', 'Phase_Locked_Loop/PFD/PFD',
    'Phase_Locked_Loop/PLL/PLL', 'Phase_Locked_Loop/VCO_2/VCO_2',
    'Phase_Locked_Loop/freq_divider/freq_divider',
]]
for path in PATHS:
    target = root / path
    if target.exists():
        continue
    target.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(f'https://raw.githubusercontent.com/FOSSEE/eSim/{REVISION}/{path}', timeout=30) as response:
        target.write_bytes(response.read())
    print(path, target.stat().st_size, flush=True)
