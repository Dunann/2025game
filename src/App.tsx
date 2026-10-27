import { useEffect, useRef, useState } from 'react';
import { createGame, hasWon, mergeCards, undoMerge } from './game';
import { MainMenu } from './features/menu/MainMenu';
import { StatsScreen } from './features/stats/StatsScreen';
import { PlayScreen } from './features/play/PlayScreen';
import { defaultData, finishRun, resetStats, saveData, startRun, updateSettings } from './storage';
import { bootstrapProfile, saves, subscribeToSaves } from './persistence';
import type { SaveCommand, SaveStatus } from './storage/sync';
import type { ActiveRun, GameState, Operation, RunOutcome, SourceCard, StoredData } from './types';

interface Session {
  game: GameState;
  run: ActiveRun;
  clockStart: number;
  outcome: RunOutcome | null;
  finalElapsedMs: number | null;
}
interface Confirmation { title: string; description: string; action: string; confirm: () => void }

function ConfirmDialog({ title, description, action, confirm, cancel }: Confirmation & { cancel: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelButton.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) cancel(); }}>
    <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description" ref={dialog}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); cancel(); }
        if (event.key === 'Tab') {
          const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button');
          if (!buttons?.length) return;
          const first = buttons[0]; const last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
      <p className="eyebrow">THE NEXT MOVE</p>
      <h2 id="dialog-title">{title}</h2>
      <p id="dialog-description">{description}</p>
      <div className="dialog-actions">
        <button className="button button-quiet" onClick={cancel} ref={cancelButton}>Cancel</button>
        <button className="button button-primary" onClick={confirm}>{action}</button>
      </div>
    </div>
  </div>;
}

