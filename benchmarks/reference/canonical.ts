import type { AnalysisType } from '../comparison-harness.js';

export interface CanonicalAnalysis {
  type: AnalysisType;
  directive: string;
  recordIndex: number;
}
export interface CanonicalCircuit {
  netlist: string;
  records: string[];
  analyses: CanonicalAnalysis[];
  changes: string[];
  limitations: string[];
}

/** One shared circuit. Both references receive the same ordinal analysis projection. */
export function canonicalize(source: string): CanonicalCircuit {
  const records: string[] = [];
  const changes: string[] = [];
  const limitations: string[] = [];
  const analyses: CanonicalAnalysis[] = [];
  const physical: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*\+/.test(line)) {
      if (!physical.length) limitations.push('Orphan continuation');
      else physical[physical.length - 1] += '\n' + line;
    } else physical.push(line);
  }
  let control = false, terminal = false, endCount = 0, sawAnalysis = false;
  let staticAnalyses = 0, controlAnalyses = 0, hasControl = false;
  const bookkeeping = new Set(['acct', 'noacct', 'list', 'node', 'post', 'trans', 'nopage']);
  for (const [index, record] of physical.entries()) {
    const logical = record.replace(/\n\s*\+/g, ' ').trim();
    if (index === 0) { records.push(record); continue; }
    if (!logical || logical.startsWith('*')) { records.push(record); continue; }
    if (/^\.control\b/i.test(logical)) {
      // Control blocks share circuit/plot state and quit terminates the whole
      // program. Independent static projections cannot prove cross-block
      // execution, cleanup or run semantics; reject the entire source instead.
      if (hasControl) limitations.push('Multiple .control blocks need circuit-global execution semantics');
      hasControl = true;
      if (control) limitations.push('Nested .control');
      control = true; terminal = false; changes.push('Lower static .control block'); continue;
    }
    if (/^\.endc\b/i.test(logical)) {
      if (!control) limitations.push('Orphan .endc');
      control = false; changes.push('Remove .endc after static lowering'); continue;
    }
    let card = logical;
    if (control) {
      if (terminal && !/^(?:remcirc|destroy all|quit(?:\s+0)?)\s*$/i.test(logical)) limitations.push(`Control command after terminal cleanup: ${logical}`);
      if (/^(?:display|print|plot|listing|echo)\b/i.test(logical)) {
        changes.push(`Remove control output: ${logical}`); continue;
      }
      if (/^run\s*$/i.test(logical)) {
        // A static run executes the deck's analyses; repeated runs are not silently deduplicated.
        if (changes.includes('Lower control run to existing static analyses')) limitations.push('Repeated control run');
        changes.push('Lower control run to existing static analyses'); continue;
      }
      if (/^(?:remcirc|destroy all|quit(?:\s+0)?)\s*$/i.test(logical)) {
        terminal = true; changes.push(`Remove terminal control cleanup: ${logical}`); continue;
      }
      if (/^(?:op|dc|ac|tran)\b/i.test(logical)) {
        card = '.' + logical; changes.push(`Lower control analysis: ${logical}`);
      } else {
        limitations.push(`Unsupported control semantics: ${logical}`);
        records.push(record); continue;
      }
    }
    if (/^\.(?:print|plot|save|probe|width|list|status|stat)\b/i.test(card)) {
      changes.push(`Remove output directive: ${logical}`); continue;
    }
    if (/^\.(?:options?|opt)\b/i.test(card)) {
      const tokens = card.split(/\s+/).slice(1);
      if (tokens[0]?.toLowerCase() === 'device') tokens.shift();
      if (tokens.every(token => bookkeeping.has(token.toLowerCase()) || /^(?:temp|tnom|gmin)=[^\s=]+$/i.test(token))) {
        const settings = tokens.filter(token => /^(?:temp|tnom|gmin)=/i.test(token));
        if (settings.length) records.push('.options DEVICE ' + settings.join(' '));
        changes.push(`Map shared DEVICE settings and remove bookkeeping options: ${logical}`);
      } else {
        // Xyce's NONLIN ABSTOL is a residual norm, not ngspice's current ABSTOL;
        // VNTOL has no exact shared directive. Do not map unlike tolerances.
        limitations.push(`Unsupported shared solver options: ${logical}`);
        records.push(record);
      }
      continue;
    }
    if (/^\.temp\s+\S+\s*$/i.test(card)) {
      card = '.options DEVICE TEMP=' + card.split(/\s+/)[1];
      changes.push(`Map shared temperature: ${logical} -> ${card}`);
    }
    if (/^[vi]\S*\s+\S+\s+\S+.*\btype\s*=/i.test(card)) {
      const match = /^([vi]\S*\s+\S+\s+\S+)\s+(.+)$/i.exec(card)!;
      const voltage = /^v/i.test(card), dc = voltage ? 'vdc' : 'idc', ac = voltage ? 'vac' : 'iac';
      const tokens = match[2].split(/\s+/);
      const values = new Map<string, string>();
      let valid = true;
      for (const token of tokens) {
        const assignment = /^([a-z]+)=([^\s=]+)$/i.exec(token);
        if (!assignment || !['type', dc, ac].includes(assignment[1].toLowerCase()) || values.has(assignment[1].toLowerCase())) { valid = false; break; }
        values.set(assignment[1].toLowerCase(), assignment[2]);
      }
      if (valid && values.get('type')?.toLowerCase() === dc && values.has(dc)) {
        card = `${match[1]} DC ${values.get(dc)}${values.has(ac) ? ` AC ${values.get(ac)}` : ''}`;
        changes.push(`Map ahkab ${dc} source: ${logical} -> ${card}`);
      } else limitations.push(`Unsupported source TYPE semantics: ${logical}`);
    }
    const analysis = /^\.(op|dc|ac|tran)\b/i.exec(card);
    if (analysis) {
      if (control) controlAnalyses++; else staticAnalyses++;
      const type = analysis[1].toLowerCase() as AnalysisType;
      if (type === 'op' && !/^\.op\s*$/i.test(card)) limitations.push(`Unsupported OP arguments: ${card}`);
      if (type !== 'op' && (card.includes('=') || /^\.(ac|dc|tran)\s*$/i.test(card))) limitations.push(`Unsupported analysis syntax: ${card}`);
      analyses.push({ type, directive: card, recordIndex: records.length });
      sawAnalysis = true;
    } else if (/^\.(noise|pz|disto|pss|step|symbolic|fft)\b/i.test(card)) {
      limitations.push(`Unsupported analysis/control directive: ${card}`);
    } else if (/^\.end\s*(?:[;$].*)?$/i.test(card)) {
      endCount++;
    } else if (sawAnalysis && /^\.(?:param|temp|ic|nodeset)\b/i.test(card)) {
      // Ordinary device/model definitions are static regardless of their position.
      // Sequential parameter/initial-state changes in non-SPICE dialects are not.
      limitations.push(`Circuit state statement after analysis: ${card}`);
    }
    records.push(card === logical ? record : card);
  }
  if (control) limitations.push('Unterminated .control');
  if (staticAnalyses && controlAnalyses) limitations.push('Mixed static and executed control analyses need ordered execution semantics');
  const hasRun = changes.includes('Lower control run to existing static analyses');
  if (controlAnalyses && hasRun) limitations.push('Mixed run and explicit control analyses need ordered execution semantics');
  if (hasControl && staticAnalyses && !hasRun) limitations.push('Control block does not execute the static deck analyses');
  if (endCount === 0) { records.push('.end'); changes.push('Append missing .end for both references'); }
  if (endCount > 1) limitations.push('Multiple .end cards');
  if (!analyses.length) limitations.push('No supported static analysis');
  if (changes.includes('Lower control run to existing static analyses') && !analyses.length) limitations.push('Control run has no static analysis');
  // A failed lowering is atomic. Diagnostic ngspice sees the original bytes,
  // not a half-lowered control program with its execution semantics removed.
  return { records, netlist: limitations.length ? source : records.join('\n').trimEnd() + '\n', analyses,
    changes: limitations.length ? [] : changes, limitations: [...new Set(limitations)] };
}

export function projectAnalysis(circuit: CanonicalCircuit, ordinal: number): string {
  if (circuit.limitations.length) throw new Error(circuit.limitations.join('; '));
  const selected = circuit.analyses[ordinal];
  if (!selected) throw new Error(`Missing analysis ordinal ${ordinal}`);
  const indices = new Set(circuit.analyses.map(a => a.recordIndex));
  return circuit.records.filter((_, i) => !indices.has(i) || i === selected.recordIndex).join('\n').trimEnd() + '\n';
}
