import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GameState, Operation, RunOutcome } from '../../types';
import { OPERATION_LABELS, OPERATION_NAMES } from '../../types';
import { formatDuration } from '../../format';
import { formatExpression, formatValue } from '../../game';
import { OPERATION_CONTROLS, playKeyAction } from './keyboard';
import { EMPTY_SELECTION, transitionSelection } from './selection';
import { RulesContent } from '../rules/RulesContent';
import type { SelectionAction } from './selection';
import { arrangeCards } from './layout';
import './play.css';

export interface PlayScreenProps {
  game: GameState;
  playingCardMode: boolean;
  elapsedMs: number;
  outcome: RunOutcome | null;
  error: string | null;
  onMerge: (firstId: string, operation: Operation, secondId: string) => void;
  onUndo: () => void;
  onPlayAgain: () => void;
  onGiveUp: () => void;
  onMenu: () => void;
}


type Burst = { id: number; cardId: string };

export function PlayScreen(props: PlayScreenProps) {
  const { game, playingCardMode, elapsedMs, outcome, error, onMerge } = props;
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const { firstId, secondId, operation } = selection;
  const [positions, setPositions] = useState(() => arrangeCards(game.cards.map(card => card.id), {}, game.initialHand.length));
  const [burst, setBurst] = useState<Burst | null>(null);
  const cardButtons = useRef(new Map<string, HTMLButtonElement>());
  const terminalHeading = useRef<HTMLHeadingElement>(null);
  const screen = useRef<HTMLElement>(null);
  const previous = useRef({ revision: game.revision, ids: game.cards.map(card => card.id) });
  const firstCard = game.cards.find(card => card.id === firstId);
  const secondCard = game.cards.find(card => card.id === secondId);
  const finished = outcome !== null;

  useLayoutEffect(() => {
    const ids = game.cards.map(card => card.id);
    setPositions(current => arrangeCards(ids, current, game.initialHand.length));
    const before = previous.current;
    if (before.revision !== game.revision || before.ids.join('|') !== ids.join('|')) {
      setSelection(EMPTY_SELECTION);
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
  }, [game.cards, game.revision, game.initialHand.length, finished]);

  useEffect(() => {
    if (!burst) return;
    const timeout = window.setTimeout(() => setBurst(null), 750);
    return () => window.clearTimeout(timeout);
  }, [burst]);

  useLayoutEffect(() => {
    if (finished) {
      setSelection(EMPTY_SELECTION);
      terminalHeading.current?.focus();
    }
  }, [finished]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const editing = !!target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
      const blocked = editing || !!screen.current?.closest('[inert], [aria-hidden="true"]') || !!screen.current?.querySelector('.play-help[open]') || !!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]');
      const action = playKeyAction(event, { active: !finished, hasFirstCard: !!firstCard, blocked });
      if (action === null) return;
      event.preventDefault();
      select(action === 'clear' ? { kind: 'clear' } : { kind: 'operation', operation: action });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finished, firstCard, selection, onMerge]);

  function select(action: SelectionAction) {
    if (finished) return;
    const next = transitionSelection(selection, action);
    setSelection(next.selection);
    if (next.merge) onMerge(next.merge.firstId, next.merge.operation, next.merge.secondId);
  }

  const instruction = finished ? 'Attempt complete' : !firstCard
    ? 'Choose your first card'
    : secondCard ? 'Choose an operation to combine your cards'
      : operation ? 'Choose your second card' : 'Choose your second card or an operation';

  return <section ref={screen} className="play-screen" aria-label="Play the number game">
    {!finished && <h1 className="sr-only">Play the number game</h1>}
    <header className="play-header">
      <button className="button button-quiet" onClick={props.onMenu} aria-label="Return to main menu">← Menu</button>
      <div className="play-target"><span className="eyebrow">The target</span><strong aria-label={`Target ${game.config.target}`}>{game.config.target}</strong>{game.config.target.length > 10 && <details className="target-details"><summary>Full target</summary><p>{game.config.target}</p></details>}</div>
      <div className="play-clock"><span className="eyebrow">Time</span><strong aria-label={`Elapsed time ${formatDuration(elapsedMs)}`}>{formatDuration(elapsedMs)}</strong></div>
    </header>

    <section className="play-table" aria-label="Game table">
      <div className="table-caption"><span>{game.cards.length} {game.cards.length === 1 ? 'card' : 'cards'} remaining</span></div>
      <div className="card-board" aria-label="Cards" style={{ '--board-rows': Math.ceil(Math.max(8, game.initialHand.length) / 4) } as CSSProperties}>
        {game.cards.map(card => {
          const position = positions[card.id];
          const value = formatValue(card.value, playingCardMode);
          const exact = formatValue(card.value);
          const firstSelected = card.id === firstId;
          const secondSelected = card.id === secondId;
          const selected = firstSelected || secondSelected;
          const arrival = burst?.cardId === card.id;
          const style = { '--slot-column': (position?.slot ?? 0) % 4 + 1, '--slot-row': Math.floor((position?.slot ?? 0) / 4) + 1, '--card-tilt': `${position?.tilt ?? 0}deg`, '--value-length': Math.max(1, value.length) } as CSSProperties;
          return <div className={`card-slot${arrival ? ' card-arrival' : ''}`} key={card.id} style={style}>
            <button type="button" className={`number-card${firstSelected ? ' is-selected' : ''}${secondSelected ? ' is-second-selected' : ''}`}
              ref={element => { if (element) cardButtons.current.set(card.id, element); else cardButtons.current.delete(card.id); }}
              aria-pressed={selected} aria-label={`Card ${exact}${firstSelected ? ', first operand selected' : secondSelected ? ', second operand selected' : ''}. Uses ${card.sourceIds.length} of ${game.config.cardCount} original cards.`}
              disabled={finished} onClick={() => select({ kind: 'card', id: card.id })}>
              <span>{value}</span>
            </button>
            {arrival && <span className="merge-burst" key={burst.id} aria-hidden="true">{Array.from({ length: 12 }, (_, index) =>
              <i key={index} style={{ '--particle-angle': `${index * 30}deg`, '--particle-distance': `${40 + index % 3 * 13}px` } as CSSProperties} />
            )}</span>}
          </div>;
        })}
      </div>
    </section>

    {finished ? <section className={`run-summary${outcome === 'won' ? ' is-win' : ''}`} aria-live="polite">
      <h1 ref={terminalHeading} tabIndex={-1}>{outcome === 'won' ? game.config.target.length <= 24 ? `You made ${game.config.target}.` : 'Target reached.' : outcome === 'given_up' ? 'Time to turn the cards.' : 'Until the next hand.'}</h1>
      <strong className="summary-time">{formatDuration(elapsedMs)}</strong>
      <div className="play-actions"><button className="button button-primary" onClick={props.onPlayAgain}>Play again</button><button className="button button-quiet" onClick={props.onMenu}>Main menu</button></div>
    </section> : <section className="operation-panel" aria-label="Merge controls">
      <div className="pending-selection" aria-live="polite"><span className="sr-only">{instruction}</span>
        {firstCard && <p className="pending-expression"><span className="first-operand">{formatValue(firstCard.value, playingCardMode)}</span><span className="pending-symbol">{operation ? OPERATION_LABELS[operation] : '·'}</span><span className="second-operand">{secondCard ? formatValue(secondCard.value, playingCardMode) : '?'}</span></p>}
      </div>
      <div className="operation-buttons" role="group" aria-label="Choose an operation">
        {OPERATION_CONTROLS.map(({ operation: op, key }) => <div className="operation-control" key={op}>
          <button className={`button operation-button${operation === op ? ' is-selected' : ''}`} disabled={!firstCard}
            aria-label={OPERATION_NAMES[op]} aria-pressed={operation === op} aria-keyshortcuts={key} aria-describedby={`operation-shortcut-${op}`}
            onClick={() => select({ kind: 'operation', operation: op })}>{OPERATION_LABELS[op]}</button>
          <small className="operation-shortcut" id={`operation-shortcut-${op}`}><kbd>{key.toUpperCase()}</kbd> key</small>
        </div>)}
      </div>
      {error && <p className="merge-message is-error" role="alert">{error}</p>}
      {firstCard && <details className="card-details"><summary>Inspect selected card</summary><p><strong>Exact value:</strong> {formatValue(firstCard.value)}</p><p><strong>Expression:</strong> {formatExpression(firstCard.expression)}</p><p>Uses {firstCard.sourceIds.length} of {game.config.cardCount} original cards.</p></details>}
      <div className="play-actions"><button className="button button-quiet" disabled={!game.history.length} onClick={props.onUndo}>↶ Undo</button><button className="button give-up-button" onClick={props.onGiveUp}>Give up</button><details className="play-help"><summary className="button button-quiet" aria-label="Game rules">?</summary><section className="play-help-panel" aria-label="Game rules"><RulesContent config={game.config} /></section></details></div>
    </section>}
  </section>;
}

export default PlayScreen;
