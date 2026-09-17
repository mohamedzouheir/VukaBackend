/*
 * RiskBadge. Component 2 of nine.
 *
 * The rule it carries: score, band word, band colour, together, always. It opens the
 * RiskPanel on click and it never appears alone. Colour is never the only carrier,
 * because roughly eight percent of men have some colour vision deficiency and because a
 * printed briefing note goes out in greyscale.
 *
 * Five states. Empty is "Not yet scored" in grey with no colour, which is not the same
 * thing as a zero: an entity nobody has scored is not an entity with no risk. Denied is
 * not rendered at all rather than rendered as an error.
 */
import type { RiskBand } from '../lib/types';
import { bandColour, bandWord, num } from '../lib/format';
import './RiskBadge.css';

interface Props {
  score: number | null;
  band: RiskBand | string | null;
  /** Opens the explanation panel. A badge with no handler is still not a bare number. */
  onExplain?: () => void;
  size?: 'sm' | 'md';
  /** Movement against the previous period, where one was stored. */
  movement?: number | null;
}

export function RiskBadge({ score, band, onExplain, size = 'md', movement }: Props) {
  const scored = score !== null && score !== undefined && band !== 'NOT_SCORED';
  const word = bandWord(band);
  const colour = scored ? bandColour(band) : 'var(--band-none)';

  const label = scored
    ? 'Risk score ' + num(score) + ', band ' + word + '. Opens the five signals behind it.'
    : 'Not yet scored for this period.';

  const inner = (
    <>
      <span className="risk-swatch" style={{ background: colour }} aria-hidden="true" />
      {scored ? (
        <>
          <span className="risk-score">{num(score)}</span>
          <span className="risk-word">{word}</span>
          {movement !== null && movement !== undefined && movement !== 0 ? (
            <span className="risk-move" title="Change since the previous period">
              {movement > 0 ? '+' : ''}
              {num(movement)}
            </span>
          ) : null}
        </>
      ) : (
        <span className="risk-word">Not yet scored</span>
      )}
    </>
  );

  if (!onExplain) {
    return (
      <span
        className={'risk-badge risk-' + size + (scored ? '' : ' risk-unscored')}
        aria-label={label}
        role="img"
      >
        {inner}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={'risk-badge risk-badge-button risk-' + size + (scored ? '' : ' risk-unscored')}
      onClick={onExplain}
      aria-label={label}
    >
      {inner}
    </button>
  );
}

/** Loading. A skeleton pill, the same size as the real thing so nothing reflows. */
export function RiskBadgeSkeleton({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className={'risk-badge risk-' + size + ' risk-unscored'} aria-hidden="true">
      <span className="skeleton" style={{ width: '5.5rem', height: '1rem' }} />
    </span>
  );
}

/**
 * Error. The badge still reads as a badge, and the panel still opens, because the stored
 * signals may be readable even where the score is not.
 */
export function RiskBadgeError({ onExplain }: { onExplain?: () => void }) {
  return (
    <span className="risk-badge risk-md risk-unscored" role="img" aria-label="Score unavailable.">
      <span className="risk-swatch" style={{ background: 'var(--band-none)' }} aria-hidden="true" />
      <span className="risk-word">Score unavailable</span>
      {onExplain ? (
        <button type="button" className="link" onClick={onExplain}>
          signals
        </button>
      ) : null}
    </span>
  );
}
