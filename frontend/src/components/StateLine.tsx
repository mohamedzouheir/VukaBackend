/*
 * StateLine. Component 1 of nine, and it appears on every screen.
 *
 * Government reporting fails at handoffs, not at data entry. A submission sitting in a
 * state nobody owns is the normal failure, and every one of the five journeys in section 3
 * breaks at a handoff rather than at a form. So each screen carries one line naming the
 * current holder and the next action.
 *
 * The line is generated from the workflow state rather than written into the template,
 * which is why the sentence lives in this file and not in six copies across the screens.
 */
import type { Role, SubmissionStatus } from '../lib/types';
import { useI18n } from '../lib/i18n';
import type { Key } from '../lib/i18n';
import { IconClock, IconInfo } from '../icons';
import './components.css';

interface Props {
  status: SubmissionStatus | null;
  /** The role reading the screen. The same state reads differently from each side. */
  viewer: Role;
  /** How many of the entity's targets still have no confirmed result. */
  outstanding?: number | null;
  returnReason?: string | null;
  reviewedByName?: string | null;
}

interface Line {
  holder: Key;
  next: Key;
  /* Carried as a flag rather than recovered by reading the holder sentence. The old version
     tested holder.startsWith('Waiting on you'), which is true in English and false in every
     other language, so the clock icon would have quietly stopped appearing. */
  waiting: boolean;
  /* Substituted into the next line where it takes one. */
  args?: (string | number)[];
}

export function stateLine({ status, viewer, outstanding, returnReason }: Props): Line {
  const reporter = viewer === 'ENTITY_REPORTER';
  const left = outstanding ?? null;

  switch (status) {
    case null:
      return reporter
        ? { holder: 'state.waitingOnYou', next: 'state.nullReporter', waiting: true }
        : { holder: 'state.waitingOnEntity', next: 'state.nullReviewer', waiting: false };

    case 'DRAFT':
      if (reporter) {
        if (left === null) return { holder: 'state.waitingOnYou', next: 'state.draftUnknown', waiting: true };
        if (left === 0) return { holder: 'state.waitingOnYou', next: 'state.draftReady', waiting: true };
        return {
          holder: 'state.waitingOnYou',
          next: left === 1 ? 'state.draftOneLeft' : 'state.draftLeft',
          waiting: true,
          args: [left],
        };
      }
      return { holder: 'state.waitingOnEntity', next: 'state.draftReviewer', waiting: false };

    case 'SUBMITTED':
      return reporter
        ? { holder: 'state.deptHolds', next: 'state.submittedReporter', waiting: false }
        : { holder: 'state.waitingOnDept', next: 'state.submittedReviewer', waiting: true };

    case 'UNDER_REVIEW':
      return reporter
        ? { holder: 'state.deptHolds', next: 'state.reviewReporter', waiting: false }
        : { holder: 'state.waitingOnYou', next: 'state.reviewReviewer', waiting: true };

    case 'RETURNED':
      if (reporter) {
        return {
          holder: 'state.waitingOnYou',
          next: returnReason ? 'state.returnedWithReason' : 'state.returnedNoReason',
          waiting: true,
          args: returnReason ? [returnReason] : undefined,
        };
      }
      return { holder: 'state.waitingOnEntity', next: 'state.returnedReviewer', waiting: false };

    case 'APPROVED':
      return reporter
        ? { holder: 'state.closed', next: 'state.approvedReporter', waiting: false }
        : { holder: 'state.closed', next: 'state.approvedReviewer', waiting: false };

    default:
      return { holder: 'state.unknown', next: 'state.unreadable', waiting: false };
  }
}

export function StateLine(props: Props) {
  const { t } = useI18n();
  const line = stateLine(props);

  return (
    <p className={'state-line' + (line.waiting ? ' state-line-active' : '')} role="status">
      {line.waiting ? <IconClock size={16} /> : <IconInfo size={16} />}
      <span>
        <strong>{t(line.holder)}</strong> {t(line.next, ...(line.args ?? []))}
      </span>
    </p>
  );
}
