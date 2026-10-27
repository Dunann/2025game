import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GameState, Operation, RunOutcome } from '../../types';
import { OPERATION_LABELS, OPERATION_NAMES } from '../../types';
import { formatDuration } from '../../format';
import { formatExpression, formatValue } from '../../game';
import './play.css';

export interface PlayScreenProps {
  game: GameState;
  playingCardMode: boolean;
  elapsedMs: number;
  outcome: RunOutcome | null;
  error: string | null;
  onMerge: (firstId: string, operation: Operation, secondId: string) => void;
  onUndo: () => void;
  onRestart: () => void;
  onNewHand: () => void;
  onGiveUp: () => void;
  onMenu: () => void;
}

const operations: Operation[] = ['add', 'subtract', 'multiply', 'divide', 'power'];
type Position = { slot: number; tilt: number };
type Burst = { id: number; cardId: string };

function arrange(ids: string[], previous: Record<string, Position>): Record<string, Position> {
  const next: Record<string, Position> = {};
  const available = Array.from({ length: 8 }, (_, slot) => slot);
  for (const id of ids) {
    if (previous[id]) {
      next[id] = previous[id];
      available.splice(available.indexOf(previous[id].slot), 1);
    }
  }
  for (const id of ids) {
    if (!next[id]) {
      const index = Math.floor(Math.random() * available.length);
      next[id] = { slot: available.splice(index, 1)[0], tilt: Math.random() * 6 - 3 };
    }
  }
  return next;
}

