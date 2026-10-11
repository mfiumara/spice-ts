import { describe, expect, it } from 'vitest';
import { InvalidCircuitError, ParseError } from '../errors.js';
import { parseTitleless as parse } from '../parser/index.js';
import { simulate } from '../simulate.js';
import { computeTxlCoefficients, TxlLine } from './txl.js';
import { computeCplCoefficients, CplLines, cplMatricesFromUpperTriangles, type CplTerms } from './cpl.js';

// ngspice-47 TXL (Y) and CPL (P) lossy lines, issue #491. Decks below are
// ngspice tests/transmission fixtures (BSD-3-Clause, ngspice 3ef069fb) and one
// project-authored linear 4-line deck that reuses the cpl1_4_line.sp model.
//
// Coefficient references: the ReadTxL/ReadCpL + coupled() setup code of
// ngspice-47 (txlsetup.c / cplsetup.c) copied verbatim into a C harness and
// built with `cc -O2 -ffp-contract=off`, i.e. IEEE double arithmetic without
// fused multiply-add, which is what JavaScript computes. (The Homebrew arm64
// ngspice binary contains fused multiply-adds; on ill-conditioned symmetric
// and 4-line models FMA rounding alone moves the CPL Pade fits, see
// benchmarks/txl-cpl/README.md.)
//
// Waveform references: ngspice-47 (Homebrew) on the identical netlist plus
//   .control / set numdgt=15 / run / wrdata out v(..) / .endc
// sampled at every Nth ngspice timepoint plus the last. spice-ts is linearly
// interpolated onto those times.

type Reference = ReadonlyArray<readonly number[]>;

// Measured spice-ts max |err| on the sampled points (volts), bounds just above:
// txl1 0.0181 / 0.0380 of a 5.27 V swing; cpl_ibm2 4.3e-4 of 0.69 V;
// 4-line 0.0211 of 4.18 V. The residual is time-step placement: spice-ts
// takes its own LTE-controlled steps, ngspice's are not reproduced.
const TXL1_BOUND = 0.04;
const IBM2_BOUND = 5e-4;
const LIN4_BOUND = 0.025;

function rel(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-300);
}

function maxErrors(time: number[], series: number[][], reference: Reference): number[] {
  const interp = (values: number[], t: number): number => {
    if (t <= time[0]) return values[0];
    let lo = 0;
    let hi = time.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (time[mid] <= t) lo = mid; else hi = mid;
    }
    if (t >= time[hi]) return values[hi];
    const f = (t - time[lo]) / (time[hi] - time[lo]);
    return values[lo] + f * (values[hi] - values[lo]);
  };
  return series.map((values, k) =>
    Math.max(...reference.map(row => Math.abs(interp(values, row[0]) - row[k + 1]))));
}

const TXL1_DECK = `MOSdriver -- lossy line TXL model -- C load
m5     0     168    2     0  mn0p9  w = 18.0u l=0.9u
m6     1     168    2     1  mp1p0  w = 36.0u l=1.0u
CN2  2   0  0.025398e-12
CN3  3   0  0.007398e-12
y1  2 0 3 0 ymod
vdd    1    0   dc 	5.0
VS 168  0  PULSE (0 5 15.9NS 0.2NS 0.2NS 15.8NS 32NS )
.OPTION NOACCT
.TRAN 0.2N 47N 0 0.1N
.PRINT TRAN V(2) V(3)
.MODEL mn0p9 NMOS VTO=0.8 KP=48U GAMMA=0.30 PHI=0.55
+LAMBDA=0.00 CGSO=0 CGDO=0 CJ=0 CJSW=0 TOX=18000N LD=0.0U
.MODEL mp1p0 PMOS VTO=-0.8 KP=21U GAMMA=0.45 PHI=0.61
+LAMBDA=0.00 CGSO=0 CGDO=0 CJ=0 CJSW=0 TOX=18000N LD=0.0U
.MODEL ymod txl R=12.45 L=8.972e-9 G=0 C=0.468e-12 length=16
.end
`;

