/*
 * W2. Extraction review.
 *
 * The most important screen in the product, and block 3 of the build order, which section
 * 12 says to protect. If everything after it is rough the product still demonstrates its
 * central claim, which is that a reported figure carries its provenance and a human
 * confirmed it. If this screen is rough and everything else is polished, we have built a
 * nicer version of something DPME already runs.
 *
 * Four things it does at once:
 *
 *   shows provenance beside every figure, which is the reliability test
 *   refuses a large variance without a reason, which prevents a two week round trip
 *   distinguishes unverifiable from unverified, in the Auditor-General's own words
 *   makes the irreversibility of confirming explicit before the click rather than after
 */
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { isOpenDispute, useLiveComments } from '../lib/useLiveComments';
import { CommentPanel } from '../components/CommentPanel';
import { num } from '../lib/format';
import type { IndicatorRowView } from '../lib/types';
import { IndicatorRowReview, IndicatorRowSkeleton, needsExplanation } from '../components/IndicatorRow';
import { StateLine } from '../components/StateLine';
import { EmptyState, ErrorState, Modal, NotFoundState } from '../components/Shell';
import {
  IconAlert, IconArrowLeft, IconCheck, IconInfo, IconPaperclip, IconSend, IconSpinner,
} from '../icons';
import './ExtractionReview.css';

/** What the reporter has typed, per row, before any of it is written. */
interface Draft {
  value: string;
  explanation: string;
  noResult: boolean;
  noResultReason: string;
}

const EMPTY: Draft = { value: '', explanation: '', noResult: false, noResultReason: '' };