export function PlayScreen(props: PlayScreenProps) {
  const { game, playingCardMode, elapsedMs, outcome, error, onMerge } = props;
  const [firstId, setFirstId] = useState<string | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [positions, setPositions] = useState(() => arrange(game.cards.map(card => card.id), {}));
  const [burst, setBurst] = useState<Burst | null>(null);
  const cardButtons = useRef(new Map<string, HTMLButtonElement>());
  const terminalHeading = useRef<HTMLHeadingElement>(null);
  const previous = useRef({ revision: game.revision, ids: game.cards.map(card => card.id) });
  const firstCard = game.cards.find(card => card.id === firstId);
  const finished = outcome !== null;

  useLayoutEffect(() => {
    const ids = game.cards.map(card => card.id);
    setPositions(current => arrange(ids, current));
    const before = previous.current;
    if (before.revision !== game.revision || before.ids.join('|') !== ids.join('|')) {
      setFirstId(null);
      setOperation(null);
      const resultId = ids.find(id => !before.ids.includes(id));
      if (game.revision !== before.revision && ids.length === before.ids.length - 1 && resultId) {
        setBurst({ id: game.revision, cardId: resultId });
      } else {
        setBurst(null);
      }
      // Restore keyboard position after a merge, undo, or fresh attempt.
      if (!finished && resultId) cardButtons.current.get(resultId)?.focus({ preventScroll: true });
    }
    previous.current = { revision: game.revision, ids };
  }, [game.cards, game.revision, finished]);

  useEffect(() => {
    if (!burst) return;
    const timeout = window.setTimeout(() => setBurst(null), 750);
    return () => window.clearTimeout(timeout);
  }, [burst]);

  useLayoutEffect(() => {
    if (finished) {
      setFirstId(null);
      setOperation(null);
      terminalHeading.current?.focus();
    }
  }, [finished]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setFirstId(null); setOperation(null); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function selectCard(id: string) {
    if (finished) return;
    if (id === firstId) { setFirstId(null); setOperation(null); return; }
    if (firstId && operation) { onMerge(firstId, operation, id); return; }
    setFirstId(id);
  }

  const instruction = finished ? 'Attempt complete' : !firstCard
    ? 'Choose your first card'
    : !operation ? 'Now choose an operation' : 'Choose your second card';

  return <section className="play-screen" aria-label="Play the 2025 game">
    {!finished && <h1 className="sr-only">Play the 2025 game</h1>}
    <header className="play-header">
      <button className="button button-quiet" onClick={props.onMenu} aria-label="Return to main menu">← Menu</button>
      <div className="play-target"><span className="eyebrow">The target</span><strong>2025</strong></div>
      <div className="play-clock"><span className="eyebrow">Time</span><strong aria-label={`Elapsed time ${formatDuration(elapsedMs)}`}>{formatDuration(elapsedMs)}</strong></div>
    </header>

    <section className="play-table" aria-label="Game table">
      <div className="table-caption"><span>MAKE EVERY CARD COUNT</span><span>{game.cards.length} {game.cards.length === 1 ? 'card' : 'cards'} remaining</span></div>
      <div className="card-board" aria-label="Cards">
        {game.cards.map(card => {
          const position = positions[card.id];
          const value = formatValue(card.value, playingCardMode);
          const exact = formatValue(card.value);
          const selected = card.id === firstId;
          const arrival = burst?.cardId === card.id;
          const style = { '--slot-column': (position?.slot ?? 0) % 4 + 1, '--slot-row': Math.floor((position?.slot ?? 0) / 4) + 1, '--card-tilt': `${position?.tilt ?? 0}deg` } as CSSProperties;
          return <div className={`card-slot${arrival ? ' card-arrival' : ''}`} key={card.id} style={style}>
            <button type="button" className={`number-card${selected ? ' is-selected' : ''}${value.length > 9 ? ' is-long' : ''}`}
              ref={element => { if (element) cardButtons.current.set(card.id, element); else cardButtons.current.delete(card.id); }}
              aria-pressed={selected} aria-label={`Card ${exact}${selected ? ', first operand selected' : ''}. Uses ${card.sourceIds.length} of 8 original cards.`}
              title={`${exact}\n${formatExpression(card.expression)}`} disabled={finished} onClick={() => selectCard(card.id)}>
              <span>{value}</span>
            </button>
            {arrival && <span className="merge-burst" key={burst.id} aria-hidden="true">{Array.from({ length: 12 }, (_, index) =>
              <i key={index} style={{ '--particle-angle': `${index * 30}deg`, '--particle-distance': `${40 + index % 3 * 13}px` } as CSSProperties} />
            )}</span>}
          </div>;
        })}
        {!finished && game.cards.length === 1 && <p className="last-card-note">One card left. Undo to try another path, or start again.</p>}
      </div>
      <div className="table-footer"><span>EXACT FRACTIONS · ALL 8 CARDS</span><span>2025 CLUB</span></div>
    </section>

    {finished ? <section className={`run-summary${outcome === 'won' ? ' is-win' : ''}`} aria-live="polite">
      <span className="eyebrow">{outcome === 'won' ? 'A perfect hand' : 'Attempt complete'}</span>
      <h1 ref={terminalHeading} tabIndex={-1}>{outcome === 'won' ? 'You made 2025.' : outcome === 'given_up' ? 'Time to turn the cards.' : 'Until the next hand.'}</h1>
      <p>{outcome === 'won' ? 'All eight cards. Seven moves. One beautiful number.' : 'Every attempt is part of the game. Try this hand again or draw a fresh one.'}</p>
      <strong className="summary-time">{formatDuration(elapsedMs)}</strong>
      <div className="play-actions"><button className="button button-primary" onClick={props.onNewHand}>New hand</button><button className="button" onClick={props.onRestart}>Replay this hand</button><button className="button button-quiet" onClick={props.onMenu}>Main menu</button></div>
    </section> : <section className="operation-panel" aria-label="Merge controls">
      <div className="pending-selection" aria-live="polite"><span className="eyebrow">{instruction}</span>
        <p className="pending-expression"><span>{firstCard ? formatValue(firstCard.value, playingCardMode) : '?'}</span><span className="pending-symbol">{operation ? OPERATION_LABELS[operation] : '·'}</span><span>?</span></p>
      </div>
      <div className="operation-buttons" role="group" aria-label="Choose an operation">
        {operations.map(op => <button key={op} className={`operation-button${operation === op ? ' is-selected' : ''}`} disabled={!firstCard}
          aria-label={OPERATION_NAMES[op]} aria-pressed={operation === op} onClick={() => setOperation(op)}>{OPERATION_LABELS[op]}</button>)}
      </div>
      <p className={`merge-message${error ? ' is-error' : ''}`} role={error ? 'alert' : undefined}>{error ?? 'Select a card, an operation, then another card. Escape clears your selection.'}</p>
      {firstCard && <details className="card-details"><summary>Inspect selected card</summary><p><strong>Exact value:</strong> {formatValue(firstCard.value)}</p><p><strong>Expression:</strong> {formatExpression(firstCard.expression)}</p><p>Uses {firstCard.sourceIds.length} of 8 original cards.</p></details>}
      <div className="play-actions"><button className="button button-quiet" disabled={!game.history.length} onClick={props.onUndo}>↶ Undo</button><button className="button button-quiet" onClick={props.onRestart}>Restart</button><button className="button button-quiet" onClick={props.onNewHand}>New hand</button><button className="button button-quiet give-up-button" onClick={props.onGiveUp}>Give up</button></div>
    </section>}
  </section>;
}

export default PlayScreen;