// ngspice-47 tests/transmission/txl1_1_line.cir: 492 points, every 25th + last; time, v(2), v(3).
const NGSPICE_TXL1: Reference = [
  [0, 4.999999997792265, 4.999999997593065],
  [1.928e-9, 4.999630884737271, 4.999443609266483],
  [4.428000000000002e-9, 4.999072961719199, 4.998747472808826],
  [6.928000000000003e-9, 4.998843456154662, 4.998463034295488],
  [9.427999999999989e-9, 4.998760299210083, 4.998356616150229],
  [1.192799999999997e-8, 4.998728719906906, 4.998311565577475],
  [1.442799999999995e-8, 4.998715070845124, 4.998287392975464],
  [1.635e-8, 3.611582386422151, 4.998419791553319],
  [1.885000000000002e-8, 1.781168314646568, 2.391554756886726],
  [2.135000000000005e-8, 0.6541707140708165, 0.8381823858503912],
  [2.385000000000007e-8, 0.1814881286245109, 0.2344556877992205],
  [2.635000000000009e-8, -0.01206904985348171, -0.01089247133158076],
  [2.885000000000011e-8, -0.1100984148860378, -0.140773259695707],
  [3.135000000000013e-8, -0.1714858107245314, -0.2254576873753842],
  [3.303800266544296e-8, 1.083798613249757, -0.1645700116371404],
  [3.54967930947191e-8, 2.58420935316139, 2.122729850783485],
  [3.799679309471912e-8, 3.649764453973668, 3.354803785643942],
  [4.049679309471914e-8, 4.241107842245013, 4.048677536043659],
  [4.299679309471916e-8, 4.55525210833897, 4.427265094501282],
  [4.549679309471919e-8, 4.741182200966076, 4.653858586854303],
  [4.7e-8, 4.821274144331679, 4.753366984022881],
];

const CPL_IBM2_DECK = `Simple coupled transmissionlines
VES IN 0  PULSE (0 1 0N 1.5N 1.5N 4.5N 200N)
R1 IN V1 50
R2 V2 0  10
p1 V1  V2  0 V3  V4 0 cpl1
.model cpl1 cpl
+R = 0.5 0 0.5
+L = 247.3e-9  31.65e-9
+              247.3e-9
+C = 31.4e-12 -2.45e-12
+              31.4e-12
+G = 0 0 0
+length = 0.3048
R3 V3 0 100
R4 V4 0 100
.OPTION NOACCT
.TRAN 0.1N 20N
.PRINT TRAN V(V1) V(V3)
.END
`;

// ngspice-47 tests/transmission/cpl_ibm2.cir: 217 points, every 12th + last; time, v(v1), v(v3).
const NGSPICE_CPL_IBM2: Reference = [
  [0, 0, 0],
  [5.28e-10, 0.2245916106093069, -1.055328928777296e-12],
  [1.53e-9, 0.63804296777247, 0.3094114871270935],
  [2.650000000000001e-9, 0.6579886656487142, 0.6750906305842004],
  [3.850000000000001e-9, 0.6674953511447119, 0.6669037504409705],
  [5.050000000000002e-9, 0.6665968097802147, 0.6665801083010121],
  [6.03e-9, 0.6538891004307267, 0.6667333816357246],
  [7.15e-9, 0.1775040542606661, 0.5287271233030353],
  [8.049999999999996e-9, 0.0207434991555613, 0.1233665351332351],
  [9.249999999999987e-9, -0.001293784086294667, -0.004195833209703719],
  [1.044999999999998e-8, -0.0001991307257042927, 0.0004229395581880384],
  [1.164999999999997e-8, 0.00008913060131035132, 0.00007335137318735264],
  [1.284999999999996e-8, 0.00004725437672430236, 0.0000953534029451625],
  [1.404999999999995e-8, 0.00005087857883360524, 0.0001008524714016122],
  [1.524999999999995e-8, 0.00005089625354467151, 0.0001000626248608446],
  [1.644999999999996e-8, 0.0000508164746713936, 0.0001001305797424477],
  [1.764999999999997e-8, 0.00005082576930982793, 0.0001001314485885954],
  [1.884999999999998e-8, 0.00005082512127167737, 0.0001001299217588511],
  [2e-8, 0.00005082503931473758, 0.0001001300967175581],
];

