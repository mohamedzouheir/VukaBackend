/*
 * The deadline warning a reporter sees on signing in.
 *
 * Two conditions, both read from the same period dates the administrator sets and the reminders
 * use, so the pop-up, the email and the countdown can never disagree:
 *
 *   late         a quarter's due date has passed and nothing has been submitted for it
 *   approaching  an open quarter falls due within thirty days and has not been submitted
 *
 * Thirty days because that is when the first reminder goes out. Nothing is shown when neither
 * applies, because a warning that appears every time stops being read.
 *
 * It opens once per sign in for a given set of warnings, not on every visit to the page. If the
 * warnings change (the admin moves a date, a quarter falls due) it opens again.
 */
import { useEffect, useMemo, useState } from 'react';
import type { PeriodView, SubmissionRow } from '../lib/types';
import { date, num } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Modal } from './Shell';
import { IconAlert, IconClock, IconUpload } from '../icons';
import './components.css';

const APPROACHING_DAYS = 30;
// A returned quarter has been filed. What it needs now is answers to the disputes, which the
// returned card on the same screen asks for, so calling it late would be wrong.
const FILED = new Set(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'RETURNED']);

export interface DeadlineWarning {
  kind: 'late' | 'approaching';
  period: PeriodView;
  days: number;
  sub: SubmissionRow | null;
}

/** Pure, so the rule can be read in one place and tested without a screen. */
export function deadlineWarnings(periods: PeriodView[], subs: SubmissionRow[]): DeadlineWarning[] {
  const out: DeadlineWarning[] = [];
  for (const p of periods) {
    if (!p.open || p.daysRemaining === null) continue;
    const sub = subs.find((s) => s.periodId === p.periodId) ?? null;
    if (sub && FILED.has(sub.status)) continue;
    if (p.daysRemaining < 0) out.push({ kind: 'late', period: p, days: -p.daysRemaining, sub });
    else if (p.daysRemaining <= APPROACHING_DAYS) out.push({ kind: 'approaching', period: p, days: p.daysRemaining, sub });
  }
  // Late first, then soonest.
  return out.sort((a, b) => (a.kind === b.kind ? (a.kind === 'late' ? b.days - a.days : a.days - b.days) : a.kind === 'late' ? -1 : 1));
}

export function DeadlineAlert({
  entityId,
  periods,
  subs,
  onReport,
}: {
  entityId: string;
  periods: PeriodView[] | null;
  subs: SubmissionRow[] | null;
  onReport: (periodId: string) => void;
}) {
  const { t } = useI18n();
  const warnings = useMemo(
    () => (periods && subs ? deadlineWarnings(periods, subs) : []),
    [periods, subs],
  );
  const signature = warnings.map((w) => w.kind + ':' + w.period.periodId + ':' + w.period.dueDate).join('|');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (signature === '') return;
    const key = 'vuka.deadline-alert.' + entityId;
    let seen: string | null = null;
    try {
      seen = sessionStorage.getItem(key);
    } catch {
      // Storage refused: show it, and it will show again next time, which is the safe failure.
    }
    if (seen === signature) return;
    setOpen(true);
    try {
      sessionStorage.setItem(key, signature);
    } catch {
      // As above.
    }
  }, [entityId, signature]);

  if (!open || warnings.length === 0) return null;

  const first = warnings[0];
  const late = first.kind === 'late';
  const title = late
    ? t(first.days === 1 ? 'dl.titleLateOne' : 'dl.titleLateMany', first.period.label, num(first.days) ?? '')
    : first.days === 0
      ? t('dl.titleToday', first.period.label)
      : t(first.days === 1 ? 'dl.titleDueOne' : 'dl.titleDueMany', first.period.label, num(first.days) ?? '');

  return (
    <Modal
      title={title}
      onClose={() => setOpen(false)}
      footer={
        <div className="row" style={{ gap: 10 }}>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setOpen(false);
              onReport(first.period.periodId);
            }}
          >
            <IconUpload size={16} /> {t('dl.reportNow', first.period.label)}
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            {t('dl.later')}
          </button>
        </div>
      }
    >
      <div className="stack">
        {warnings.map((w) => (
          <div
            key={w.period.periodId}
            className={'deadline-warning ' + (w.kind === 'late' ? 'deadline-late' : 'deadline-soon')}
            role="alert"
          >
            {w.kind === 'late' ? <IconAlert size={20} /> : <IconClock size={20} />}
            <div>
              <strong>
                {w.period.label}:{' '}
                {w.kind === 'late'
                  ? t(w.days === 1 ? 'dl.dueAgoOne' : 'dl.dueAgoMany', date(w.period.dueDate) ?? '', num(w.days) ?? '')
                  : t('dl.due', date(w.period.dueDate) ?? '')}
              </strong>
              <p className="small" style={{ margin: '4px 0 0' }}>
                {w.sub
                  ? t('dl.confirmed', num(w.sub.confirmedCount) ?? '', num(w.sub.targetCount) ?? '')
                  : t('dl.nothingFiled')}{' '}
                {w.kind === 'late' ? t('dl.lateNote') : t('dl.soonNote')}
              </p>
            </div>
          </div>
        ))}
        <p className="small muted" style={{ margin: 0 }}>
          {/* statutory against departmental. One is law and the other is an instruction, and a
              translation that renders both as "the rules say" loses the distinction. */}
          {first.period.statutory ? t('dl.statutory') : t('dl.departmental')}
        </p>
      </div>
    </Modal>
  );
}
