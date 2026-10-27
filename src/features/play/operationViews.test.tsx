import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame } from '../../game';
import { DEFAULT_GAME_CONFIG } from '../../config';
import { PlayScreen } from './PlayScreen';
import { RulesContent } from '../rules/RulesContent';
import { MainMenu } from '../menu/MainMenu';

describe('optional exponentiation views', () => {
  for (const enabled of [false, true]) {
    it(`shows only the allowed controls and help when exponentiation is ${enabled}`, () => {
      const config = { ...DEFAULT_GAME_CONFIG, exponentiationEnabled: enabled };
      const noop = vi.fn();
      const markup = renderToStaticMarkup(<PlayScreen game={createGame(undefined, config)} playingCardMode={false} elapsedMs={0} outcome={null} error={null} onMerge={noop} onUndo={noop} onPlayAgain={noop} onGiveUp={noop} onMenu={noop} />);
      expect((markup.match(/class="operation-control"/g) ?? []).length).toBe(enabled ? 5 : 4);
      expect(markup.includes('aria-keyshortcuts="g"')).toBe(enabled);
      expect(markup.includes('aria-label="Raise to a power"')).toBe(enabled);
      expect(markup).toContain(`--operation-count:${enabled ? 5 : 4}`);
      const rules = renderToStaticMarkup(<RulesContent config={config} />);
      expect(rules.includes('Powers require integer exponents')).toBe(enabled);
      expect(rules.includes('A / S / D / F / G:')).toBe(enabled);
      expect(rules).toContain('Division by zero is rejected');
      const menu = renderToStaticMarkup(<MainMenu settings={{ playingCardMode: false, gameConfig: config }} onSettingsChange={noop} onPlay={noop} onStats={noop} wins={0} />);
      const checkbox = menu.match(/<label class="settings-checkbox">([\s\S]*?)<\/label>/)?.[1];
      expect(checkbox).toContain('Allow exponentiation');
      expect(checkbox?.includes('checked=""')).toBe(enabled);
    });
  }
});