const CPL_4_LINE_DECK = `linear 4-line CPL (cpl1_4_line.sp model, resistive terminations)
VS 1 0 PULSE(0 5 1n 0.2n 0.2n 15.8n 32n)
RS 1 5 50
R6 6 0 50
R7 7 0 50
R8 8 0 50
P1 5 6 7 8 0 9 10 11 12 0 pline
R9 9 0 100
R10 10 0 100
R11 11 0 100
R12 12 0 100
.MODEL PLINE cpl
+R=0.03 0 0 0 0.03 0 0 0.03 0 0.03
+L=9e-9 5.4e-9 0 0 9e-9 5.4e-9 0 9e-9 5.4e-9 9e-9
+G=0 0 0 0 0 0 0 0 0 0
+C=3.5e-13 -3e-14 0 0 3.5e-13 -3e-14 0 3.5e-13 -3e-14 3.5e-13
+length=6.3
.tran 0.02n 40n 0 0.02n
.end
`;

// ngspice-47 on CPL_4_LINE_DECK: 2026 points, every 100th + last; time, v(5), v(9), v(11).
const NGSPICE_CPL_4_LINE: Reference = [
  [0, 0, 0, 0],
  [1.749999999999998e-9, 3.689473666660392, 2.927350877115536, -0.03178426157497389],
  [3.749999999999992e-9, 3.343048668027568, 3.31585766124436, -0.01131754117209612],
  [5.750000000000027e-9, 3.333530381429822, 3.332329841772678, -0.002050638256963848],
  [7.75000000000005e-9, 3.333192508147206, 3.333028343891229, -0.001028702785016716],
  [9.750000000000001e-9, 3.333180359691941, 3.333078725512149, -0.0009510082600235323],
  [1.174999999999995e-8, 3.333179462766485, 3.333082472055921, -0.0009449720658254661],
  [1.37499999999999e-8, 3.333179396527744, 3.333082595586183, -0.0009447727821058717],
  [1.574999999999986e-8, 3.333179391559056, 3.333082601139878, -0.000944763787783615],
  [1.762999999999999e-8, -0.4019378748114126, 0.4590631816393907, 0.1213664493826372],
  [1.962999999999994e-8, -0.008296818168962133, 0.0174334157597969, 0.01535291855463102],
  [2.162999999999989e-8, 0.001001240714417254, 0.0009852294909526835, 0.006134140163958362],
  [2.362999999999984e-8, 0.001608928675163886, 0.0002776198287693215, 0.005122570151928558],
  [2.562999999999979e-8, 0.001624451735625997, 0.0002274739730247453, 0.005045239998462819],
  [2.762999999999975e-8, 0.001625344300240547, 0.000223799452117741, 0.005039329905040519],
  [2.96299999999997e-8, 0.001625410308774702, 0.0002235499655749843, 0.005038926615461998],
  [3.162999999999995e-8, 0.001625415235238234, 0.0002235435028341093, 0.005038916154317605],
  [3.351000000000005e-8, 3.756522275242305, 2.216883438999214, -0.1581836206507956],
  [3.551000000000033e-8, 3.348412007998862, 3.316026344493558, -0.005692021252048717],
  [3.751000000000061e-8, 3.335722844300783, 3.332552240815685, 0.003954622921939528],
  [3.951000000000089e-8, 3.335082773193152, 3.333385690520045, 0.004893572374980873],
  [4e-8, 3.33505807423089, 3.333403912704343, 0.004920671724067459],
];

