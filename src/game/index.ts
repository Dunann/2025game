import type { ActiveCard, Expression, GameConfig, GameState, GameValue, MergeResult, Operation, SourceCard } from '../types';
import { getGameConfig, MAX_CARD_COUNT, MIN_CARD_COUNT, parseGameConfig } from '../config';

const MAX_BITS = 4096;
const MAX_EXPONENT = 1024n;
let sequence = 0;
const newId = () => `card-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++sequence}`}`;
const abs = (n: bigint) => n < 0n ? -n : n;
const bits = (n: bigint) => abs(n).toString(2).length;

function gcd(a: bigint, b: bigint): bigint {
  a = abs(a); b = abs(b);
  while (b !== 0n) { const next = a % b; a = b; b = next; }
  return a;
}

function rational(numerator: bigint, denominator = 1n): GameValue {
  if (denominator === 0n) throw new Error('Division by zero is not allowed.');
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  const divisor = gcd(numerator, denominator);
  numerator /= divisor; denominator /= divisor;
  if (bits(numerator) > MAX_BITS || bits(denominator) > MAX_BITS) {
    throw new Error('That result exceeds the 4096-bit exact-number limit.');
  }
  return { numerator, denominator };
}

// Cancel first, and bound multiplication before allocating a potentially oversized product.
function multiply(a: GameValue, b: GameValue): GameValue {
  const crossA = gcd(a.numerator, b.denominator);
  const crossB = gcd(b.numerator, a.denominator);
  const an = a.numerator / crossA, bn = b.numerator / crossB;
  const ad = a.denominator / crossB, bd = b.denominator / crossA;
  if ((an !== 0n && bn !== 0n && bits(an) + bits(bn) - 1 > MAX_BITS) || bits(ad) + bits(bd) - 1 > MAX_BITS) {
    throw new Error('That result exceeds the 4096-bit exact-number limit.');
  }
  return rational(an * bn, ad * bd);
}

function calculate(a: GameValue, operation: Operation, b: GameValue): GameValue {
  // Inputs from public state also pass through the same validity and magnitude checks.
  a = rational(a.numerator, a.denominator); b = rational(b.numerator, b.denominator);
  switch (operation) {
    case 'add': return rational(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
    case 'subtract': return rational(a.numerator * b.denominator - b.numerator * a.denominator, a.denominator * b.denominator);
    case 'multiply': return multiply(a, b);
    case 'divide': return multiply(a, rational(b.denominator, b.numerator));
    case 'power': {
      if (b.denominator !== 1n) throw new Error('Exact mode requires an integer exponent.');
      if (abs(b.numerator) > MAX_EXPONENT) throw new Error('Exponents must be between -1024 and 1024.');
      if (a.numerator === 0n && b.numerator === 0n) throw new Error('Zero to the power zero is undefined.');
      if (a.numerator === 0n && b.numerator < 0n) throw new Error('Zero cannot have a negative exponent.');
      let exponent = abs(b.numerator);
      let base = b.numerator < 0n ? rational(a.denominator, a.numerator) : a;
      let result = rational(1n);
      while (exponent > 0n) {
        if (exponent % 2n === 1n) result = multiply(result, base);
        exponent /= 2n;
        if (exponent > 0n) base = multiply(base, base);
      }
      return result;
    }
    default: throw new Error('Choose a supported operation.');
  }
}

export function drawHand(random: () => number = Math.random, cardCount = getGameConfig().cardCount): SourceCard[] {
  if (!Number.isInteger(cardCount) || cardCount < MIN_CARD_COUNT || cardCount > MAX_CARD_COUNT) throw new Error('Choose between 2 and 52 cards.');
  const suits: SourceCard['suit'][] = ['clubs', 'diamonds', 'hearts', 'spades'];
  const deck = suits.flatMap(suit => Array.from({ length: 13 }, (_, index) => ({ id: newId(), rank: index + 1, suit })));
  for (let index = 0; index < cardCount; index++) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('Random values must be in [0, 1).');
    const swap = index + Math.floor(sample * (deck.length - index));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck.slice(0, cardCount);
}

export function createGame(hand?: SourceCard[], config?: GameConfig): GameState {
  const normalized = config === undefined ? getGameConfig() : parseGameConfig(config);
  if (!normalized) throw new Error('Choose a valid card count and positive whole-number target.');
  hand ??= drawHand(undefined, normalized.cardCount);
  const suits = new Set(['clubs', 'diamonds', 'hearts', 'spades']);
  if (hand.length !== normalized.cardCount || hand.some(card => !Number.isInteger(card.rank) || card.rank < 1 || card.rank > 13 || !suits.has(card.suit)) || new Set(hand.map(card => `${card.suit}:${card.rank}`)).size !== normalized.cardCount) {
    throw new Error(`A hand must contain ${normalized.cardCount} distinct cards from a standard deck.`);
  }
  const initialHand = hand.map(card => ({ ...card, id: newId() }));
  const cards: ActiveCard[] = initialHand.map(source => ({ id: source.id, value: rational(BigInt(source.rank)), sourceIds: [source.id], expression: { kind: 'source', source } }));
  return { cards, initialHand, history: [], revision: 0, config: { ...normalized } };
}

export function mergeCards(state: GameState, firstId: string, operation: Operation, secondId: string): MergeResult {
  if (firstId === secondId) return { ok: false, error: 'Choose two different cards.' };
  const first = state.cards.find(card => card.id === firstId);
  const second = state.cards.find(card => card.id === secondId);
  if (!first || !second) return { ok: false, error: 'Both cards must still be on the table.' };
  const sourceIds = [...first.sourceIds, ...second.sourceIds];
  if (new Set(sourceIds).size !== sourceIds.length) return { ok: false, error: 'These cards share an original card.' };
  try {
    const result: ActiveCard = { id: newId(), value: calculate(first.value, operation, second.value), sourceIds, expression: { kind: 'merge', operation, left: first.expression, right: second.expression } };
    return { ok: true, state: { ...state, cards: [...state.cards.filter(card => card.id !== firstId && card.id !== secondId), result], history: [...state.history, state.cards], revision: state.revision + 1 }, resultCardId: result.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'That operation could not be completed.' };
  }
}

export function undoMerge(state: GameState): GameState {
  if (state.history.length === 0) return state;
  return { ...state, cards: state.history[state.history.length - 1], history: state.history.slice(0, -1), revision: state.revision + 1 };
}

export function hasWon(state: GameState): boolean {
  const config = parseGameConfig(state.config);
  if (!config || state.cards.length !== 1 || state.initialHand.length !== config.cardCount) return false;
  const card = state.cards[0];
  const originals = new Set(state.initialHand.map(source => source.id));
  return card.value.numerator === BigInt(config.target) && card.value.denominator === 1n && originals.size === config.cardCount && card.sourceIds.length === config.cardCount && new Set(card.sourceIds).size === config.cardCount && card.sourceIds.every(id => originals.has(id));
}

export function formatValue(value: GameValue, playingCardMode = false): string {
  const normalized = rational(value.numerator, value.denominator);
  if (normalized.denominator !== 1n) return `${normalized.numerator}/${normalized.denominator}`;
  if (playingCardMode) {
    const face = new Map([[1n, 'A'], [11n, 'J'], [12n, 'Q'], [13n, 'K']]).get(normalized.numerator);
    if (face) return face;
  }
  return normalized.numerator.toString();
}

export function formatExpression(expression: Expression): string {
  if (expression.kind === 'source') return expression.source.rank.toString();
  const labels: Record<Operation, string> = { add: '+', subtract: '−', multiply: '×', divide: '÷', power: '^' };
  return `(${formatExpression(expression.left)} ${labels[expression.operation]} ${formatExpression(expression.right)})`;
}
