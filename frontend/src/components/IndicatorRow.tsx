/*
 * IndicatorRow. Component 8 of nine, and section 10 calls it the unit of work across the
 * whole product.
 *
 * Indicator, target, actual, variance, status, with provenance and evidence attached to
 * the figure rather than filed somewhere else. It renders in three modes because the same
 * unit of work is read by three different people:
 *
 *   review     the reporter confirming parsed figures, before anything is written
 *   verify     the reviewer checking a filed figure against its source
 *   read       the executive and the citizen surface, no controls
 *
 * The rule that survives all three modes is that a target with no result renders as "no
 * result reported" and never as a zero. The difference between not done and not reported
 * is the entire subject of this product.
 */
import { useState } from 'react';
import type { IndicatorRowView } from '../lib/types';
import { num, percent, signedPercent, statusLabel, dateTime } from '../lib/format';
import { ProvenanceCell } from './ProvenanceCell';
import { EvidenceChip } from './EvidenceChip';
import { IconAlert, IconCheck, IconCheckCircle, IconComment, IconUser } from '../icons';
import './components.css';

/** Section 10: a variance past twenty percent needs a reason before it can be confirmed. */
export const VARIANCE_EXPLANATION_THRESHOLD = 20;

export function needsExplanation(row: { variancePercent: number | null }, actual: number | null) {
  if (actual === null) return false;
  const v = row.variancePercent;
  return v !== null && v < -VARIANCE_EXPLANATION_THRESHOLD;
}

interface CommonProps {
  row: IndicatorRowView;
  documentUrl?: (documentId: string) => string;
}

/* ------------------------------------------------------------------ */
/* read mode                                                           */
/* ------------------------------------------------------------------ */