export default function App() {
  const [data, setData] = useState(defaultData);
  const dataRef = useRef(data);
  const [page, setPage] = useState<'menu' | 'play' | 'stats'>('menu');
  const [session, setSessionState] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ pending: 0, error: null });
  const [, tick] = useState(0);

  useEffect(() => subscribeToSaves(setSaveStatus), []);
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    bootstrapProfile().then((profile) => {
      if (cancelled) return;
      dataRef.current = profile;
      setData(profile);
      setStorageWarning(!saveData(profile));
      setReady(true);
    }).catch((failure: unknown) => {
      if (!cancelled) setLoadError(failure instanceof Error ? failure.message : 'Could not load your records.');
    });
    return () => { cancelled = true; };
  }, [loadAttempt]);
  useEffect(() => {
    if (!session || session.outcome) return;
    const timer = window.setInterval(() => tick((value) => value + 1), 200);
    return () => window.clearInterval(timer);
  }, [session?.run.id, session?.outcome]);
  useEffect(() => {
    if (page !== 'play') document.querySelector<HTMLElement>('h1')?.focus();
  }, [page, ready]);

  function persist(next: StoredData, command?: SaveCommand) {
    dataRef.current = next;
    setData(next);
    setStorageWarning(!saveData(next));
    if (command) saves.enqueue(command);
  }
  function setSession(next: Session | null) {
    sessionRef.current = next;
    setSessionState(next);
  }
  function finish(outcome: RunOutcome): Session | null {
    const current = sessionRef.current;
    if (!current || current.outcome) return current;
    const elapsedMs = Math.max(0, performance.now() - current.clockStart);
    const next = { ...current, outcome, finalElapsedMs: elapsedMs };
    setSession(next);
    const record = { ...current.run, outcome, endedAt: Math.max(Date.now(), current.run.startedAt), elapsedMs };
    persist(finishRun(dataRef.current, record), { kind: 'finish', record });
    setError(null);
    return next;
  }
  function begin(hand?: SourceCard[]) {
    if (!ready) return;
    const game = createGame(hand);
    const run = { id: crypto.randomUUID(), startedAt: Date.now() };
    const next = { game, run, clockStart: performance.now(), outcome: null, finalElapsedMs: null };
    persist(startRun(dataRef.current, run), { kind: 'start', run });
    setSession(next);
    setError(null);
    setPage('play');
  }
  function confirmAction(title: string, description: string, action: string, callback: () => void) {
    setConfirmation({ title, description, action, confirm: () => { setConfirmation(null); callback(); } });
  }
  function changeHand(restart: boolean) {
    const current = sessionRef.current;
    const originalHand = restart ? current?.game.initialHand : undefined;
    const proceed = () => { finish('abandoned'); begin(originalHand); };
    if (current && !current.outcome) {
      confirmAction(restart ? 'Replay this hand?' : 'Deal a new hand?',
        restart ? 'This attempt will count as abandoned. You’ll replay the same eight cards with a fresh timer.' : 'This attempt will count as abandoned. Eight new cards and a fresh timer are waiting.',
        restart ? 'Restart hand' : 'New hand', proceed);
    } else proceed();
  }
  function menu() {
    const proceed = () => { finish('abandoned'); setSession(null); setError(null); setPage('menu'); };
    if (sessionRef.current && !sessionRef.current.outcome) {
      confirmAction('Leave the table?', 'This unfinished attempt will count as abandoned in your success rate.', 'Return to menu', proceed);
    } else proceed();
  }
  function merge(firstId: string, operation: Operation, secondId: string) {
    const current = sessionRef.current;
    if (!current || current.outcome || confirmation) return;
    const result = mergeCards(current.game, firstId, operation, secondId);
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    setSession({ ...current, game: result.state });
    if (hasWon(result.state)) finish('won');
  }
  const elapsedMs = session ? session.finalElapsedMs ?? Math.max(0, performance.now() - session.clockStart) : 0;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <main id="main-content" className={`page page-${page}`} inert={confirmation ? true : undefined}>
      {!ready && <section className="connection-screen" aria-live="polite"><p className="eyebrow">THE NUMBERS TABLE</p><h1 tabIndex={-1}>{loadError ? 'The table is taking a moment.' : 'Setting your table…'}</h1><p>{loadError ?? 'Connecting to your records.'}</p>{loadError && <button className="button button-primary" onClick={() => setLoadAttempt(value => value + 1)}>Retry connection</button>}</section>}
      {ready && page === 'menu' && <MainMenu settings={data.settings} onSettingsChange={(settings) => persist(updateSettings(dataRef.current, settings), { kind: 'settings', settings })}
        onPlay={() => begin()} onStats={() => setPage('stats')} wins={data.runs.filter((run) => run.outcome === 'won').length} />}
      {ready && page === 'stats' && <StatsScreen data={data} onMenu={() => setPage('menu')}
        onReset={() => confirmAction('Clear your records?', 'All run history and statistics for this player will be erased from the database. Your display setting will be kept.', 'Clear records', () => persist(resetStats(dataRef.current), { kind: 'reset' }))} />}
      {ready && page === 'play' && session && <PlayScreen game={session.game} playingCardMode={data.settings.playingCardMode} elapsedMs={elapsedMs}
        outcome={session.outcome} error={error} onMerge={merge}
        onUndo={() => {
          const current = sessionRef.current;
          if (current && !current.outcome && !confirmation) { setSession({ ...current, game: undoMerge(current.game) }); setError(null); }
        }}
        onRestart={() => changeHand(true)} onNewHand={() => changeHand(false)} onMenu={menu}
        onGiveUp={() => {
          if (sessionRef.current?.outcome) return;
          confirmAction('Call it a hand?', 'Your time until giving up will be saved. This attempt will count toward your success rate.', 'Give up', () => finish('given_up'));
        }} />}
    </main>
    {ready && <div className={`save-status${saveStatus.error ? ' has-error' : ''}`} role="status">
      {saveStatus.error ? <>Records waiting to save: {saveStatus.error}<button onClick={() => saves.retry()}>Retry save</button></> : saveStatus.pending ? 'Saving your records…' : 'Records saved to your player session'}
    </div>}
    {storageWarning && <p className="storage-warning" role="status">Browser cache is unavailable. Records can still save to the server; keep this page open until saving finishes.</p>}
    <footer className="site-footer"><span>2025 / THE NUMBERS TABLE</span><span>Eight cards. One possibility.</span></footer>
    {confirmation && <ConfirmDialog {...confirmation} cancel={() => setConfirmation(null)} />}
  </div>;
}
