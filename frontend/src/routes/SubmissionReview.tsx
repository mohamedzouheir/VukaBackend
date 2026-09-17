/*
 * W8. Submission review, verifying against source.
 *
 * There is no edit control on this screen and that is the thing to point at during the
 * demo. The reviewer can dispute, comment and return. She cannot change what the entity
 * reported, and neither can anyone else, because the endpoint does not exist.
 *
 * Returning sends only the disputed targets back. A single free text box for the whole
 * submission is the lazy version and it fails in a specific way: the entity guesses which
 * number the reviewer meant, corrects the wrong one, and the loop costs another two weeks.
 *
 * Approval is per submission and recorded with the reviewer's name and the time. Silent
 * bulk approval is deliberately not offered: an audit trail showing twenty eight approvals
 * in four seconds is a question from the Auditor-General rather than a feature.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { date, dateTime, num } from '../lib/format';
import { IndicatorRowSkeleton, IndicatorRowVerify } from '../components/IndicatorRow';
import { RiskBadge } from '../components/RiskBadge';
import { RiskPanel } from '../components/RiskPanel';
import { StateLine } from '../components/StateLine';
import { EmptyState, ErrorState, Modal, NotFoundState } from '../components/Shell';
import {
  IconAlert, IconArrowLeft, IconCheckCircle, IconDownload, IconReturn, IconSpinner,
} from '../icons';
import './SubmissionReview.css';

export function SubmissionReview() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();

  const detail = useAsync(() => api.submission(submissionId!), [submissionId]);

  /* Disputes are held here until the reviewer returns the submission, so she can mark
     three figures and send them in one action rather than three. */
  const [disputes, setDisputes] = useState<Record<string, string>>({});
  const [explain, setExplain] = useState(false);
  const [returnModal, setReturnModal] = useState(false);
  const [approveModal, setApproveModal] = useState(false);
  const [overall, setOverall] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = detail.data?.rows ?? [];
  const disputedIds = useMemo(
    () => Object.entries(disputes).filter(([, c]) => c.trim() !== '').map(([id]) => id),
    [disputes],
  );

  const verifiable = rows.filter((r) => r.traceable).length;
  const noEvidence = rows.filter((r) => r.actual !== null && r.evidence.length === 0).length;

  async function doReturn() {
    setBusy(true);
    setError(null);
    try {
      // The per target comments go first, so each disputed figure carries its own reason
      // against that target before the submission state moves.
      for (const targetId of disputedIds) {
        await api.addComment(submissionId!, disputes[targetId], targetId);
      }
      const reason =
        overall.trim() ||
        num(disputedIds.length) +
          (disputedIds.length === 1 ? ' figure disputed.' : ' figures disputed.') +
          ' See the comment against each target.';
      await api.review(submissionId!, false, reason);
      setReturnModal(false);
      navigate('/review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The submission was not returned.');
    } finally {
      setBusy(false);
    }
  }

  async function doApprove() {
    setBusy(true);
    setError(null);
    try {
      await api.review(submissionId!, true);
      setApproveModal(false);
      navigate('/review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The approval was not recorded.');
    } finally {
      setBusy(false);
    }
  }

  if (detail.notFound) return <NotFoundState what="submission" />;
  if (detail.error) return <ErrorState message={detail.error} onRetry={detail.reload} />;

  if (detail.loading) {
    return (
      <div className="stack">
        <h1>Submission</h1>
        <IndicatorRowSkeleton />
        <IndicatorRowSkeleton />
      </div>
    );
  }

  const d = detail.data!;
  const closed = d.submission.status === 'APPROVED' || d.submission.status === 'RETURNED';
  // DocumentController takes either a document id or an extraction id, so one function serves
  // both the evidence chips and the source cell beside each figure.
  const docUrl = api.documentUrl;

  return (
    <div className="stack">
      <p>
        <Link to="/review" className="row">
          <IconArrowLeft size={16} /> queue
        </Link>
      </p>

      <div className="section-head">
        <div>
          <h1>{d.entity.name}</h1>
          <p className="muted">
            {d.period.label}
            {d.entity.pfmaSchedule ? ', ' + d.entity.pfmaSchedule.replace(/_/g, ' ') : null}
            {d.entity.reportingLine ? ', ' + d.entity.reportingLine : null}
          </p>
        </div>
        <span className="spacer" />
        {d.risk ? (
          <RiskBadge score={d.risk.score} band={d.risk.band} onExplain={() => setExplain(true)} />
        ) : null}
      </div>

      <div className="card sr-head">
        <p style={{ margin: 0 }}>
          {d.submission.submittedAt ? (
            <>
              Submitted {dateTime(d.submission.submittedAt)} by{' '}
              {d.submission.submittedByName ?? 'an official at the entity'}
              {d.submission.daysLate !== null
                ? d.submission.daysLate > 0
                  ? ', ' +
                    d.submission.daysLate +
                    (d.submission.daysLate === 1 ? ' day' : ' days') +
                    ' after the due date of ' +
                    date(d.period.dueDate)
                  : ', ' +
                    Math.abs(d.submission.daysLate) +
                    (Math.abs(d.submission.daysLate) === 1 ? ' day' : ' days') +
                    ' before the due date'
                : null}
            </>
          ) : (
            'Not submitted. Nothing has been filed for this period.'
          )}
        </p>
        <p className="small muted" style={{ margin: 'var(--space-1) 0 0' }}>
          {num(verifiable)} of {num(rows.length)} verifiable
          {noEvidence > 0 ? ', ' + num(noEvidence) + ' reported figures with no evidence' : null}
        </p>
        {d.submission.reviewedByName ? (
          <p className="small muted" style={{ margin: 'var(--space-1) 0 0' }}>
            Last reviewed by {d.submission.reviewedByName}
            {d.submission.reviewedAt ? ', ' + dateTime(d.submission.reviewedAt) : null}
          </p>
        ) : null}
      </div>

      {error ? <ErrorState message={error} /> : null}

      {rows.length === 0 ? (
        <EmptyState>
          No targets are registered for this entity for the current financial year, so there is
          nothing filed to verify.
        </EmptyState>
      ) : null}

      {rows.map((row) => (
        <IndicatorRowVerify
          key={row.targetId}
          row={row}
          documentUrl={docUrl}
          disabled={closed}
          disputed={(disputes[row.targetId] ?? '').trim() !== '' || row.disputed}
          disputeComment={disputes[row.targetId] ?? row.disputeComment ?? ''}
          onDispute={(targetId, comment) =>
            setDisputes((m) => {
              const next = { ...m };
              if (comment === '') delete next[targetId];
              else next[targetId] = comment;
              return next;
            })
          }
        />
      ))}

      {rows.length > 0 ? (
        <div className="card sr-foot">
          <div className="row">
            <strong>
              {disputedIds.length === 0
                ? 'No figures disputed'
                : num(disputedIds.length) +
                  (disputedIds.length === 1 ? ' figure disputed' : ' figures disputed')}
            </strong>
            <span className="spacer" />
            <a
              className="btn"
              href={api.exportUrl(d.submission.submissionId, 'full.csv')}
              onClick={(e) => {
                e.preventDefault();
                void api.download(
                  api.exportUrl(d.submission.submissionId, 'full.csv'),
                  'submission-full.csv',
                );
              }}
            >
              <IconDownload size={16} /> Export with provenance
            </a>
            <button
              type="button"
              disabled={closed || busy || disputedIds.length === 0}
              onClick={() => setReturnModal(true)}
            >
              <IconReturn size={16} /> Return with comments
            </button>
            <button
              type="button"
              className="primary"
              disabled={closed || busy || disputedIds.length > 0}
              onClick={() => setApproveModal(true)}
            >
              <IconCheckCircle size={16} /> Approve
            </button>
          </div>

          <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>
            {disputedIds.length > 0
              ? 'Returning sends only the disputed targets back. The rest stays as filed, with the original confirmation and its author on the record.'
              : 'There is no control on this screen that changes a reported figure, and no endpoint behind one. A figure you do not believe is disputed and returned, not edited.'}
          </p>
        </div>
      ) : null}

      <StateLine
        status={d.submission.status}
        viewer="DSAC_REVIEWER"
        returnReason={d.submission.returnReason}
      />

      {explain ? (
        <RiskPanel
          risk={d.risk}
          entityName={d.entity.name}
          onClose={() => setExplain(false)}
        />
      ) : null}

      {returnModal ? (
        <Modal
          title="Return this submission"
          onClose={() => setReturnModal(false)}
          footer={
            <>
              <button type="button" onClick={() => setReturnModal(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="primary" disabled={busy} onClick={() => void doReturn()}>
                {busy ? <IconSpinner size={16} className="spin" /> : <IconReturn size={16} />}
                Return {num(disputedIds.length)}{' '}
                {disputedIds.length === 1 ? 'figure' : 'figures'}
              </button>
            </>
          }
        >
          <p>
            The entity sees each comment against the specific target it belongs to, not as one note
            about the whole submission. Only the disputed targets are reopened.
          </p>
          <ul className="sr-disputes">
            {disputedIds.map((id) => {
              const row = rows.find((r) => r.targetId === id)!;
              return (
                <li key={id}>
                  <span className="mono">{row.indicatorRef}</span>
                  <span>{row.indicator}</span>
                  <em>{disputes[id]}</em>
                </li>
              );
            })}
          </ul>
          <div>
            <label htmlFor="sr-overall">An overall note, if one helps (optional)</label>
            <textarea id="sr-overall" value={overall} onChange={(e) => setOverall(e.target.value)} />
          </div>
          <p className="small muted">
            This action is recorded against your name and the time.
          </p>
        </Modal>
      ) : null}

      {approveModal ? (
        <Modal
          title="Approve this submission"
          onClose={() => setApproveModal(false)}
          footer={
            <>
              <button type="button" onClick={() => setApproveModal(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="primary" disabled={busy} onClick={() => void doApprove()}>
                {busy ? <IconSpinner size={16} className="spin" /> : <IconCheckCircle size={16} />}
                Approve
              </button>
            </>
          }
        >
          <p>
            Approval is recorded against <strong>your name</strong> and the time, for this
            submission only. It does not make any figure editable by anyone, including you.
          </p>
          {noEvidence > 0 ? (
            <p className="ind-note">
              <IconAlert size={16} />
              <span>
                {num(noEvidence)} reported{' '}
                {noEvidence === 1 ? 'figure has' : 'figures have'} no evidence attached and will
                stay on the record as unverifiable. Approving does not change that, and the export
                carries it.
              </span>
            </p>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