export function IndicatorRowRead({ row, documentUrl }: CommonProps) {
  return (
    <div className="ind">
      <div className="ind-head">
        <span className="mono ind-ref">{row.indicatorRef}</span>
        <h3>{row.indicator}</h3>
      </div>

      <div className="ind-figures">
        <ProvenanceCell
          value={num(row.actual)}
          sourceLocation={row.sourceLocation}
          documentUrl={documentUrl && row.extractionId ? documentUrl(row.extractionId) : null}
          linkDisabledReason={row.sourceLocation && !documentUrl ? 'Source file not openable here.' : null}
        />
        <dl className="ind-targets">
          <div>
            <dt>Quarter target</dt>
            <dd>{num(row.quarterTarget) ?? 'not set'}</dd>
          </div>
          <div>
            <dt>Annual target</dt>
            <dd>{num(row.annualTarget) ?? 'not set'}</dd>
          </div>
          <div>
            <dt>Variance</dt>
            <dd>
              {row.actual === null
                ? 'not applicable'
                : (num(row.variance) ?? '0') +
                  (row.variancePercent !== null ? ' (' + signedPercent(row.variancePercent) + ')' : '')}
            </dd>
          </div>
        </dl>
      </div>

      {row.noResultReason ? (
        <p className="ind-note">
          <IconAlert size={15} />
          <span>
            <strong>No result this quarter.</strong> {row.noResultReason}
          </span>
        </p>
      ) : null}

      <EvidenceChip
        evidence={row.evidence}
        agsaCriteria={row.agsaCriteria}
        traceable={row.traceable}
        documentUrl={documentUrl}
      />

      {row.confirmed ? (
        <p className="ind-confirmed">
          <IconUser size={14} />
          <span>
            Confirmed by {row.confirmedByName ?? 'an official at the entity'}
            {row.confirmedAt ? ', ' + dateTime(row.confirmedAt) : null}
          </span>
        </p>
      ) : null}

      {row.varianceExplanation ? (
        <p className="ind-note ind-note-plain">
          <IconComment size={15} />
          <span>{row.varianceExplanation}</span>
        </p>
      ) : null}

      {row.targetVersion !== null && row.targetVersion > 1 ? (
        <p className="small muted ind-version">
          Target version {row.targetVersion}
          {row.revisionTrigger ? ', changed under ' + statusLabel(row.revisionTrigger) : null}
          {row.retablingReference ? ', re-tabled as ' + row.retablingReference : null}. A target may
          only change where the Annual Performance Plan was revised and re-tabled.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* review mode: the reporter confirming parsed figures                 */
/* ------------------------------------------------------------------ */

interface ReviewProps extends CommonProps {
  /** The value in the input, held by the parent so a confirm-all can read every row. */
  value: string;
  onValue: (v: string) => void;
  explanation: string;
  onExplanation: (v: string) => void;
  noResult: boolean;
  onNoResult: (v: boolean) => void;
  noResultReason: string;
  onNoResultReason: (v: string) => void;
  onConfirm: () => void;
  onAttach: () => void;
  /**
   * Confirmed, but open again because the Department disputed it and returned the period.
   * Without this a returned figure rendered as locked and the reporter could not correct it.
   */
  reopened?: boolean;
  /** Whether a file has been parsed for this period, so a missing value is described truthfully. */
  fileParsed?: boolean;
  pending?: boolean;
  disabled?: boolean;
}

export function IndicatorRowReview(props: ReviewProps) {
  const { row, documentUrl, value, onValue, explanation, onExplanation } = props;
  const parsed = value.trim() === '' ? null : Number(value);
  const numeric = parsed !== null && !Number.isNaN(parsed);

  // Variance is recomputed against whatever is in the box, not against what was parsed,
  // so a reporter who corrects a figure sees the consequence of the correction.
  const qt = row.quarterTarget;
  const liveVariance = numeric && qt !== null && qt !== 0 ? ((parsed - qt) / qt) * 100 : null;
  const explanationRequired =
    liveVariance !== null && liveVariance < -VARIANCE_EXPLANATION_THRESHOLD && explanation.trim() === '';

  const inputId = 'actual-' + row.targetId;
  const noteId = 'note-' + row.targetId;
  const errorId = 'err-' + row.targetId;

  // A confirmed row is closed unless a return reopened it.
  const locked = row.confirmed && !props.reopened;

  // What the parser read, and whether it was a number at all. "about 12" is not.
  const extractedNumeric =
    row.extractedValue !== null && row.extractedValue.trim() !== '' && !Number.isNaN(Number(row.extractedValue));

  const canConfirm =
    !props.disabled &&
    !props.pending &&
    ((props.noResult && props.noResultReason.trim() !== '') || (numeric && !explanationRequired));

  return (
    <div className={'ind ind-review' + (locked ? ' ind-done' : '')} id={'row-' + row.targetId}>
      <div className="ind-head">
        <span className="mono ind-ref">{row.indicatorRef}</span>
        <h3>{row.indicator}</h3>
        {props.reopened ? (
          <span className="ind-badge">Reopened for correction</span>
        ) : row.confirmed ? (
          <span className="ind-badge ind-badge-ok">
            <IconCheckCircle size={14} /> Confirmed
          </span>
        ) : null}
      </div>

      {row.disputed ? (
        <p className="ind-note ind-note-warn">
          <IconComment size={15} />
          <span>
            <strong>The Department disputed this figure.</strong>{' '}
            {row.disputeComment ?? 'No comment was recorded.'}
          </span>
        </p>
      ) : null}

      {/* Before confirming, what the parser read beside the cell it came from. After, the figure
          actually filed, which is what the Department sees. Showing the parsed value on a
          confirmed row put a different number in front of each side of a dispute. */}
      {row.confirmed || row.extractedValue !== null || row.sourceLocation ? (
        <div className="ind-figures">
          <ProvenanceCell
            value={
              row.confirmed
                ? row.actual === null ? null : num(row.actual)
                : row.extractedValue === null ? null : row.extractedValue
            }
            sourceLocation={row.sourceLocation}
            documentUrl={documentUrl && row.extractionId ? documentUrl(row.extractionId) : null}
            emptyText={row.confirmed ? 'No result' : 'Not parsed'}
          />
          <dl className="ind-targets">
            <div>
              <dt>Quarter target</dt>
              <dd>{num(row.quarterTarget) ?? 'not set'}</dd>
            </div>
            <div>
              <dt>Annual target</dt>
              <dd>{num(row.annualTarget) ?? 'not set'}</dd>
            </div>
            <div>
              <dt>Variance</dt>
              <dd>
                {liveVariance === null
                  ? 'not applicable'
                  : num(parsed! - (qt ?? 0)) + ' (' + signedPercent(liveVariance) + ')'}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {!locked && !row.confirmed && row.extractedValue !== null && !extractedNumeric ? (
        <p className="ind-note">
          <IconAlert size={15} />
          <span>
            <strong>Not a number.</strong>{' '}
            {row.sourceLocation ? 'Cell ' + row.sourceLocation : 'The file'} reads &ldquo;
            {row.extractedValue}&rdquo;. Enter the figure as a number, or record that there is no
            result this quarter.
          </span>
        </p>
      ) : null}

      {!(row.confirmed || row.extractedValue !== null || row.sourceLocation) ? (
        <p className="ind-note">
          <IconAlert size={15} />
          <span>
            <strong>Not parsed.</strong>{' '}
            {row.sourceLocation
              ? 'Cell ' + row.sourceLocation + ' could not be read as a number.'
              : props.fileParsed
                ? 'No value for this indicator was found in the uploaded file.'
                : 'No file has been uploaded for this period.'}{' '}
            Enter it here, or record that there is no result this quarter.
          </span>
        </p>
      ) : null}

      {!locked ? (
        <div className="ind-form">
          <div className="ind-field">
            <label htmlFor={inputId}>
              Reported figure{row.unitOfMeasure ? ' (' + row.unitOfMeasure + ')' : ''}
            </label>
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              value={value}
              disabled={props.noResult || props.disabled}
              onChange={(e) => onValue(e.target.value)}
              aria-describedby={explanationRequired ? errorId : undefined}
              aria-invalid={explanationRequired || undefined}
            />
          </div>

          <div className="ind-field ind-field-wide">
            <label htmlFor={noteId}>
              {explanationRequired ? 'Reason for the variance (required)' : 'Note for the Department (optional)'}
            </label>
            <textarea
              id={noteId}
              value={explanation}
              disabled={props.disabled}
              onChange={(e) => onExplanation(e.target.value)}
              aria-describedby={explanationRequired ? errorId : undefined}
              aria-invalid={explanationRequired || undefined}
            />
            {explanationRequired ? (
              <p className="field-error" id={errorId}>
                A variance past {VARIANCE_EXPLANATION_THRESHOLD} percent needs a reason before you
                can confirm. Giving it now avoids the submission being returned, which costs about
                two weeks.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!locked ? (
        <div className="ind-noresult">
          <label className="ind-check">
            <input
              type="checkbox"
              checked={props.noResult}
              disabled={props.disabled}
              onChange={(e) => props.onNoResult(e.target.checked)}
            />
            <span>No result this quarter, because</span>
          </label>
          {props.noResult ? (
            <input
              type="text"
              aria-label="Reason there is no result this quarter"
              value={props.noResultReason}
              disabled={props.disabled}
              onChange={(e) => props.onNoResultReason(e.target.value)}
              placeholder=""
            />
          ) : null}
        </div>
      ) : null}

      <EvidenceChip
        evidence={row.evidence}
        agsaCriteria={row.agsaCriteria}
        traceable={row.traceable}
        documentUrl={documentUrl}
        // Offered even on a locked period: evidence may follow the figure, and withholding it is worse than late.
        onAttach={props.onAttach}
      />

      {locked ? (
        <p className="ind-confirmed">
          <IconUser size={14} />
          <span>
            Confirmed by {row.confirmedByName ?? 'you'}
            {row.confirmedAt ? ', ' + dateTime(row.confirmedAt) : null}. This figure cannot be
            edited. A reviewer who disputes it returns the submission.
          </span>
        </p>
      ) : (
        <div className="ind-actions">
          <button type="button" className="primary" disabled={!canConfirm} onClick={props.onConfirm}>
            <IconCheck size={16} />
            {props.noResult
              ? 'Record no result'
              : numeric
                ? 'Confirm ' + num(parsed)
                : 'Confirm'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* verify mode: the reviewer, with no edit control anywhere            */
/* ------------------------------------------------------------------ */

interface VerifyProps extends CommonProps {
  onDispute: (targetId: string, comment: string) => void;
  disputed: boolean;
  disputeComment: string;
  disabled?: boolean;
}

export function IndicatorRowVerify({
  row,
  documentUrl,
  onDispute,
  disputed,
  disputeComment,
  disabled,
}: VerifyProps) {
  const [open, setOpen] = useState(disputed);
  const [comment, setComment] = useState(disputeComment);
  const commentId = 'dispute-' + row.targetId;

  return (
    <div className={'ind ind-verify' + (disputed ? ' ind-disputed' : '')}>
      <div className="ind-head">
        <span className="mono ind-ref">{row.indicatorRef}</span>
        <h3>{row.indicator}</h3>
        {disputed ? (
          <span className="ind-badge ind-badge-warn">
            <IconComment size={14} /> Disputed
          </span>
        ) : null}
      </div>

      <div className="ind-figures">
        <ProvenanceCell
          value={num(row.actual)}
          sourceLocation={row.sourceLocation}
          documentUrl={documentUrl && row.extractionId ? documentUrl(row.extractionId) : null}
          emptyText={row.noResultReason ? 'No result, reason given' : 'No result reported'}
        />
        <dl className="ind-targets">
          <div>
            <dt>Quarter target</dt>
            <dd>{num(row.quarterTarget) ?? 'not set'}</dd>
          </div>
          <div>
            <dt>Variance</dt>
            <dd>
              {row.actual === null
                ? 'not applicable'
                : (num(row.variance) ?? '0') +
                  (row.variancePercent !== null ? ' (' + signedPercent(row.variancePercent) + ')' : '')}
            </dd>
          </div>
          <div>
            <dt>Delivery against annual</dt>
            <dd>
              {row.actual !== null && row.annualTarget
                ? percent((row.actual / row.annualTarget) * 100)
                : 'not applicable'}
            </dd>
          </div>
        </dl>
      </div>

      {row.noResultReason ? (
        <p className="ind-note">
          <IconAlert size={15} />
          <span>
            <strong>No result, reason given.</strong> {row.noResultReason}
          </span>
        </p>
      ) : null}

      {row.varianceExplanation ? (
        <p className="ind-note ind-note-plain">
          <IconComment size={15} />
          <span>
            <strong>The entity said: </strong>
            {row.varianceExplanation}
          </span>
        </p>
      ) : null}

      <EvidenceChip
        evidence={row.evidence}
        agsaCriteria={row.agsaCriteria}
        traceable={row.traceable}
        documentUrl={documentUrl}
      />

      {row.confirmed ? (
        <p className="ind-confirmed">
          <IconUser size={14} />
          <span>
            Confirmed by {row.confirmedByName ?? 'an official at the entity'}
            {row.confirmedAt ? ', ' + dateTime(row.confirmedAt) : null}
          </span>
        </p>
      ) : null}

      {/* There is no edit control on this row and that is the thing to point at during the
          demo. A reviewer can dispute, comment and return. She cannot change what the
          entity reported, and neither can anyone else, because the endpoint does not exist. */}
      {!open ? (
        <div className="ind-actions">
          <button type="button" disabled={disabled} onClick={() => setOpen(true)}>
            <IconComment size={16} /> Dispute this figure
          </button>
        </div>
      ) : (
        <div className="ind-dispute">
          <label htmlFor={commentId}>
            Reason. The entity sees this against this target only
          </label>
          <textarea
            id={commentId}
            value={comment}
            disabled={disabled}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={disabled || comment.trim() === ''}
              onClick={() => onDispute(row.targetId, comment.trim())}
            >
              <IconCheck size={16} /> Mark disputed
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setComment('');
                onDispute(row.targetId, '');
              }}
              disabled={disabled}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Loading. Skeleton rows, because an absent row and a pending row look identical otherwise. */
export function IndicatorRowSkeleton() {
  return (
    <div className="ind" aria-hidden="true">
      <div className="ind-head">
        <span className="skeleton" style={{ width: '4.5rem', height: '0.9rem' }} />
        <span className="skeleton" style={{ width: '16rem', height: '1.1rem' }} />
      </div>
      <span className="skeleton" style={{ width: '10rem', height: '1.4rem' }} />
      <div style={{ height: 8 }} />
      <span className="skeleton" style={{ width: '70%', height: '0.9rem' }} />
    </div>
  );
}
