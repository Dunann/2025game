import './rules.css';
import type { GameConfig } from '../../types';
import { getGameConfig } from '../../config';

export function RulesContent({ config }: { config?: GameConfig }) {
  const { cardCount, target, exponentiationEnabled } = getGameConfig(config);
  return <div className="rules-content">
    <h2>Make <span className="rules-target">{target}</span></h2>
    <p>Combine all {cardCount} starting cards into one card worth exactly <strong className="rules-target">{target}</strong>. Reaching the target with cards left does not win. Physical cards are distinct, but ranks can repeat. Random hands are not guaranteed solvable.</p>
    <h2>Combining cards</h2>
    <p>Select a card, choose an operation, then another card. You can also select both cards before choosing the operation. The first card has a gold border; the second has a blue border. Order matters: 8 − 3 makes 5, while 3 − 8 makes −5.</p>
    <p>Negative numbers and exact fractions are allowed. Division by zero is rejected. Oversized calculations are rejected.{exponentiationEnabled && ' Powers require integer exponents; 0⁰ and fractional exponents are rejected.'}</p>
    <h2>Controls</h2>
    <ul>
      <li><strong>{exponentiationEnabled ? 'A / S / D / F / G:' : 'A / S / D / F:'}</strong> {exponentiationEnabled ? 'add, subtract, multiply, divide, and power.' : 'add, subtract, multiply, and divide.'} Select at least one card first. Escape clears the selection.</li>
      <li><strong>Undo:</strong> reverse a merge; the timer keeps running.</li>
      <li><strong>Give up:</strong> end the attempt and save its duration. Returning to the menu during play also asks you to confirm giving up.</li>
      <li><strong>Play again:</strong> deal the next hand after a win or give-up.</li>
    </ul>
    <h2>Records</h2>
    <p>The timer includes background-tab time. Success rate is wins divided by all ended attempts, including give-ups and interruptions. Winning and give-up times are tracked separately for each card count, target, and operation set.</p>
  </div>;
}
