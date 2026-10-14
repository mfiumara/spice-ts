// Self-authored, project-licensed regression decks, passed byte-identically to both engines.
export const PULL_DECKS = {
  down: ['pull down alone', 'v1 supply 0 1', 'a1 d pd', '.model pd d_pulldown',
    '.tran 1n 10n', '.end'].join('\n'),
  strong: ['pull vs strong drivers', 'v1 hi 0 1', 'v2 lo 0 0',
    'a1 d pd', 'a2 u pu', 'a3 [hi lo] [d u] adc',
    '.model pd d_pulldown (load=3p)', '.model pu d_pullup (load=4p)',
    '.model adc adc_bridge', '.tran 1n 10n', '.end'].join('\n'),
  dac: ['pull up into dac', 'a1 d pu', '.model pu d_pullup (load=7p)',
    'a2 [d] [out] dac', '.model dac dac_bridge (out_low=-1 out_high=3.3)',
    'r1 out 0 1k', '.tran 1n 10n', '.end'].join('\n'),
  conflict: ['resistive conflict and inverted output', 'v1 supply 0 1',
    'a1 d pd', 'a2 d pu', 'a3 ~inv pd',
    '.model pd d_pulldown', '.model pu d_pullup', '.tran 1n 10n', '.end'].join('\n'),
};