describe('TXL Y-card and CPL P-card parsing (ngspice inp2y.c / inp2p.c)', () => {
  it('builds a TXL line from the Y card and a scalar TXL model', () => {
    const compiled = parse([
      'V1 a 0 1',
      'Y1 a 0 b 0 ymod',
      'R1 b 0 50',
      '.model ymod txl R=12.45 L=8.972e-9 G=0 C=0.468e-12 length=16',
      '.tran 1n 10n',
    ].join('\n')).compile();
    const line = compiled.devices.find(device => device.name === 'Y1');
    expect(line).toBeInstanceOf(TxlLine);
    expect(compiled.branchNames).toEqual(expect.arrayContaining(['Y1:1', 'Y1:2']));
  });

  it('accepts the instance len= override on Y and P cards', () => {
    for (const card of ['Y1 a 0 b 0 ymod len=8', 'Y1 a 0 b 0 ymod len 8']) {
      const compiled = parse(`V1 a 0 1\n${card}\nR1 b 0 50\n.model ymod txl R=1 L=1e-8 G=0 C=1e-12 length=16\n.tran 1n 10n`).compile();
      expect(compiled.devices.find(device => device.name === 'Y1')).toBeInstanceOf(TxlLine);
    }
    const compiled = parse([
      'V1 a 0 1',
      'P1 a b 0 c d 0 pmod len=0.5',
      'R1 b 0 50', 'R2 c 0 50', 'R3 d 0 50',
      '.model pmod cpl R=0.5 0 0.5 L=247.3e-9 31.65e-9 247.3e-9 G=0 0 0 C=31.4e-12 -2.45e-12 31.4e-12 length=0.3048',
      '.tran 1n 10n',
    ].join('\n')).compile();
    const lines = compiled.devices.find(device => device.name === 'P1');
    expect(lines).toBeInstanceOf(CplLines);
    expect((lines as CplLines).length).toBe(0.5);
  });

  it('reads the CPL vector model across continuation lines (upper triangle, row major)', () => {
    const circuit = parse(CPL_IBM2_DECK.split('\n').slice(1).join('\n'));
    const compiled = circuit.compile();
    const lines = compiled.devices.find(device => device.name === 'p1') as CplLines;
    expect(lines).toBeInstanceOf(CplLines);
    expect(lines.lines).toBe(2);
    expect(compiled.branchNames).toEqual(expect.arrayContaining(['p1:1_0', 'p1:1_1', 'p1:2_0', 'p1:2_1']));
  });

  it('simulates a TXL model with R/L > 1.6e9 as CPL, as ngspice does', () => {
    const compiled = parse([
      'V1 a 0 1', 'Y1 a 0 b 0 ymod', 'R1 b 0 50',
      '.model ymod txl R=100 L=5e-8 G=0 C=1e-12 length=0.1',
      '.tran 1n 10n',
    ].join('\n')).compile();
    expect(compiled.devices.find(device => device.name === 'Y1')).toBeInstanceOf(CplLines);
  });

  it.each([
    ['a P card with an even node count', 'P1 a b 0 c 0 pmod'],
    ['a P card without enough nodes', 'P1 a 0 b pmod'],
    ['a Y card without a model', 'Y1 a 0 b 0'],
  ])('rejects %s with a ParseError', (_label, card) => {
    expect(() => parse(`V1 a 0 1\n${card}\n.model pmod cpl R=1 L=1n G=0 C=1p length=1\n.tran 1n 10n`).compile())
      .toThrow(ParseError);
  });

  it.each([
    ['a CPL matrix with the wrong element count', 'P1 a b 0 c d 0 pmod', '.model pmod cpl R=1 0 1 L=1n 0 1n G=0 0 0 C=1p 0 1p 0 length=1', /upper triangle/],
    ['a TXL model without a length', 'Y1 a 0 b 0 ymod', '.model ymod txl R=1 L=1n G=0 C=1p', /length must be given/],
    ['a P card bound to a TXL model', 'P1 a 0 b 0 ymod', '.model ymod txl R=1 L=1n G=0 C=1p length=1', /needs a CPL model/],
    ['an unknown model', 'Y1 a 0 b 0 nomod', '', /unknown model/],
  ])('rejects %s with an InvalidCircuitError', (_label, card, model, message) => {
    const run = () => parse(`V1 a 0 1\n${card}\nR1 b 0 1\n${model}\n.tran 1n 10n`).compile();
    expect(run).toThrow(InvalidCircuitError);
    expect(run).toThrow(message);
  });

  it('rejects analyses ngspice TXL/CPL do not define with a typed error', () => {
    const run = () => parse([
      'V1 a 0 AC 1', 'Y1 a 0 b 0 ymod', 'R1 b 0 50',
      '.model ymod txl R=12.45 L=8.972e-9 G=0 C=0.468e-12 length=16',
      '.ac dec 10 1meg 1g',
    ].join('\n')).compile();
    expect(run).toThrow(InvalidCircuitError);
    expect(run).toThrow(/support only \.op, \.dc and \.tran/);
  });
});

