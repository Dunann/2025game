import type { Settings } from '../../types';
import { useEffect, useState } from 'react';
import { DEFAULT_GAME_CONFIG, getGameConfig } from '../../config';
import { validateGameSettings } from './settingsDraft';
import { RulesContent } from '../rules/RulesContent';
import './menu.css';

interface Props { settings: Settings; onSettingsChange: (settings: Settings) => void; onPlay: () => void; onStats: () => void; wins: number }

export function MainMenu({ settings, onSettingsChange, onPlay, onStats, wins }: Props) {
  const savedConfig = getGameConfig(settings.gameConfig);
  const [cardCount, setCardCount] = useState(String(savedConfig.cardCount));
  const [target, setTarget] = useState(savedConfig.target);
  const [errors, setErrors] = useState<{ cardCountError: string | null; targetError: string | null }>({ cardCountError: null, targetError: null });
  useEffect(() => {
    setCardCount(String(savedConfig.cardCount));
    setTarget(savedConfig.target);
    setErrors({ cardCountError: null, targetError: null });
  }, [savedConfig.cardCount, savedConfig.target]);

  return <section className="main-menu" aria-label="Main menu">
    <div className="menu-seal" aria-hidden="true">♠</div>
    <h1 className="menu-title" tabIndex={-1}>2025<span>The card game</span></h1>
    <p className="menu-current-config">{savedConfig.cardCount} cards <span aria-hidden="true">·</span> Target <span>{savedConfig.target}</span></p>
    <div className="menu-actions">
      <button className="button button-primary menu-play" onClick={onPlay}><span className="menu-play-suit" aria-hidden="true">♠</span><span>Take a seat</span><span className="menu-play-suit" aria-hidden="true">♠</span></button>
      <button className="button menu-stats" onClick={onStats}><span className="menu-stats-label"><span className="menu-stats-chip" aria-hidden="true">♣</span>Your statistics</span><span className="menu-win-count">{wins} {wins === 1 ? 'win' : 'wins'}</span></button>
    </div>
    <details className="menu-rules game-settings">
      <summary className="button button-quiet">Game settings<span className="menu-rules-toggle" aria-hidden="true">+</span></summary>
      <form className="game-settings-form" noValidate onSubmit={event => {
        event.preventDefault();
        const result = validateGameSettings(cardCount, target);
        setErrors(result);
        if (result.config) { setTarget(result.config.target); onSettingsChange({ ...settings, gameConfig: result.config }); }
      }}>
        <label htmlFor="setting-card-count">Cards (2–52)</label>
        <input id="setting-card-count" type="text" inputMode="numeric" value={cardCount} onChange={event => setCardCount(event.target.value)} aria-invalid={Boolean(errors.cardCountError)} aria-describedby={errors.cardCountError ? 'card-count-error' : undefined} />
        {errors.cardCountError && <p id="card-count-error" className="settings-error" role="alert">{errors.cardCountError}</p>}
        <label htmlFor="setting-target">Target</label>
        <input id="setting-target" type="text" inputMode="numeric" value={target} onChange={event => setTarget(event.target.value)} aria-invalid={Boolean(errors.targetError)} aria-describedby={errors.targetError ? 'target-error' : undefined} />
        {errors.targetError && <p id="target-error" className="settings-error" role="alert">{errors.targetError}</p>}
        <div className="settings-actions"><button type="submit" className="button button-primary">Apply</button><button type="button" className="button button-quiet" onClick={() => {
          setCardCount(String(DEFAULT_GAME_CONFIG.cardCount)); setTarget(DEFAULT_GAME_CONFIG.target);
          setErrors({ cardCountError: null, targetError: null });
          onSettingsChange({ ...settings, gameConfig: { ...DEFAULT_GAME_CONFIG } });
        }}>Standard 2025</button></div>
      </form>
    </details>
    <details className="menu-rules">
      <summary className="button button-quiet">Rules &amp; how to play<span className="menu-rules-toggle" aria-hidden="true">+</span></summary>
      <div className="menu-rules-content">
        <RulesContent config={savedConfig} />
      </div>
    </details>
    <label className="card-mode-setting">
      <span><strong>Playing card mode</strong><small>Display 1, 11, 12, 13 as A, J, Q, K</small></span>
      <input type="checkbox" checked={settings.playingCardMode} onChange={event => onSettingsChange({ ...settings, playingCardMode: event.target.checked })} />
    </label>
    <p className="menu-credit"><a href="https://www.youtube.com/watch?v=zxxJNj0H_rs" target="_blank" rel="noopener noreferrer">Inspired by Scott Wu’s game</a></p>
  </section>;
}
