/**
 * Deterministic generated AC decks for the issue #740 complex-LU ordering
 * benchmark. Original generated material for this repository (MIT, like
 * spice-ts); no third-party circuit is used. Each generator returns one deck
 * that is handed byte-identical to spice-ts and ngspice-47.
 *
 * - rc-ladder-ac: the #426 RC ladder (1 kOhm / 1 pF per node) driven by an
 *   AC source. Its natural MNA order is already fill-free.
 * - rc-mesh-ac: the #426 square resistor mesh (1 kOhm edges, 1 V at one
 *   corner, 1 kOhm to ground at the opposite corner) with 1 pF from every node
 *   to ground. Natural order fills like a banded matrix (O(n^1.5)).
 * - vcvs-ladder-ac: the #732/#740 synthetic deck: an RC ladder (100 Ohm /
 *   1 pF) with a VCVS buffer (gain 2, 1 kOhm load, 0 V ammeter, 1 pF) every 50
 *   stages. `nodes` is the stage count. This is the deck where ngspice-style
 *   pivot acceptance forces row swaps.
 */

export const AC_CIRCUITS = ['rc-ladder-ac', 'rc-mesh-ac', 'vcvs-ladder-ac'];

function requireSize(nodes) {
  if (!Number.isInteger(nodes) || nodes < 2) throw new Error('nodes must be an integer >= 2');
}

export function rcLadderAc(nodes) {
  requireSize(nodes);
  const lines = [`* spice-ts generated RC ladder AC: ${nodes} nodes`, '.options acct', 'V1 n0 0 DC 0 AC 1'];
  for (let index = 1; index < nodes; index++) {
    lines.push(`R${index} n${index - 1} n${index} 1k`, `C${index} n${index} 0 1p`);
  }
  const probe = `n${Math.min(nodes - 1, 10)}`;
  lines.push('.ac dec 10 1k 10g', `.print ac vr(${probe}) vi(${probe})`, '.end');
  return { netlist: `${lines.join('\n')}\n`, actualNodes: nodes, probe };
}

export function rcMeshAc(nodes) {
  requireSize(nodes);
  const side = Math.ceil(Math.sqrt(nodes));
  const name = (row, column) => `n${row}_${column}`;
  const lines = [
    `* spice-ts generated ${side}x${side} RC mesh AC: ${side * side} nodes`,
    '.options acct',
    `V1 ${name(0, 0)} 0 DC 0 AC 1`,
    `RGND ${name(side - 1, side - 1)} 0 1k`,
  ];
  let resistor = 0;
  let capacitor = 0;
  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) {
      if (column + 1 < side) lines.push(`R${++resistor} ${name(row, column)} ${name(row, column + 1)} 1k`);
      if (row + 1 < side) lines.push(`R${++resistor} ${name(row, column)} ${name(row + 1, column)} 1k`);
      lines.push(`C${++capacitor} ${name(row, column)} 0 1p`);
    }
  }
  const probe = name(side - 1, side - 1);
  lines.push('.ac dec 2 1k 1g', `.print ac vr(${probe}) vi(${probe})`, '.end');
  return { netlist: `${lines.join('\n')}\n`, actualNodes: side * side, probe };
}

export function vcvsLadderAc(stages) {
  requireSize(stages);
  const lines = [`* spice-ts generated RC ladder with a VCVS buffer every 50 stages: ${stages} stages`, '.options acct', 'VIN n0 0 DC 0 AC 1'];
  let previous = 'n0';
  let nodes = 1;
  for (let index = 1; index <= stages; index++) {
    lines.push(`R${index} ${previous} n${index} 100`, `C${index} n${index} 0 1p`);
    previous = `n${index}`;
    nodes++;
    if (index % 50 === 0) {
      lines.push(
        `E${index} b${index} 0 n${index} 0 2`,
        `RL${index} b${index} m${index} 1k`,
        `VM${index} m${index} x${index} 0`,
        `CX${index} x${index} 0 1p`,
      );
      previous = `x${index}`;
      nodes += 3;
    }
  }
  const probe = previous;
  lines.push('.ac dec 50 1 1g', `.print ac vr(${probe}) vi(${probe})`, '.end');
  return { netlist: `${lines.join('\n')}\n`, actualNodes: nodes, probe };
}

export function acNetlist(circuit, nodes) {
  switch (circuit) {
    case 'rc-ladder-ac': return rcLadderAc(nodes);
    case 'rc-mesh-ac': return rcMeshAc(nodes);
    case 'vcvs-ladder-ac': return vcvsLadderAc(nodes);
    default: throw new Error(`unknown #740 AC circuit '${circuit}'`);
  }
}
