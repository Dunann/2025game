import { useState } from 'react';
import type { GameConfig, RunRecord, StoredData } from '../../types';
import { DEFAULT_GAME_CONFIG, gameConfigKey } from '../../config';
import { formatDuration } from '../../format';
import { aggregateStats, groupStatsRuns } from './aggregate';
import './stats.css';

interface Props { data: StoredData; onMenu: () => void; onReset: () => void }
const outcomeLabels = { won: 'Won', given_up: 'Gave up', abandoned: 'Abandoned' };
const sample = (count: number) => `${count} ${count === 1 ? 'attempt' : 'attempts'} recorded`;

export function StatsScreen({ data, onMenu, onReset }: Props) {
  const [tab, setTab] = useState<'standard' | 'variations'>('standard');
  const [selectedKey, setSelectedKey] = useState('');
  const grouped = groupStatsRuns(data.runs);
  const selected = grouped.variations.find(group => gameConfigKey(group.config) === selectedKey) ?? grouped.variations[0];
  return <section className="stats-screen" aria-label="Your statistics">
    <header className="stats-header"><div><h1 tabIndex={-1}>Statistics</h1></div><button className="button button-quiet" onClick={onMenu}>Back to menu</button></header>
    <div className="stats-config-tabs" role="group" aria-label="Game category">
      <button className="button" aria-pressed={tab === 'standard'} onClick={() => setTab('standard')}>Standard 2025</button>
      <button className="button" aria-pressed={tab === 'variations'} onClick={() => setTab('variations')}>Variations</button>
    </div>
    {tab === 'standard' ? <StatsGroup runs={grouped.standard} config={DEFAULT_GAME_CONFIG} /> : selected ? <>
      <label className="stats-config-select">Game
        <select value={gameConfigKey(selected.config)} onChange={event => setSelectedKey(event.target.value)}>
          {grouped.variations.map(group => <option key={gameConfigKey(group.config)} value={gameConfigKey(group.config)}>{group.config.cardCount} cards · Target {group.config.target}</option>)}
        </select>
      </label>
      <StatsGroup runs={selected.runs} config={selected.config} />
    </> : <p className="stats-empty">No variation attempts recorded.</p>}
    <footer className="stats-footer"><p>Records sync to this browser’s anonymous session.</p><button className="button button-quiet" disabled={!data.runs.length && !data.startedRuns} onClick={onReset}>Reset all statistics</button></footer>
  </section>;
}

function StatsGroup({ runs, config }: { runs: RunRecord[]; config: GameConfig }) {
  const stats = aggregateStats(runs);
  const history = [...runs].sort((a, b) => b.endedAt - a.endedAt).slice(0, 20);
  return <div className="stats-config-group" aria-live="polite">
    <h2 className="stats-config-title">{config.cardCount} cards · Target <span>{config.target}</span></h2>
    <div className="stats-grid">
      <Stat label="Wins" value={String(stats.won)} detail={`${stats.ended} ended attempts`} />
      <Stat label="Best winning time" value={formatDuration(stats.bestWin)} detail={stats.won ? 'Fastest win' : 'No wins yet'} />
      <Stat label="Last 20 wins" value={formatDuration(stats.last20WinsAverage)} detail={`Average · ${sample(stats.last20WinsCount)}`} />
      <Stat label="Success rate" value={stats.successRate === null ? '—' : `${stats.successRate.toFixed(1)}%`} detail="Wins ÷ ended attempts" />
    </div>
    <p className="stats-outcomes">{stats.won} wins <span>·</span> {stats.givenUp} give-ups <span>·</span> {stats.abandoned} abandoned</p>
    <section className="stats-section" aria-labelledby="giveup-title">
      <div className="stats-section-heading"><h2 id="giveup-title">Give-up times</h2><span>{stats.givenUp} give-ups</span></div>
      <div className="stats-giveups"><Stat label="Average time until give up" value={formatDuration(stats.giveUpAverage)} detail="All explicit give-ups" /><Stat label="Last 20 give-ups" value={formatDuration(stats.last20GiveUpsAverage)} detail={`Average · ${sample(stats.last20GiveUpsCount)}`} /></div>
      <p className="stats-explanation">Active hands are excluded. Interruptions count as abandoned; only explicit give-ups contribute to give-up times.</p>
    </section>
    <section className="stats-section" aria-labelledby="history-title">
      <div className="stats-section-heading"><h2 id="history-title">Recent attempts</h2><span>Latest 20</span></div>
      {history.length ? <div className="stats-history-wrap"><table className="stats-history"><thead><tr><th scope="col">Finished</th><th scope="col">Outcome</th><th scope="col">Time</th></tr></thead><tbody>{history.map(run => <tr key={run.id}><td>{new Date(run.endedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td><td><span className={`outcome outcome-${run.outcome}`}>{outcomeLabels[run.outcome]}</span></td><td>{formatDuration(run.elapsedMs)}{run.elapsedMs === null && <span className="stats-unknown"> unknown</span>}</td></tr>)}</tbody></table></div> : <p className="stats-empty">No attempts recorded for this game.</p>}
    </section>
  </div>;
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="stat"><p className="stat-label">{label}</p><p className="stat-value">{value}</p><p className="stat-detail">{detail}</p></div>;
}
