import type { Circuit } from '../circuit.js';
import type { MeasureCard } from './dot-measure.js';

/**
 * `.meas` cards of each parsed circuit. Kept beside the {@link Circuit} rather
 * than on it: the cards are read only by `simulate()` after the analyses run.
 */
const cardsByCircuit = new WeakMap<Circuit, MeasureCard[]>();

export function addMeasureCard(circuit: Circuit, card: MeasureCard): void {
  const cards = cardsByCircuit.get(circuit);
  if (cards) cards.push(card);
  else cardsByCircuit.set(circuit, [card]);
}

export function measureCards(circuit: Circuit): readonly MeasureCard[] {
  return cardsByCircuit.get(circuit) ?? [];
}
