/*
 * RiskPanel. Component 3 of nine, and the one section 12 says never to cut.
 *
 * It reads stored signals and never recomputes. That is the point: a department that acts
 * on a score has to defend it to the entity, to the portfolio committee and eventually to
 * the Auditor-General, and it cannot do that if the reviewer's explanation and the
 * Director-General's explanation are two different arithmetics. Same stored signals, same
 * words, everywhere the panel opens.
 *
 * The last three lines of the panel are its reason for existing. "Arithmetic, not a
 * prediction" is a sentence a Director-General can say in public.
 */
import { useEffect, useRef } from 'react';
import type { PortfolioRow, SignalView } from '../lib/types';
import { bandColour, bandWord, num, signalLabel } from '../lib/format';
import { IconAlert, IconX } from '../icons';
import './RiskPanel.css';

/** The published weights, section 10 and the README. Fixed, and shown as fixed. */
const WEIGHTS: { type: string; weight: number }[] = [
  { type: 'SUBMISSION_LATENESS', weight: 0.3 },
  { type: 'EVIDENCE_GAP', weight: 0.25 },
  { type: 'SPEND_DELIVERY_DIVERGENCE', weight: 0.2 },
  { type: 'PRIOR_AUDIT_FINDING', weight: 0.15 },
  { type: 'REVISION_CHURN', weight: 0.1 },
];

interface Props {
  risk: PortfolioRow | null;
  entityName: string;
  computedAt?: string | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
}

export function RiskPanel({ risk, entityName, computedAt, loading, error, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Escape closes, and focus starts inside the panel rather than behind it.
  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const signals = risk?.signals ?? [];
  // Ordered by the published weight rather than by contribution, so the panel reads the
  // same way every time and a reader learns where to look.
  const ordered = WEIGHTS.map((w) => ({
    weight: w.weight,
    type: w.type,
    signal: signals.find((s) => s.type === w.type) ?? null,
  }));

  return (
    <div className="panel-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="risk-panel-title"
        ref={panel}
      >
        <div className="panel-head">
          <div>
            <h2 id="risk-panel-title">{entityName}</h2>
            <p className="small muted panel-asof">
              {computedAt
                ? 'Computed ' + computedAt
                : 'Computed from the signals stored for this reporting period.'}
            </p>
          </div>
          <div className="row">
            {risk && risk.score !== null ? (
              <span className="panel-total" style={{ borderColor: bandColour(risk.band) }}>
                <span
                  className="risk-swatch"
                  style={{ background: bandColour(risk.band) }}
                  aria-hidden="true"
                />
                <strong>{num(risk.score)}</strong>
                <span className="risk-word">{bandWord(risk.band)}</span>
              </span>
            ) : null}
            <button type="button" className="panel-close" onClick={onClose} ref={closeButton}>
              <IconX size={18} />
              <span className="visually-hidden">Close the risk explanation</span>
            </button>
          </div>
        </div>

        <div className="panel-body">
          {loading ? <SignalSkeletons /> : null}

          {/* Error. The panel still opens on whatever stored signals could be read, and it
              names which one failed rather than replacing everything with a message. */}
          {error && !loading ? (
            <p className="panel-notice">
              <IconAlert size={16} />
              <span>
                Score unavailable. {error} The stored signals below are whatever could be read.
              </span>
            </p>
          ) : null}

          {/* Empty is not zero. An entity nobody has scored is not an entity with no risk. */}
          {!loading && signals.length === 0 ? (
            <p className="panel-empty">
              No signals stored for this period. This entity has not been scored yet, which is not
              the same as having scored zero. Run a recompute to score it.
            </p>
          ) : null}

          {!loading && signals.length > 0
            ? ordered.map((row) => (
                <SignalRow key={row.type} type={row.type} weight={row.weight} signal={row.signal} />
              ))
            : null}
        </div>

        {!loading && signals.length > 0 ? (
          <div className="panel-foot">
            <div className="panel-sum">
              <span className="muted small">Total</span>
              <strong>{num(risk?.score, { decimals: 1 })}</strong>
            </div>
            <p className="small muted panel-method">
              Weights are fixed and published. Bands: 25 medium, 50 high, 70 critical. This score is
              arithmetic, not a prediction, and can be reproduced by hand from the figures above.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SignalRow({
  type,
  weight,
  signal,
}: {
  type: string;
  weight: number;
  signal: SignalView | null;
}) {
  const contribution = signal?.contribution ?? null;
  // The bar is scaled against the signal's own maximum contribution, which is its weight
  // times one hundred. A bar scaled against the total would make every signal look small.
  const ceiling = weight * 100;
  const filled = contribution === null ? 0 : Math.max(0, Math.min(100, (contribution / ceiling) * 100));

  return (
    <div className="signal">
      <div className="signal-head">
        <h3>{signalLabel(type)}</h3>
        <span className="spacer" />
        <span className="small muted nowrap">weight {weight.toFixed(2)}</span>
        <span className="signal-contrib nowrap">
          contributes {contribution === null ? 'not stored' : num(contribution, { decimals: 1 })}
        </span>
      </div>

      <div className="signal-bar" aria-hidden="true">
        <span style={{ width: filled + '%' }} />
      </div>

      {signal ? (
        <>
          <p className="signal-text">{signal.description ?? 'No description was stored for this signal.'}</p>
          {signal.value !== null ? (
            <p className="small muted">
              Raw {num(signal.value, { decimals: 2 })}
              {contribution !== null
                ? ', weighted to ' + num(contribution, { decimals: 1 }) + ' of a possible ' + ceiling.toFixed(0)
                : null}
            </p>
          ) : null}
        </>
      ) : (
        <p className="signal-text muted">
          Not stored for this period. The engine records a signal only where it had an input, and an
          absent input is treated as absence of evidence rather than as a zero.
        </p>
      )}
    </div>
  );
}

function SignalSkeletons() {
  return (
    <div aria-hidden="true">
      {WEIGHTS.map((w) => (
        <div className="signal" key={w.type}>
          <div className="signal-head">
            <span className="skeleton" style={{ width: '11rem', height: '1rem' }} />
            <span className="spacer" />
            <span className="skeleton" style={{ width: '6rem', height: '1rem' }} />
          </div>
          <div className="signal-bar">
            <span style={{ width: '0%' }} />
          </div>
          <span className="skeleton" style={{ width: '80%', height: '0.9rem' }} />
        </div>
      ))}
    </div>
  );
}
