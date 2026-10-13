#!/usr/bin/env tsx
/**
 * Corpus-i identical-input outcome report (#834): every committed deck runs unchanged through
 * ngspice-47 and spice-ts with the corpus-f runner, metric and threshold (no per-circuit tuning).
 * Writes outcomes.json and README.md, losses included.
 *
 * Usage (from the repository root, after `pnpm build`):
 *   spice-heavy pnpm exec tsx benchmarks/corpus/corpus-i/parity.ts            # regenerate outcomes.json + README.md
 *   spice-heavy pnpm exec tsx benchmarks/corpus/corpus-i/parity.ts --check    # rerun and compare, write nothing
 *   pnpm exec tsx benchmarks/corpus/corpus-i/parity.ts --relabel              # recompute buckets/issue links only
 *   spice-heavy pnpm exec tsx benchmarks/corpus/corpus-i/parity.ts --fine-reference [--accept-drift]  # add the #592 column to committed transient rows
 *
 * The runner, metric and report are corpus-h's (../corpus-h/parity.ts); this file holds corpus-i's data.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type CorpusHReport, parityReport } from '../corpus-h/parity.js';
import { CORPUS_ROOT, gapBucket } from './lib.js';

export type CorpusIReport = CorpusHReport;

/**
 * Gap issues for corpus-i buckets, filed for #834 after searching open and closed issues. The
 * XSPICE code-model bucket links the existing open #553 (it lists lcouple, zener and the
 * event-driven digital models); the heap bucket is a harness defect (#839): simulate() alone
 * completes the deck.
 */
export const GAP_ISSUES: Record<string, string> = {
  'device: XSPICE code models not yet implemented (d_jkff, lcouple, zener, ...)': 'https://github.com/mfiumara/spice-ts/issues/553',
  'analysis: .ac with XSPICE event-driven digital instances': 'https://github.com/mfiumara/spice-ts/issues/838',
  'expression: bare .param names as R/C/L values (R1 a b rval)': 'https://github.com/mfiumara/spice-ts/issues/837',
  'harness: spice-ts child exhausts the V8 heap on a long transient': 'https://github.com/mfiumara/spice-ts/issues/839',
};

/** Findings beyond the gap buckets (correctness mismatches and harness defects) exposed by this batch. */
export const FOLLOW_UP_ISSUES: ReadonlyArray<{ url: string; scope: string }> = [
  { url: 'https://github.com/mfiumara/spice-ts/issues/840', scope: 'triage of the VACASK diode voltage multiplier (benchmark/mul/xyce/runme.sim, gear maxord=2) where both engines succeed but spice-ts i(vs) exceeds the 1% parity threshold (0.0392)' },
];

export const { summarize, renderMarkdown, cli } = parityReport({
  name: 'corpus-i',
  root: CORPUS_ROOT,
  scriptUrl: import.meta.url,
  title: '# corpus-i: public SPICE decks from eSim, VACASK, KiCad demos and small ngspice example repositories that ngspice runs unchanged (#834)',
  earlierRules: 'corpus-h, corpus-g and corpus-f',
  gapIssues: GAP_ISSUES,
  followUpIssues: FOLLOW_UP_ISSUES,
  gapBucket,
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