export function ExtractionReview() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();

  const detail = useAsync(() => api.submission(submissionId!), [submissionId]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{ rows: IndicatorRowView[] } | null>(null);
  const [submitModal, setSubmitModal] = useState(false);
  const [evidenceFor, setEvidenceFor] = useState<IndicatorRowView | null>(null);
  const [busy, setBusy] = useState(false);

  // A dispute written while this screen is open appears against the figure without a reload.
  // Until the first poll answers, the row keeps what the page was served with.
  const live = useLiveComments(submissionId);
  const rows = useMemo(
    () =>
      (detail.data?.rows ?? []).map((r) =>
        live.comments === null
          ? r
          : {
              ...r,
              disputed: live.disputes.has(r.targetId),
              disputeComment: live.disputes.get(r.targetId) ?? null,
            },
      ),
    [detail.data, live.comments, live.disputes],
  );

  /* A returned period reopens exactly the figures the Department disputed, and each one closes
     again once the reporter confirms a figure after the dispute was raised. The dispute itself
     stays open until the Department closes it, so it cannot be the test on its own: that left a
     corrected figure reopened forever and the period impossible to resubmit. */
  const returned = detail.data?.submission.status === 'RETURNED';
  const disputedAt = useMemo(() => {
    const out = new Map<string, string>();
    for (const c of live.comments ?? []) {
      if (!isOpenDispute(c) || !c.createdAt) continue;
      const seen = out.get(c.anchorId!);
      if (!seen || c.createdAt > seen) out.set(c.anchorId!, c.createdAt);
    }
    return out;
  }, [live.comments]);
  const isReopened = useCallback(
    (row: IndicatorRowView) => {
      if (!returned || !row.confirmed || !row.disputed) return false;
      const raised = disputedAt.get(row.targetId);
      // Before the first poll answers there is no time to compare, so the row stays open.
      if (!raised || !row.confirmedAt) return true;
      return new Date(row.confirmedAt).getTime() < new Date(raised).getTime();
    },
    [returned, disputedAt],
  );

  /* The draft for a row starts from whatever the parser read, which is what the reporter
     is being asked to check. A reopened row starts from the figure actually filed, since that
     is the one in dispute. Never pre-filled with a target or a zero. */
  const draftFor = useCallback(
    (row: IndicatorRowView): Draft => {
      const held = drafts[row.targetId];
      if (held) return held;
      const filed = row.actual !== null ? String(row.actual) : '';
      const readable = row.extractedValue !== null && !Number.isNaN(Number(row.extractedValue));
      return {
        ...EMPTY,
        value: row.confirmed ? filed : readable ? row.extractedValue! : filed,
        explanation: row.varianceExplanation ?? '',
      };
    },
    [drafts],
  );

  const setDraft = useCallback((targetId: string, patch: Partial<Draft>, base: Draft) => {
    setDrafts((d) => ({ ...d, [targetId]: { ...base, ...patch } }));
  }, []);

  const outstanding = useMemo(() => rows.filter((r) => !r.confirmed || isReopened(r)), [rows, isReopened]);
  const confirmedCount = rows.length - outstanding.length;

  /* Rows a confirm-all may legally write: a numeric value, and a reason wherever the
     variance is past the threshold. A row missing its reason is left behind rather than
     written without one, and the count says how many. */
  const readyForBulk = useMemo(
    () =>
      outstanding.filter((r) => {
        const d = draftFor(r);
        if (d.noResult) return d.noResultReason.trim() !== '';
        const v = d.value.trim() === '' ? null : Number(d.value);
        if (v === null || Number.isNaN(v)) return false;
        const live =
          r.quarterTarget !== null && r.quarterTarget !== 0
            ? ((v - r.quarterTarget) / r.quarterTarget) * 100
            : null;
        if (live !== null && live < -20 && d.explanation.trim() === '') return false;
        return true;
      }),
    [outstanding, draftFor],
  );

  async function writeRows(toWrite: IndicatorRowView[]) {
    setBusy(true);
    setActionError(null);
    try {
      await api.confirm(
        submissionId!,
        toWrite.map((r) => {
          const d = draftFor(r);
          return {
            targetId: r.targetId,
            // A row recorded as having no result sends null, not zero. The backend stores
            // the reason as the variance explanation and leaves the actual absent.
            actualValue: d.noResult ? null : Number(d.value),
            varianceExplanation: d.noResult
              ? 'No result this quarter. ' + d.noResultReason.trim()
              : d.explanation.trim() || null,
          };
        }),
      );
      setDrafts({});
      setConfirmModal(null);
      detail.reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The figures were not written.');
    } finally {
      setBusy(false);
      setPendingRow(null);
    }
  }

  async function submitPeriod() {
    setBusy(true);
    setActionError(null);
    try {
      await api.submit(submissionId!);
      setSubmitModal(false);
      navigate('/entity');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The period was not submitted.');
    } finally {
      setBusy(false);
    }
  }

  if (detail.notFound) return <NotFoundState what="submission" />;
  if (detail.error) return <ErrorState message={detail.error} onRetry={detail.reload} />;

  if (detail.loading) {
    return (
      <div className="stack">
        <h1>Reviewing parsed figures</h1>
        <IndicatorRowSkeleton />
        <IndicatorRowSkeleton />
        <IndicatorRowSkeleton />
      </div>
    );
  }

  const d = detail.data!;
  const locked = d.submission.status === 'APPROVED' || d.submission.status === 'SUBMITTED';
  const withEvidence = rows.filter((r) => r.evidence.length > 0).length;
  const noResultRows = rows.filter((r) => r.noResultReason !== null).length;

  return (
    <div className="stack">
      <p>
        <Link to="/entity" className="row">
          <IconArrowLeft size={16} /> {d.entity.name}
        </Link>
      </p>

      <div className="section-head">
        <div>
          <h1>{d.period.label}</h1>
          <p className="muted">
            {d.sourceDocument
              ? 'Reviewing parsed file: ' + (d.sourceDocument.fileName ?? 'unnamed upload')
              : 'No file has been parsed for this period. Figures entered here are marked as entered by hand.'}
          </p>
        </div>
        <span className="spacer" />
        <p className="muted small nowrap">
          {num(confirmedCount)} of {num(rows.length)} confirmed
        </p>
      </div>

      {/* The warning that has to be above the rows rather than beside the button. */}
      {!locked ? (
        <p className="er-warning">
          <IconAlert size={18} />
          <span>
            Nothing here is saved as a reported result yet. Confirming writes these figures in your
            name, and they cannot be edited afterwards. A correction happens by the Department
            returning the submission.
          </span>
        </p>
      ) : null}

      {actionError ? <ErrorState message={actionError} /> : null}

      {rows.length === 0 ? (
        <EmptyState>
          No targets are registered for this entity for the current financial year, so there is
          nothing to report against. An administrator loads targets from the tabled Annual
          Performance Plan. This is an empty register rather than an empty result set.
        </EmptyState>
      ) : null}

      {rows.map((row) => {
        const draft = draftFor(row);
        return (
          <IndicatorRowReview
            key={row.targetId}
            row={row}
            // Passed the id, not a closure over the template: DocumentController resolves an
            // extraction id to the file it was read from and reports the cell with it, so the
            // link lands on the value rather than on the top of the spreadsheet.
            documentUrl={api.documentUrl}
            value={draft.value}
            onValue={(v) => setDraft(row.targetId, { value: v }, draft)}
            explanation={draft.explanation}
            onExplanation={(v) => setDraft(row.targetId, { explanation: v }, draft)}
            noResult={draft.noResult}
            onNoResult={(v) => setDraft(row.targetId, { noResult: v }, draft)}
            noResultReason={draft.noResultReason}
            onNoResultReason={(v) => setDraft(row.targetId, { noResultReason: v }, draft)}
            onAttach={() => setEvidenceFor(row)}
            onConfirm={() => {
              setPendingRow(row.targetId);
              setConfirmModal({ rows: [row] });
            }}
            reopened={isReopened(row)}
            fileParsed={d.sourceDocument !== null}
            pending={pendingRow === row.targetId && busy}
            disabled={locked}
          />
        );
      })}

      {/* Rows the parser read that match no registered target. Shown, never dropped. */}
      {d.unmatched.length > 0 ? (
        <div className="card">
          <h2>Held aside</h2>
          <p className="small muted">
            {d.unmatched.length} rows in the uploaded file carry an indicator code that matches no
            target registered for this year. They are not reportable against anything, and they are
            shown here rather than discarded because a silently dropped row is how a target goes
            unreported.
          </p>
          <ul className="er-unmatched">
            {d.unmatched.map((x) => (
              <li key={x.id}>
                <span className="mono">{x.indicatorRef ?? 'no code'}</span>
                <span>{x.extractedValue ?? 'no value'}</span>
                <span className="muted small">{x.sourceLocation ?? 'no source cell'}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!locked && rows.length > 0 ? (
        <div className="card er-foot">
          <div className="row">
            <strong>
              {num(confirmedCount)} of {num(rows.length)} confirmed
            </strong>
            <span className="spacer" />
            <button
              type="button"
              disabled={busy || readyForBulk.length === 0}
              onClick={() => setConfirmModal({ rows: readyForBulk })}
              title="Writes every row that has a figure and, where the variance is large, a reason"
            >
              <IconCheck size={16} /> Confirm {num(readyForBulk.length)} remaining
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || outstanding.length > 0}
              onClick={() => setSubmitModal(true)}
            >
              <IconSend size={16} /> Submit to the Department
            </button>
          </div>

          {outstanding.length > 0 ? (
            <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>
              Every target needs either a confirmed result or a recorded reason for having none
              before the period can be submitted.
              {readyForBulk.length < outstanding.length
                ? ' ' +
                  (outstanding.length - readyForBulk.length === 1
                    ? 'One row still needs'
                    : num(outstanding.length - readyForBulk.length) + ' rows still need') +
                  ' a figure, a reason for a shortfall past twenty percent, or a reason for having no result.'
                : null}
              {readyForBulk.length < outstanding.length ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      const first = outstanding.find((r) => !readyForBulk.includes(r));
                      const el = first ? document.getElementById('row-' + first.targetId) : null;
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      el?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
                    }}
                  >
                    Go to the first one
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      <CommentPanel
        comments={live.comments}
        targets={rows}
        announcement={live.announcement}
        onReply={async (targetId, parentId, body) => {
          try {
            await api.addComment(submissionId!, body, targetId, parentId);
            live.refresh();
            return true;
          } catch (e) {
            setActionError(e instanceof Error ? e.message : 'The reply was not sent.');
            return false;
          }
        }}
      />

      <StateLine
        status={d.submission.status}
        viewer="ENTITY_REPORTER"
        outstanding={outstanding.length}
        returnReason={d.submission.returnReason}
      />

      {/* ---------- the two irreversible actions ---------- */}

      {confirmModal ? (
        <Modal
          title={
            confirmModal.rows.length === 1
              ? 'Confirm this figure'
              : 'Confirm ' + confirmModal.rows.length + ' figures'
          }
          onClose={() => {
            setConfirmModal(null);
            setPendingRow(null);
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setConfirmModal(null);
                  setPendingRow(null);
                }}
                disabled={busy}
              >
                Not yet
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void writeRows(confirmModal.rows)}
              >
                {busy ? <IconSpinner size={16} className="spin" /> : <IconCheck size={16} />}
                Confirm
              </button>
            </>
          }
        >
          <p>
            Confirming writes{' '}
            {confirmModal.rows.length === 1 ? 'this figure' : 'these figures'} as this entity's
            reported results, <strong>in your name</strong>, and{' '}
            <strong>they cannot be edited afterwards</strong>. Corrections happen by a reviewer
            returning the submission, and the original row and its author stay on the record.
          </p>
          <ul className="er-confirm-list">
            {confirmModal.rows.map((r) => {
              const dr = draftFor(r);
              return (
                <li key={r.targetId}>
                  <span className="mono">{r.indicatorRef}</span>
                  <strong>{dr.noResult ? 'no result' : num(Number(dr.value))}</strong>
                  <span className="muted small">
                    {r.sourceLocation ? 'from ' + r.sourceLocation : 'entered by hand'}
                  </span>
                  {needsExplanation(r, dr.noResult ? null : Number(dr.value)) ? (
                    <span className="small">reason given</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="small muted">
            Figures with no evidence attached will show to the Department as unverifiable, which is
            different from unverified. Evidence may still be attached after confirming.
          </p>
        </Modal>
      ) : null}

      {submitModal ? (
        <Modal
          title={'Submit ' + d.period.label + ' to the Department'}
          onClose={() => setSubmitModal(false)}
          footer={
            <>
              <button type="button" onClick={() => setSubmitModal(false)} disabled={busy}>
                Not yet
              </button>
              <button type="button" className="primary" disabled={busy} onClick={() => void submitPeriod()}>
                {busy ? <IconSpinner size={16} className="spin" /> : <IconSend size={16} />}
                Submit
              </button>
            </>
          }
        >
          <ul className="er-summary">
            <li>
              <strong>{num(rows.length)}</strong> targets
            </li>
            <li>
              <strong>{num(confirmedCount - noResultRows)}</strong> with a confirmed result
            </li>
            <li>
              <strong>{num(noResultRows)}</strong> recorded as having no result, with reasons
            </li>
            <li>
              <strong>{num(withEvidence)}</strong> with evidence attached
            </li>
            <li>
              <strong>{num(rows.length - withEvidence)}</strong> with no evidence, which the
              Department will see as unverifiable
            </li>
          </ul>
          <p>
            {d.period.daysRemaining !== null && d.period.daysRemaining >= 0
              ? 'Submitting today, ' +
                d.period.daysRemaining +
                (d.period.daysRemaining === 1 ? ' day' : ' days') +
                ' before the due date.'
              : 'Submitting after the due date. The lateness is recorded rather than blocked, because a system that refuses late submissions produces no data at all.'}
          </p>
          <p>
            After this the Department holds it. You will be notified if any figure is returned to
            you.
          </p>
        </Modal>
      ) : null}

      {evidenceFor ? (
        <EvidenceDrawer
          submissionId={submissionId!}
          row={evidenceFor}
          onClose={() => setEvidenceFor(null)}
          onDone={() => {
            setEvidenceFor(null);
            detail.reload();
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The evidence drawer.
 *
 * It names the test being satisfied rather than saying "attach a document". The AGSA
 * criterion is a required choice because evidence with no criterion is a file in a folder,
 * and a folder of files is what this product exists to replace.
 */
function EvidenceDrawer({
  submissionId,
  row,
  onClose,
  onDone,
}: {
  submissionId: string;
  row: IndicatorRowView;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [criteria, setCriteria] = useState<string[]>(['COMPLETENESS']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const RELIABILITY = [
    { key: 'VALIDITY', text: 'Validity. The reported figure actually occurred and relates to this entity.' },
    { key: 'ACCURACY', text: 'Accuracy. The amounts and quantities are recorded correctly.' },
    { key: 'COMPLETENESS', text: 'Completeness. Everything that should have been recorded was.' },
  ];

  function toggle(key: string) {
    setCriteria((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]));
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await api.attachEvidence(submissionId, row.targetId, file, criteria);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The document was not stored.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Attach evidence"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || !file || criteria.length === 0}
            onClick={() => void upload()}
          >
            {busy ? <IconSpinner size={16} className="spin" /> : <IconPaperclip size={16} />}
            Attach
          </button>
        </>
      }
    >
      <p className="small muted" style={{ margin: 0 }}>
        <span className="mono">{row.indicatorRef}</span> {row.indicator}
      </p>

      <p className="ind-note ind-note-plain">
        <IconInfo size={16} />
        <span>
          The test being satisfied is the Auditor-General's reliability test: can this reported
          figure be traced back to a source document. An attendance register, a signed report, a
          photograph or an invoice all satisfy it. A figure with nothing attached is unverifiable,
          which is worse than unverified.
        </span>
      </p>

      <div>
        <label htmlFor="evidence-file">The document</label>
        <input
          id="evidence-file"
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <fieldset className="er-criteria">
        <legend>Which part of the reliability test it satisfies</legend>
        {RELIABILITY.map((c) => (
          <label key={c.key} className="ind-check">
            <input type="checkbox" checked={criteria.includes(c.key)} onChange={() => toggle(c.key)} />
            <span>{c.text}</span>
          </label>
        ))}
      </fieldset>

      {error ? <ErrorState message={error} /> : null}

      <p className="small muted">
        Evidence may be attached after submission. Withholding it is worse than attaching it late.
      </p>
    </Modal>
  );
}
