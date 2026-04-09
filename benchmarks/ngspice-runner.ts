/**
 * Runs a netlist through ngspice in batch mode and extracts timing info.
 *
 * ngspice quirks handled:
 * - Batch mode requires .print/.plot OR .control block
 * - MOSFETs need 4 terminals (D G S B) — our netlists use 3 (D G S)
 * - We inject a .control block to run and quit, which avoids needing .print
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface NgspiceResult {
  analysisTimeMs: number;
  totalTimeMs: number;
  output: string;
}

let ngspicePath: string | null = null;

export function hasNgspice(): boolean {
  if (ngspicePath !== null) return true;
  try {
    const path = execSync('which ngspice', { encoding: 'utf-8' }).trim();
    if (path) {
      ngspicePath = path;
      return true;
    }
  } catch {
    // not installed
  }
  return false;
}

/**
 * Adapt a spice-ts netlist for ngspice compatibility:
 * - Add bulk terminal to 3-terminal MOSFETs (source = bulk for NMOS to gnd, PMOS to vdd)
 * - Inject .control block for batch execution
 */
function adaptForNgspice(netlist: string): string {
  const lines = netlist.split('\n');
  const adapted: string[] = [];
  let hasControl = false;

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    // Skip .end — we'll add it after .control block
    if (trimmed === '.end') continue;

    if (trimmed.startsWith('.control')) hasControl = true;

    // Fix 3-terminal MOSFETs → 4-terminal (add bulk)
    // spice-ts: M1 drain gate source MODEL
    // ngspice:  M1 drain gate source bulk MODEL
    const mosfetMatch = line.match(/^(M\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(NMOD|PMOD|NMOS\S*|PMOS\S*)\s*$/i);
    if (mosfetMatch) {
      const [, name, drain, gate, source, model] = mosfetMatch;
      // NMOS bulk → source (or 0), PMOS bulk → source (or vdd)
      const bulk = model.toUpperCase().startsWith('P') ? source : source;
      adapted.push(`${name} ${drain} ${gate} ${source} ${bulk} ${model}`);
      continue;
    }

    adapted.push(line);
  }

  if (!hasControl) {
    adapted.push('.control');
    adapted.push('run');
    adapted.push('rusage all');
    adapted.push('quit');
    adapted.push('.endc');
  }
  adapted.push('.end');

  return adapted.join('\n');
}

export function runNgspice(netlist: string): NgspiceResult {
  const dir = mkdtempSync(join(tmpdir(), 'spicets-bench-'));
  const netlistPath = join(dir, 'circuit.cir');

  try {
    const adapted = adaptForNgspice(netlist);
    writeFileSync(netlistPath, adapted);

    const output = execSync(`${ngspicePath ?? 'ngspice'} -b "${netlistPath}" 2>&1`, {
      encoding: 'utf-8',
      timeout: 120_000,
    });

    // Parse "Total analysis time (seconds) = X.XXXXXX"
    const analysisMatch = output.match(/Total analysis time \(seconds\)\s*=\s*([\d.e+-]+)/);
    const totalMatch = output.match(/Total elapsed time \(seconds\)\s*=\s*([\d.e+-]+)/);

    return {
      analysisTimeMs: analysisMatch ? parseFloat(analysisMatch[1]) * 1000 : -1,
      totalTimeMs: totalMatch ? parseFloat(totalMatch[1]) * 1000 : -1,
      output,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
