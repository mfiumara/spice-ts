// Vector = [canonical name, iterable doubles]. Receipt = mode/status/boundaries plus raw evidence.
import { createHash } from 'node:crypto';

/** #958 serialization, explicitly little-endian rather than host-dependent. */
export function hashVectors(vectors) {
  const digest = createHash('sha256');
  let count = 0, number = 0;
  for (const [name, data] of vectors) {
    const values = Float64Array.from(data);
    const bytes = Buffer.allocUnsafe(values.length * 8);
    values.forEach((value, i) => bytes.writeDoubleLE(value, i * 8));
    digest.update(name + '\0').update(bytes);
    number++; count += values.length;
  }
  return { outputSha256: digest.digest('hex'), vectors: number, count };
}

/** Full native binary transient plot, not .print's single rounded probe. */
export function parseRaw(buffer) {
  const marker = Buffer.from('Binary:\n');
  const at = buffer.indexOf(marker);
  if (at < 0) throw new Error('missing binary raw plot');
  const header = buffer.subarray(0, at).toString('utf8');
  if (!/^Flags:\s*real\s*$/m.test(header)) throw new Error('expected real plot');
  const variables = Number(header.match(/^No\. Variables:\s*(\d+)/m)?.[1]);
  const points = Number(header.match(/^No\. Points:\s*(\d+)/m)?.[1]);
  const names = [...header.matchAll(/^\s*\d+\s+(\S+)\s+(time|voltage|current)\s*$/gm)].map(([, name, kind]) =>
    kind === 'time' ? 'time' : kind === 'voltage' ? 'tran-v:' + name.replace(/^v\((.*)\)$/i, '$1') : 'tran-i:' + name.replace(/^i\((.*)\)$/i, '$1').toUpperCase());
  const payload = buffer.subarray(at + marker.length);
  if (!Number.isInteger(variables) || variables < 1 || !Number.isInteger(points) || points < 1 || names.length !== variables || payload.length !== variables * points * 8) throw new Error('incomplete raw output');
  return names.map((name, column) => {
    const values = new Float64Array(points);
    for (let row = 0; row < points; row++) values[row] = payload.readDoubleLE((row * variables + column) * 8);
    return [name, values];
  });
}

export function statistics(values) {
  if (!values.length || values.some(v => !Number.isFinite(v) || v < 0)) throw new Error('invalid distribution');
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = p => {
    const index = (sorted.length - 1) * p;
    const low = Math.floor(index), high = Math.ceil(index);
    return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
  };
  const q1 = quantile(0.25), q3 = quantile(0.75);
  return { n: values.length, min: sorted[0], q1, median: quantile(0.5), q3, iqr: q3 - q1, max: sorted.at(-1) };
}

export function summarize(receipts) {
  const summary = {};
  for (const mode of new Set(receipts.map(r => r.mode))) {
    const rows = receipts.filter(r => r.mode === mode);
    const boundaries = {};
    for (const key of new Set(rows.flatMap(r => Object.keys(r.boundaries ?? {})))) {
      const values = rows.map(r => r.boundaries?.[key]).filter(v => typeof v === 'number');
      boundaries[key] = values.length ? statistics(values) : null;
    }
    summary[mode] = { attempted: rows.length, failures: rows.filter(r => r.status !== 'ok').length, boundaries };
  }
  return summary;
}

/** Correct only the documented first controller epoch error, retaining its invalid flag. */
export function rederiveEpoch(row) {
  if (row.certificationError !== 'hrtime-epoch-disagreement') return row;
  if (Math.abs((row.end.continuous - row.start.continuous) - (row.end.monotonic - row.start.monotonic)) > 0.1) throw new Error('actual clock disagreement cannot be repaired');
  const startup = Number(row.worker.firstNs) / 1e6 - row.start.continuous * 1000;
  const exit = row.end.continuous * 1000 - Number(row.worker.doneNs) / 1e6;
  if (startup < 0 || exit < 0 || startup + exit > row.boundaries.wall) throw new Error('epoch correction outside parent');
  return { ...row, boundaries: { ...row.boundaries, spawnFirstUserCode: startup, exit },
    derivedCorrection: 'macOS Node hrtime continuous epoch; original invalid receipt retained' };
}
