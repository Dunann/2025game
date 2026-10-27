import type { Settings } from '../../types';
import './menu.css';

interface Props { settings: Settings; onSettingsChange: (settings: Settings) => void; onPlay: () => void; onStats: () => void; wins: number }

export function MainMenu({ settings, onSettingsChange, onPlay, onStats, wins }: Props) {
  return <section className="main-menu" aria-label="Main menu">
    <div className="menu-seal" aria-hidden="true">♠</div>
    <p className="eyebrow">The numbers club</p>
    <h1 className="menu-title" tabIndex={-1}>2025<span>The card game</span></h1>
    <p className="menu-intro">Eight cards. Five operations.<br />One number to make.</p>
    <div className="menu-actions">
      <button className="button button-primary" onClick={onPlay}>Take a seat <span aria-hidden="true">↗</span></button>
      <button className="button button-quiet" onClick={onStats}>Your statistics <span className="menu-win-count">{wins} {wins === 1 ? 'win' : 'wins'}</span></button>
    </div>
    <section className="menu-rules" aria-label="How to play">
      <p className="eyebrow">A little arithmetic. A little ambition.</p>
      <p>Select a card, choose an operation, then select another card. Combine all eight into exactly <strong>2025</strong>.</p>
      <div className="menu-operations" aria-label="Addition, subtraction, multiplication, division and exponentiation">+ <span>−</span> × <span>÷</span> ^</div>
    </section>
    <label className="card-mode-setting">
      <span><strong>Playing card mode</strong><small>Display 1, 11, 12, 13 as A, J, Q, K</small></span>
      <input type="checkbox" checked={settings.playingCardMode} onChange={event => onSettingsChange({ ...settings, playingCardMode: event.target.checked })} />
    </label>
    <p className="menu-footnote">Random deals. Every hand is a fresh challenge.<br />Some hands may have no solution.</p>
  </section>;
}
