import { MNAAssembler } from '../../../../packages/core/src/mna/assembler.js';

const nodes = 10_000;
const repetitions = 50;
let totalNnz = 0;

for (let iteration = 0; iteration < repetitions; iteration++) {
  const assembler = new MNAAssembler(nodes, 0);
  const context = assembler.getStampContext();
  for (let row = 0; row < nodes; row++) {
    context.stampG(row, row, 2);
    if (row > 0) context.stampG(row, row - 1, -1);
    if (row + 1 < nodes) context.stampG(row, row + 1, -1);
    if (row % 7 === 0) context.stampC(row, (row * 17 + 23) % nodes, 1e-9);
  }
  assembler.lockTopology();
  totalNnz += assembler.topologyNnz;
}

process.stdout.write(`${JSON.stringify({ nodes, repetitions, totalNnz })}\n`);
