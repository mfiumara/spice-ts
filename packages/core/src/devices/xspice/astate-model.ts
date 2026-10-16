import { real, STATIC, type CodeModelBehavior, type ResolvedXspiceParams } from './models.js';

/** analog/astate: a bounded history of accepted input values, never Newton iterates. */
export function astate(params: ResolvedXspiceParams): CodeModelBehavior {
  const depth = real(params, 'astate_no');
  const history = new Float64Array(3);
  return {
    stateful: true, ac: STATIC,
    load(call) {
      const passthrough = call.analysis !== 'tran' || depth === 0;
      call.outputs[0] = passthrough ? call.inputs[0] : history[depth - 1];
      // ngspice astate supplies no DC partial or AC_GAIN (transient-only model).
      call.partials[0] = call.analysis === 'tran' && depth === 0 ? 1 : 0;
    },
    accept(call) {
      if (call.analysis === 'ac') return;
      if (call.analysis === 'dc') history.fill(0);
      else {
        history[2] = history[1];
        history[1] = history[0];
      }
      history[0] = call.inputs[0];
    },
    reset() { history.fill(0); },
  };
}
