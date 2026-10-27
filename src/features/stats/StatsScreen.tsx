import type { StoredData } from '../../types';
import { formatDuration } from '../../format';
import { aggregateStats } from './aggregate';
import './stats.css';

interface Props { data: StoredData; onMenu: () => void; onReset: () => void }
const outcomeLabels = { won: 'Won', given_up: 'Gave up', abandoned: 'Abandoned' };
const sample = (count: number) => `${count} ${count === 1 ? 'attempt' : 'attempts'} recorded`;

export function StatsScreen({ data, onMenu, onReset }: Props) {
  const stats = aggregateStats(data.runs);
  const history = [...data.runs].sort((a, b) => b.endedAt - a.endedAt).slice(0, 20);
  return <section className="stats-screen" aria-label="Your statistics">
    <header className="stats-header"><div><p className="eyebrow">Your record at the table</p><h1 tabIndex={-1}>Statistics</h1></div><button className="button button-quiet" onClick={onMenu}>Back to menu</button></header>
    <div className="stats-grid">
      <Stat label="Wins" value={String(stats.won)} detail={`${stats.ended} ended attempts`} />
      <Stat label="Best winning time" value={formatDuration(stats.bestWin)} detail={stats.won ? 'Your quickest 2025' : 'Your first win awaits'} />
      <Stat label="Last 20 wins" value={formatDuration(stats.last20WinsAverage)} detail={`Average · ${sample(stats.last20WinsCount)}`} />
      <Stat label="Success rate" value={stats.successRate === null ? '—' : `${stats.successRate.toFixed(1)}%`} detail="Wins ÷ ended attempts" />
    </div>
    <p className="stats-outcomes">{stats.won} wins <span>·</span> {stats.givenUp} give-ups <span>·</span> {stats.abandoned} abandoned</p>
    <section className="stats-section" aria-labelledby="giveup-title">
      <div className="stats-section-heading"><h2 id="giveup-title">When you call it a day</h2><span>{stats.givenUp} give-ups</span></div>
      <div className="stats-giveups"><Stat label="Average time until give up" value={formatDuration(stats.giveUpAverage)} detail="All explicit give-ups" /><Stat label="Last 20 give-ups" value={formatDuration(stats.last20GiveUpsAverage)} detail={`Average · ${sample(stats.last20GiveUpsCount)}`} /></div>
      <p className="stats-explanation">Giving up or confirming a return to the menu records a give-up. Interrupted runs count as abandoned and affect success rate, but never winning or give-up times. An active hand is excluded.</p>
    </section>
    <section className="stats-section" aria-labelledby="history-title">
      <div className="stats-section-heading"><h2 id="history-title">Recent attempts</h2><span>Latest 20</span></div>
      {history.length ? <div className="stats-history-wrap"><table className="stats-history"><thead><tr><th scope="col">Finished</th><th scope="col">Outcome</th><th scope="col">Time</th></tr></thead><tbody>{history.map(run => <tr key={run.id}><td>{new Date(run.endedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td><td><span className={`outcome outcome-${run.outcome}`}>{outcomeLabels[run.outcome]}</span></td><td>{formatDuration(run.elapsedMs)}{run.elapsedMs === null && <span className="stats-unknown"> unknown</span>}</td></tr>)}</tbody></table></div> : <p className="stats-empty">The table is waiting. Finish your first hand to begin your record.</p>}
    </section>
    <footer className="stats-footer"><p>Records and preferences sync to your anonymous browser session.<br />Keep this browser’s session cookie to return to your record.</p><button className="button button-quiet" disabled={!data.runs.length && !data.startedRuns} onClick={onReset}>Reset statistics</button></footer>
  </section>;
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="stat"><p className="stat-label">{label}</p><p className="stat-value">{value}</p><p className="stat-detail">{detail}</p></div>;
}