describe('TXL/CPL setup coefficients match the ngspice-47 setup code', () => {
  it('reproduces ReadTxL for the txl1_1_line model', () => {
    const ts = computeTxlCoefficients(12.45, 8.972e-9, 0, 0.468e-12, 16);
    expect(ts.lossless).toBe(false);
    expect(ts.ifImg).toBe(false);
    const expected: [number, number][] = [
      [ts.taul, 1036.7822220698038],
      [ts.sqtCdL, 0.0072223460632370425],
      [ts.h1C, -5011045.9477987774],
      [ts.h2Aten, 0.48707085781090981],
      [ts.h3Aten, 0.0035177942924281137],
      [ts.h1c[0], -3116913.0127078136], [ts.h1x[0], -1294695512.5454922],
      [ts.h1c[2], -223784.28582467159], [ts.h1x[2], -92954955.577564731],
      [ts.h2c[1], 70922821.889925435], [ts.h2x[1], -471891785.1181848],
      [ts.h3c[5], -73251.367249283721], [ts.h3x[5], -55830477.679709695],
    ];
    for (const [actual, reference] of expected) expect(rel(actual, reference)).toBeLessThan(1e-12);
  });

  it('reproduces ReadCpL/coupled() for the cpl_ibm2 two-line model', () => {
    const ts = computeCplCoefficients(cplMatricesFromUpperTriangles(2, {
      R: [0.5, 0, 0.5], L: [247.3e-9, 31.65e-9, 247.3e-9], G: [0, 0, 0], C: [31.4e-12, -2.45e-12, 31.4e-12],
    }), 0.3048);
    expect(rel(ts.taul[0], 866.1685875634142)).toBeLessThan(1e-12);
    expect(rel(ts.taul[1], 823.5102904624812)).toBeLessThan(1e-12);
    const check = (terms: CplTerms | null, aten: number, ifImg: boolean, tm: [number, number][]) => {
      expect(terms).not.toBeNull();
      expect(terms!.ifImg).toBe(ifImg);
      expect(rel(terms!.aten, aten)).toBeLessThan(1e-12);
      tm.forEach(([c, x], k) => {
        expect(rel(terms!.c[k], c)).toBeLessThan(1e-10);
        expect(rel(terms!.x[k], x)).toBeLessThan(1e-10);
      });
    };
    check(ts.h1[0], 0.011358003257389119, false, [
      [-1.7901255493832044e-05, -0.00557195153249542],
      [-1.2769790779293512e-05, -0.002879834076543713],
      [-1.2822641941839954e-06, -0.0003455261337523262],
    ]);
    check(ts.h1[1], -0.0011706562135274292, true, [
      [-2.1521467850472504e-08, 0.00028556036015229625],
      [3.6510948297482844e-06, -0.00569750470561271],
      [5.2219750075183035e-06, 0.0005477610765317573],
    ]);
    // h3[0][1][1]: index (row * lines + column) * lines + mode.
    check(ts.h3[(0 * 2 + 1) * 2 + 1], -0.0062643297354421194, false, [
      [1.3306157107944624e-05, -0.005745370904060813],
      [5.807614934900235e-06, -0.002678547153383416],
      [5.032172865603662e-07, -0.0002826817154720218],
    ]);
  });
});

describe('TXL/CPL transient waveforms against ngspice-47 on identical netlists', () => {
  // Bounds are the measured spice-ts error on these samples rounded up; the
  // PR records the full-resolution numbers (max |err| / swing) for each deck.
  it('txl1_1_line: MOS driver into a 16 m TXL', async () => {
    const result = await simulate(TXL1_DECK);
    const tr = result.transient!;
    const errors = maxErrors(tr.time, [tr.voltage('2'), tr.voltage('3')], NGSPICE_TXL1);
    expect(errors[0]).toBeLessThan(TXL1_BOUND);
    expect(errors[1]).toBeLessThan(TXL1_BOUND);
  });

  it('cpl_ibm2: two coupled lines, resistive terminations', async () => {
    const result = await simulate(CPL_IBM2_DECK);
    const tr = result.transient!;
    const errors = maxErrors(tr.time, [tr.voltage('V1'), tr.voltage('V3')], NGSPICE_CPL_IBM2);
    expect(Math.max(...errors)).toBeLessThan(IBM2_BOUND);
  });

  it('four coupled lines (cpl1_4_line model), resistive terminations', async () => {
    const result = await simulate(CPL_4_LINE_DECK);
    const tr = result.transient!;
    const errors = maxErrors(tr.time, [tr.voltage('5'), tr.voltage('9'), tr.voltage('11')], NGSPICE_CPL_4_LINE);
    expect(Math.max(...errors)).toBeLessThan(LIN4_BOUND);
  }, 20_000);
});
