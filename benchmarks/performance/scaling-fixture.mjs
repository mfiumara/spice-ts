/** Generate the byte-identical DC ladder supplied to both benchmark engines. */
export function scalingLadder(nodes) {
  if (!Number.isInteger(nodes) || nodes < 1) throw new Error('nodes must be a positive integer');
  const lines = [
    `* spice-ts generated DC scaling ladder: ${nodes} nodes`,
    'V1 1 0 DC 5',
  ];
  for (let node = 1; node <= nodes; node++) {
    lines.push(`R${node} ${node} ${node < nodes ? node + 1 : 0} 1k`);
  }
  lines.push('.op', '.options acct', '.print op v(1)', '.end');
  return `${lines.join('\n')}\n`;
}
