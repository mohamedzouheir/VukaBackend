/*
 * PeriodCard. Component 7 of nine. Entity home and mobile home.
 *
 * Period, due date, days remaining, deadline basis in plain words. The last of those is
 * the one nobody else does and it is load bearing.
 *
 * Treasury Regulation 26.1.1 gives thirty days after quarter end and covers revenue and
 * expenditure only. TR 30.2.1 requires quarterly performance reporting to the executive
 * authority and sets no day count at all. The thirty days everyone quotes for performance
 * is a National Treasury guideline. So this card says which instrument its date rests on,
 * rather than dressing a departmental instruction up as law.
 *
 * Empty is "No open reporting period" plus who to contact, because a reporter who lands
 * on a blank card assumes the system is broken and goes back to email.
 */
import type { PeriodView } from '../lib/types';
import { date, num } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { IconAlert, IconCalendar, IconClock, IconInfo } from '../icons';
import './components.css';

interface Props {
  period: PeriodView | null;
  /** Confirmed results against registered targets, for the progress line. */
  confirmed?: number | null;
  targetCount?: number | null;
  loading?: boolean;
  error?: string | null;
  /** The buttons belong to the screen, not to the card. */
  children?: React.ReactNode;
}

export function PeriodCard({ period, confirmed, targetCount, loading, error, children }: Props) {
  const { t } = useI18n();
  const L = useLabels();

  if (loading) {
    return (
      <div className="card period-card" aria-hidden="true">
        <span className="skeleton" style={{ width: '14rem', height: '1.3rem' }} />
        <span className="skeleton" style={{ width: '10rem', height: '1rem' }} />
        <span className="skeleton" style={{ width: '100%', height: '0.6rem' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card period-card">
        <p className="period-notice">
          <IconAlert size={16} />
          <span>{t('period.loadFailed')} {error}</span>
        </p>
      </div>
    );
  }

  if (!period) {
    return (
      <div className="card period-card">
        <p className="period-notice">
          <IconInfo size={16} />
          <span>{t('deadline.noPeriod')} {t('period.contactReviewer')}</span>
        </p>
      </div>
    );
  }

  const left = period.daysRemaining;
  const late = left !== null && left < 0;
  const window =
    period.periodStart && period.periodEnd
      ? date(period.periodStart) + ' to ' + date(period.periodEnd)
      : null;

  const total = targetCount ?? null;
  const done = confirmed ?? null;
  const pct = total && total > 0 && done !== null ? Math.round((done / total) * 100) : 0;

  return (
    <div className="card period-card">
      <div className="period-head">
        <div>
          <h2>{period.label}</h2>
          {window ? <p className="small muted">{window}</p> : null}
        </div>
        <span className="spacer" />
        <div className="period-due">
          <p className="row period-due-line">
            <IconCalendar size={16} />
            <span>Due {date(period.dueDate) ?? 'date not set'}</span>
          </p>
          {left !== null ? (
            <p className={'row period-due-line' + (late ? ' period-late' : '')}>
              <IconClock size={16} />
              <span>{L.daysRemaining(left)}</span>
            </p>
          ) : null}
        </div>
      </div>

      {/* The basis, in plain words, with law separated from instruction. */}
      <p className="period-basis">
        <IconInfo size={15} />
        <span>
          <strong>{period.statutory ? t('deadline.statutory') : t('deadline.notStatutory')} </strong>
          {L.basis(period.deadlineBasis)}
        </span>
      </p>

      {total !== null && done !== null ? (
        <div className="period-progress">
          <p className="row">
            <strong>{t('period.reportedOf', num(done) ?? '', num(total) ?? '')}</strong>
            <span className="spacer" />
            <span className="muted small">{pct}%</span>
          </p>
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('period.confirmed')}
          >
            <span style={{ width: pct + '%' }} />
          </div>
        </div>
      ) : null}

      {children ? <div className="period-actions">{children}</div> : null}
    </div>
  );
}
