export type Operation = 'add' | 'subtract' | 'multiply' | 'divide' | 'power';
export interface GameConfig { cardCount: number; target: string; exponentiationEnabled: boolean }
export interface GameValue { numerator: bigint; denominator: bigint }
export interface SourceCard { id: string; rank: number; suit: 'clubs' | 'diamonds' | 'hearts' | 'spades' }
export type Expression = { kind: 'source'; source: SourceCard } | { kind: 'merge'; operation: Operation; left: Expression; right: Expression };
export interface ActiveCard { id: string; value: GameValue; sourceIds: string[]; expression: Expression }
export interface GameState { cards: ActiveCard[]; initialHand: SourceCard[]; history: ActiveCard[][]; revision: number; config: GameConfig }
export type MergeResult = { ok: true; state: GameState; resultCardId: string } | { ok: false; error: string };
export type RunOutcome = 'won' | 'given_up' | 'abandoned';
export interface RunRecord { id: string; outcome: RunOutcome; startedAt: number; endedAt: number; elapsedMs: number | null; config?: GameConfig }
export interface ActiveRun { id: string; startedAt: number; config?: GameConfig }
export interface Settings { playingCardMode: boolean; gameConfig?: GameConfig }
export interface StoredData { version: 1; settings: Settings; runs: RunRecord[]; startedRuns: number; activeRun: ActiveRun | null }
export const OPERATION_LABELS: Record<Operation, string> = { add: '+', subtract: '−', multiply: '×', divide: '÷', power: '^' };
export const OPERATION_NAMES: Record<Operation, string> = { add: 'Add', subtract: 'Subtract', multiply: 'Multiply', divide: 'Divide', power: 'Raise to a power' };
