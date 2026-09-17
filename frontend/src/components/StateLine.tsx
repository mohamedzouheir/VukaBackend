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
  holder: string;
  next: string;
}

export function stateLine({ status, viewer, outstanding, returnReason }: Props): Line {
  const reporter = viewer === 'ENTITY_REPORTER';
  const left = outstanding ?? null;

  switch (status) {
    case null:
      return reporter
        ? {
            holder: 'Waiting on you.',
            next: 'No submission has been opened for this period. Next: download the template, or capture on a phone.',
          }
        : {
            holder: 'Waiting on the entity.',
            next: 'Nothing has been opened for this period. Nobody at the Department can act until it arrives.',
          };

    case 'DRAFT':
      return reporter
        ? {
            holder: 'Waiting on you.',
            next:
              left === null
                ? 'Next: upload or capture, then confirm each figure.'
                : left === 0
                  ? 'Next: submit the period to the Department.'
                  : 'Next: ' + left + (left === 1 ? ' figure' : ' figures') + ' still to confirm before you can submit.',
          }
        : {
            holder: 'Waiting on the entity.',
            next: 'This is a draft. The Department cannot see figures until the entity submits.',
          };

    case 'SUBMITTED':
      return reporter
        ? {
            holder: 'The Department holds it.',
            next: 'You will be notified if any figure is returned to you. Evidence may still be attached.',
          }
        : {
            holder: 'Waiting on the Department.',
            next: 'Next: verify each figure against its source, then approve or return with comments.',
          };

    case 'UNDER_REVIEW':
      return reporter
        ? {
            holder: 'The Department holds it.',
            next: 'A reviewer has it open. You will be notified if any figure is returned.',
          }
        : {
            holder: 'Waiting on you.',
            next: 'Next: approve, or dispute specific targets and return the submission.',
          };

    case 'RETURNED':
      return reporter
        ? {
            holder: 'Waiting on you.',
            next:
              'Next: correct only the disputed figures and confirm again. ' +
              (returnReason ? 'Reason given: ' + returnReason : 'The disputed targets are marked below.'),
          }
        : {
            holder: 'Waiting on the entity.',
            next: 'Returned with comments. Only the disputed targets were reopened.',
          };

    case 'APPROVED':
      return reporter
        ? {
            holder: 'Closed.',
            next: 'Approved by the Department. The figures stay on the record as filed and cannot be edited.',
          }
        : {
            holder: 'Closed.',
            next: 'Approved and recorded against the reviewer who approved it. Approval does not make the figures editable.',
          };

    default:
      return { holder: 'State unknown.', next: 'The workflow state could not be read.' };
  }
}

export function StateLine(props: Props) {
  const line = stateLine(props);
  const waiting = line.holder.startsWith('Waiting on you');

  return (
    <p className={'state-line' + (waiting ? ' state-line-active' : '')} role="status">
      {waiting ? <IconClock size={16} /> : <IconInfo size={16} />}
      <span>
        <strong>{line.holder}</strong> {line.next}
      </span>
    </p>
  );
}
