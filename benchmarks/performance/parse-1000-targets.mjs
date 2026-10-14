// ParsePhase = exclusive elapsed ms in benchmark-only built copies, never production.
export const parseTargets = {
  preprocessDeck: 'preprocess',
  expandFunctionCalls: 'numparam.expandFunctionCalls',
  braceBareParameters: 'numparam.braceBareParameters',
  createParamScopes: 'numparam.createParamScopes',
  circuitTemperature: 'numparam.circuitTemperature',
  substituteStatement: 'numparam.substituteStatement',
  measureName: 'numparam.measureName',
  tokenizeNetlist: 'tokenize',
  parseNetlist: 'cardParse',
  'Circuit.addResistor': 'assembly',
  'Circuit.addCapacitor': 'assembly',
  'Circuit.addInductor': 'assembly',
  'Circuit.addVoltageSource': 'assembly',
  'Circuit.addCurrentSource': 'assembly',
  'Circuit.addAnalysis': 'assembly',
  'Circuit.setParameters': 'assembly',
};
export const parsePhases = ['preprocess', 'numparam', 'tokenize', 'cardParse', 'assembly', 'parseResidual'];
