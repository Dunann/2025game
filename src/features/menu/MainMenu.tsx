import type { Settings } from '../../types';
import { RulesContent } from '../rules/RulesContent';
import './menu.css';

interface Props { settings: Settings; onSettingsChange: (settings: Settings) => void; onPlay: () => void; onStats: () => void; wins: number }

export function MainMenu({ settings, onSettingsChange, onPlay, onStats, wins }: Props) {
  return <section className="main-menu" aria-label="Main menu">
    <div className="menu-seal" aria-hidden="true">♠</div>
    <h1 className="menu-title" tabIndex={-1}>2025<span>The card game</span></h1>
    <div className="menu-actions">
      <button className="button button-primary menu-play" onClick={onPlay}><span className="menu-play-suit" aria-hidden="true">♠</span><span>Take a seat</span><span className="menu-play-suit" aria-hidden="true">♠</span></button>
      <button className="button menu-stats" onClick={onStats}><span className="menu-stats-label"><span className="menu-stats-chip" aria-hidden="true">♣</span>Your statistics</span><span className="menu-win-count">{wins} {wins === 1 ? 'win' : 'wins'}</span></button>
    </div>
    <details className="menu-rules">
      <summary className="button button-quiet">Rules &amp; how to play<span className="menu-rules-toggle" aria-hidden="true">+</span></summary>
      <div className="menu-rules-content">
        <RulesContent />
      </div>
    </details>
    <label className="card-mode-setting">
      <span><strong>Playing card mode</strong><small>Display 1, 11, 12, 13 as A, J, Q, K</small></span>
      <input type="checkbox" checked={settings.playingCardMode} onChange={event => onSettingsChange({ ...settings, playingCardMode: event.target.checked })} />
    </label>
  </section>;
}
