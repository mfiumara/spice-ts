/**
 * Deterministic generated netlists for the issue #426 M2 scaling comparison.
 *
 * Every generator returns one byte-identical deck that is handed unchanged to
 * both spice-ts and ngspice. The decks are original generated material written
 * for this repository (MIT, same as spice-ts); no third-party circuit is used.
 *
 * `nodes` is the requested size. Each generator reports the exact number of
 * non-ground circuit nodes it emitted, because the 2-D mesh rounds to a square.
 */

export const M2_CIRCUITS = ['rc-ladder-tran', 'resistor-mesh-op', 'cmos-inverter-chain-tran'];

function requireSize(nodes) {
  if (!Number.isInteger(nodes) || nodes < 2) throw new Error('nodes must be an integer >= 2');
}

/**
 * RC ladder transient: a pulse source drives `nodes` series 1 kOhm resistors,
 * each internal node loaded by 1 pF to ground. Linear, so every engine time
 * step is one sparse factor/solve of an n x n system.
 */
export function rcLadderTran(nodes) {
  requireSize(nodes);
  const lines = [
    `* spice-ts generated RC ladder transient: ${nodes} nodes`,
    '.options acct',
    'V1 n0 0 PULSE(0 1 0 1n 1n 50n 100n)',
  ];
  for (let index = 1; index < nodes; index++) {
    lines.push(`R${index} n${index - 1} n${index} 1k`);
    lines.push(`C${index} n${index} 0 1p`);
  }
  const probe = `n${Math.min(nodes - 1, 10)}`;
  lines.push('.tran 1n 100n', `.print tran v(${probe})`, '.end');
  return { netlist: `${lines.join('\n')}\n`, actualNodes: nodes, probe };
}

/**
 * Square 2-D resistor mesh DC operating point. side = ceil(sqrt(nodes)); a
 * 1 V source drives one corner, the opposite corner returns to ground through
 * 1 kOhm, and every grid edge is 1 kOhm.
 */
export function resistorMeshOp(nodes) {
  requireSize(nodes);
  const side = Math.ceil(Math.sqrt(nodes));
  const name = (row, column) => `n${row}_${column}`;
  const lines = [
    `* spice-ts generated ${side}x${side} resistor mesh operating point: ${side * side} nodes`,
    '.options acct',
    `V1 ${name(0, 0)} 0 DC 1`,
    `RGND ${name(side - 1, side - 1)} 0 1k`,
  ];
  let resistor = 0;
  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) {
      if (column + 1 < side) lines.push(`R${++resistor} ${name(row, column)} ${name(row, column + 1)} 1k`);
      if (row + 1 < side) lines.push(`R${++resistor} ${name(row, column)} ${name(row + 1, column)} 1k`);
    }
  }
  const probe = name(side - 1, side - 1);
  lines.push('.op', '.end');
  return { netlist: `${lines.join('\n')}\n`, actualNodes: side * side, probe };
}

/**
 * CMOS inverter chain transient (MOS1, level 1). `nodes` counts vdd, the
 * input and every stage output; each output carries 10 fF. The input step
 * ripples through the chain, so this is the nonlinear Newton workload.
 */
export function cmosInverterChainTran(nodes) {
  requireSize(nodes);
  const stages = nodes - 2;
  if (stages < 1) throw new Error('inverter chain needs at least 3 nodes');
  const lines = [
    `* spice-ts generated CMOS inverter chain transient: ${stages} stages, ${nodes} nodes`,
    '.options acct',
    'VDD vdd 0 DC 2.5',
    'VIN s0 0 PULSE(0 2.5 0.1n 0.1n 0.1n 5n 10n)',
    '.model nch nmos level=1 vto=0.5 kp=120u lambda=0.02',
    '.model pch pmos level=1 vto=-0.5 kp=60u lambda=0.02',
  ];
  for (let stage = 1; stage <= stages; stage++) {
    lines.push(`MP${stage} s${stage} s${stage - 1} vdd vdd pch W=2u L=1u`);
    lines.push(`MN${stage} s${stage} s${stage - 1} 0 0 nch W=1u L=1u`);
    lines.push(`C${stage} s${stage} 0 10f`);
  }
  const probe = `s${Math.min(stages, 20)}`;
  lines.push('.tran 10p 2n', `.print tran v(${probe})`, '.end');
  return { netlist: `${lines.join('\n')}\n`, actualNodes: nodes, probe };
}

export function m2Netlist(circuit, nodes) {
  switch (circuit) {
    case 'rc-ladder-tran': return rcLadderTran(nodes);
    case 'resistor-mesh-op': return resistorMeshOp(nodes);
    case 'cmos-inverter-chain-tran': return cmosInverterChainTran(nodes);
    default: throw new Error(`unknown M2 scaling circuit '${circuit}'`);
  }
}
