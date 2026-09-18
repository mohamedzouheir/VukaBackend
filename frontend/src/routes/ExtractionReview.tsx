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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { isQueued, pendingFor, useOffline } from '../lib/offline';
import { isOpenDispute, useLiveComments } from '../lib/useLiveComments';
import { BulkEvidence } from '../components/BulkEvidence';
import { CommentPanel } from '../components/CommentPanel';
import { RELIABILITY } from '../lib/evidenceMatch';
import { readPaste } from '../lib/pasteFigures';
import { num } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
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
  const { t } = useI18n();
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();

  const detail = useAsync(() => api.submission(submissionId!), [submissionId]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  /* Figures confirmed with no connection and not sent yet go back into their boxes, so a reload
     offline, or coming back to this screen, shows what the reporter typed rather than what the
     parser read. The kept copy of the submission predates them. */
  const { outbox } = useOffline();
  useEffect(() => {
    if (!submissionId) return;
    const kept: Record<string, Draft> = {};
    for (const item of pendingFor('/api/submissions/' + submissionId + '/confirm')) {
      try {
        const body = JSON.parse(item.body ?? '{}') as {
          rows?: { targetId: string; actualValue: number | null; varianceExplanation: string | null }[];
        };
        for (const r of body.rows ?? []) {
          const reason = r.varianceExplanation ?? '';
          const none = r.actualValue === null;
          kept[r.targetId] = {
            value: none ? '' : String(r.actualValue),
            noResult: none,
            noResultReason: none ? reason.replace(/^No result this quarter\. /, '') : '',
            explanation: none ? '' : reason,
          };
        }
      } catch {
        // A kept change this screen cannot read is still in the outbox and still listed there.
      }
    }
    if (Object.keys(kept).length > 0) setDrafts((d) => ({ ...kept, ...d }));
  }, [submissionId, outbox]);
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{ rows: IndicatorRowView[] } | null>(null);
  const [submitModal, setSubmitModal] = useState(false);
  const [evidenceFor, setEvidenceFor] = useState<IndicatorRowView | null>(null);
  const [bulkEvidence, setBulkEvidence] = useState(false);
  /** What the last paste did, said where the reporter will see it: the sticky footer. */
  const [pasteNote, setPasteNote] = useState<{ text: string; refused: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  /* UC-6. A returned period is a request to correct specific figures, so once the Department
     has disputed something the screen opens on those and nothing else. The reporter can still
     see the whole filing, but they should not have to scroll twenty rows to find the three
     that were sent back. */
  const [disputedOnly, setDisputedOnly] = useState(true);

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

  const reopenedCount = useMemo(() => rows.filter(isReopened).length, [rows, isReopened]);

  /* Filtering never changes the counts in the footer or the submit modal: those are statements
     about the whole filing and must not follow the view. */
  const visibleRows = useMemo(
    () => (disputedOnly && reopenedCount > 0 ? rows.filter(isReopened) : rows),
    [rows, disputedOnly, reopenedCount, isReopened],
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

  /* A paste from the reporter's own spreadsheet. One column fills the box pasted into and the
     boxes below it, in the order on screen; a code and a figure side by side fill by code. Rows
     already confirmed keep their place in the column but are not changed, so a column copied
     whole still lines up. Nothing is written: the figures wait in the boxes for Confirm. */
  const pasteInto = useCallback(
    (from: IndicatorRowView, text: string): boolean => {
      const open = (r: IndicatorRowView) => !r.confirmed || isReopened(r);
      const pasted = readPaste(text, rows);

      if (pasted.kind === 'refused') {
        setPasteNote({ text: pasted.reason, refused: true });
        return true;
      }

      let placements: { row: IndicatorRowView; figure: string | null | undefined }[];
      let unmatched = 0;
      if (pasted.kind === 'column') {
        // A single figure is an ordinary paste, left to the box unless it needs tidying.
        if (pasted.figures.length === 1) {
          const f = pasted.figures[0];
          if (f === undefined || f === null || f === text.trim()) return false;
        }
        const start = visibleRows.findIndex((r) => r.targetId === from.targetId);
        placements = pasted.figures.map((figure, i) => ({ row: visibleRows[start + i], figure }))
          .filter((p) => p.row !== undefined);
        unmatched = Math.max(0, pasted.figures.length - placements.length);
      } else {
        placements = pasted.matches;
        unmatched = pasted.unmatched;
      }

      const filled: IndicatorRowView[] = [];
      const patch: Record<string, Draft> = {};
      let notNumbers = 0;
      let skippedConfirmed = 0;
      for (const { row, figure } of placements) {
        if (figure === null) continue;
        if (figure === undefined) { notNumbers++; continue; }
        if (!open(row)) { skippedConfirmed++; continue; }
        patch[row.targetId] = { ...draftFor(row), value: figure, noResult: false };
        filled.push(row);
      }
      setDrafts((current) => ({ ...current, ...patch }));

      if (filled.length === 0 && notNumbers === 0 && skippedConfirmed === 0) {
        setPasteNote({ text: t('er.pasteNothing'), refused: true });
        return true;
      }
      /* Whole sentences per case rather than fragments glued together, because the order a
         count, a noun and a range fall in is not the same in every language. */
      const one = filled.length === 1;
      const first = filled[0]?.indicatorRef ?? '';
      const last = filled[filled.length - 1]?.indicatorRef ?? '';
      const parts = [
        (filled.length === 0
          ? t('er.pasteFilledNone')
          : pasted.kind === 'byCode'
            ? t(one ? 'er.pasteByCodeOne' : 'er.pasteByCodeMany', filled.length)
            : one
              ? t('er.pasteRangeOne', filled.length, first)
              : t('er.pasteRangeMany', filled.length, first, last))
          + ' ' + t('er.pasteCheck'),
      ];
      if (skippedConfirmed) parts.push(t('er.pasteSkipped', skippedConfirmed));
      if (notNumbers) parts.push(t(notNumbers === 1 ? 'er.pasteNotNumberOne' : 'er.pasteNotNumberMany', notNumbers));
      if (unmatched) {
        parts.push(pasted.kind === 'byCode'
          ? t(unmatched === 1 ? 'er.pasteNoIndicatorOne' : 'er.pasteNoIndicatorMany', unmatched)
          : t(unmatched === 1 ? 'er.pastePastLastOne' : 'er.pastePastLastMany', unmatched));
      }
      setPasteNote({ text: parts.join(' '), refused: false });
      return true;
    },
    [rows, visibleRows, isReopened, draftFor, t],
  );
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
      const res = await api.confirm(
        submissionId!,
        toWrite.map((r) => {
          const d = draftFor(r);
          return {
            targetId: r.targetId,
            // A row recorded as having no result sends null, not zero. The backend stores
            // the reason as the variance explanation and leaves the actual absent.
            actualValue: d.noResult ? null : Number(d.value),
            varianceExplanation: d.noResult
              ? t('ind.noResultThisQuarter') + ' ' + d.noResultReason.trim()
              : d.explanation.trim() || null,
          };
        }),
      );
      setConfirmModal(null);
      // Kept offline rather than written: the figures stay in the boxes, and the bar at the top
      // lists the confirmation as waiting. Clearing them would show the parsed values again and
      // read as if the reporter's figures had been lost.
      if (isQueued(res)) return;
      setDrafts({});
      detail.reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('er.notWritten'));
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
      setActionError(e instanceof Error ? e.message : t('er.notSubmitted'));
    } finally {
      setBusy(false);
    }
  }

  if (detail.notFound) return <NotFoundState what={t('common.submission')} />;
  if (detail.error) return <ErrorState message={detail.error} onRetry={detail.reload} />;

  if (detail.loading) {
    return (
      <div className="stack">
        <h1>{t('er.title')}</h1>
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
              ? t('er.reviewingFile', d.sourceDocument.fileName ?? t('er.unnamedUpload'))
              : t('er.noFileParsed')}
          </p>
        </div>
        <span className="spacer" />
        <p className="muted small nowrap">
          {t('er.confirmedOf', num(confirmedCount) ?? '', num(rows.length) ?? '')}
          {', '}
          {t('er.withEvidence', num(withEvidence) ?? '')}
        </p>
        {/* Not hidden once submitted: evidence may be attached late, and withholding it is worse. */}
        {rows.length > 0 ? (
          <button type="button" onClick={() => setBulkEvidence(true)}>
            <IconPaperclip size={16} /> Attach evidence files
          </button>
        ) : null}
      </div>

      {/* The warning that has to be above the rows rather than beside the button. */}
      {!locked ? (
        <p className="er-warning">
          <IconAlert size={18} />
          <span>
            {t('er.warning')}
          </span>
        </p>
      ) : null}

      {actionError ? <ErrorState message={actionError} /> : null}

      {/* UC-6: only what was sent back, unless the reporter asks for the rest. */}
      {reopenedCount > 0 ? (
        <div className="er-scope">
          <span>
            <strong>
              {reopenedCount === 1
                ? t('er.oneReturnedForCorrection')
                : t('er.returnedForCorrection', num(reopenedCount) ?? '')}
            </strong>{' '}
            {disputedOnly ? t('er.restStaysFiled') : t('er.showingWhole')}
          </span>
          <span className="spacer" />
          <button type="button" className="link" onClick={() => setDisputedOnly((v) => !v)}>
            {disputedOnly ? t('er.showAll', num(rows.length) ?? '') : t('er.showReturned')}
          </button>
        </div>
      ) : null}

      {visibleRows.length === 0 ? (
        <EmptyState>
          {t('er.noTargets')}
        </EmptyState>
      ) : null}

      {visibleRows.map((row) => {
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
            onPasteText={(text) => pasteInto(row, text)}
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
          <h2>{t('er.heldAside')}</h2>
          <p className="small muted">
            {t('er.heldAsideBody', d.unmatched.length)}
          </p>
          <ul className="er-unmatched">
            {d.unmatched.map((x) => (
              <li key={x.id}>
                <span className="mono">{x.indicatorRef ?? t('er.noCode')}</span>
                <span>{x.extractedValue ?? t('er.noValue')}</span>
                <span className="muted small">{x.sourceLocation ?? t('er.noSourceCell')}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!locked && rows.length > 0 ? (
        <div className="card er-foot">
          <div className="row">
            <strong>
              {t('er.confirmedOf', num(confirmedCount) ?? '', num(rows.length) ?? '')}
            </strong>
            <span className="spacer" />
            <button
              type="button"
              disabled={busy || readyForBulk.length === 0}
              onClick={() => setConfirmModal({ rows: readyForBulk })}
              title={t('er.bulkTitle')}
            >
              <IconCheck size={16} /> {t('er.confirmRemaining', num(readyForBulk.length) ?? '')}
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || outstanding.length > 0}
              onClick={() => setSubmitModal(true)}
            >
              <IconSend size={16} /> {t('er.submitToDept')}
            </button>
          </div>

          <p
            className={'small ' + (pasteNote?.refused ? 'er-paste-refused' : 'muted')}
            role="status"
            style={{ marginTop: 'var(--space-2)' }}
          >
            {pasteNote
              ? pasteNote.text
              : t('er.pasteHint')}
          </p>

          {outstanding.length > 0 ? (
            <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>
              {t('er.everyTargetNeeds')}
              {readyForBulk.length < outstanding.length
                ? ' ' +
                  (outstanding.length - readyForBulk.length === 1
                    ? t('er.oneRowNeeds')
                    : t('er.nRowsNeed', num(outstanding.length - readyForBulk.length) ?? '')) +
                  t('er.needsWhat')
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
                    {t('er.goToFirst')}
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
            setActionError(e instanceof Error ? e.message : t('sr.replyNotSent'));
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
              ? t('er.confirmOne')
              : t('er.confirmN', confirmModal.rows.length)
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
                {t('er.notYet')}
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void writeRows(confirmModal.rows)}
              >
                {busy ? <IconSpinner size={16} className="spin" /> : <IconCheck size={16} />}
                {t('reporter.confirm')}
              </button>
            </>
          }
        >
          <p>
            {t('er.confirmBodyA')}
            {confirmModal.rows.length === 1 ? t('er.thisFigure') : t('er.theseFigures')}
            {t('er.confirmBodyB')}
            <strong>{t('er.inYourName')}</strong>
            {t('er.confirmBodyC')}
            <strong>{t('er.cannotBeEdited')}</strong>
            {t('er.confirmBodyD')}
          </p>
          <ul className="er-confirm-list">
            {confirmModal.rows.map((r) => {
              const dr = draftFor(r);
              return (
                <li key={r.targetId}>
                  <span className="mono">{r.indicatorRef}</span>
                  <strong>{dr.noResult ? t('er.noResultShort') : num(Number(dr.value))}</strong>
                  <span className="muted small">
                    {r.sourceLocation ? t('er.fromCell', r.sourceLocation) : t('er.enteredByHand')}
                  </span>
                  {needsExplanation(r, dr.noResult ? null : Number(dr.value)) ? (
                    <span className="small">{t('er.reasonGiven')}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="small muted">
            {t('er.unverifiableNote')}
          </p>
        </Modal>
      ) : null}

      {submitModal ? (
        <Modal
          title={t('er.submitTitle', d.period.label)}
          onClose={() => setSubmitModal(false)}
          footer={
            <>
              <button type="button" onClick={() => setSubmitModal(false)} disabled={busy}>
                {t('er.notYet')}
              </button>
              <button type="button" className="primary" disabled={busy} onClick={() => void submitPeriod()}>
                {busy ? <IconSpinner size={16} className="spin" /> : <IconSend size={16} />}
                {t('common.submit')}
              </button>
            </>
          }
        >
          <ul className="er-summary">
            <li>
              <strong>{num(rows.length)}</strong> {t('er.summaryTargets')}
            </li>
            <li>
              <strong>{num(confirmedCount - noResultRows)}</strong> {t('er.summaryConfirmed')}
            </li>
            <li>
              <strong>{num(noResultRows)}</strong> {t('er.summaryNoResult')}
            </li>
            <li>
              <strong>{num(withEvidence)}</strong> {t('er.summaryEvidence')}
            </li>
            <li>
              <strong>{num(rows.length - withEvidence)}</strong> {t('er.summaryNoEvidence')}
            </li>
          </ul>
          <p>
            {d.period.daysRemaining !== null && d.period.daysRemaining >= 0
              ? d.period.daysRemaining === 1
                ? t('er.submittingTodayOne')
                : t('er.submittingToday', d.period.daysRemaining)
              : t('er.submittingLate')}
          </p>
          <p>
            {t('er.afterThis')}
          </p>
        </Modal>
      ) : null}

      {bulkEvidence ? (
        <BulkEvidence
          submissionId={submissionId!}
          rows={rows}
          onClose={(attachedAny) => {
            setBulkEvidence(false);
            if (attachedAny) detail.reload();
          }}
        />
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
  const { t } = useI18n();
  const L = useLabels();
  const [file, setFile] = useState<File | null>(null);
  const [criteria, setCriteria] = useState<string[]>(['COMPLETENESS']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(e instanceof Error ? e.message : t('er.docNotStored'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t('er.attachTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || !file || criteria.length === 0}
            onClick={() => void upload()}
          >
            {busy ? <IconSpinner size={16} className="spin" /> : <IconPaperclip size={16} />}
            {t('er.attach')}
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
          {t('er.reliabilityNote')}
        </span>
      </p>

      <div>
        <label htmlFor="evidence-file">{t('er.theDocument')}</label>
        <input
          id="evidence-file"
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <fieldset className="er-criteria">
        <legend>{t('er.whichPart')}</legend>
        {RELIABILITY.map((c) => (
          <label key={c.key} className="ind-check">
            <input type="checkbox" checked={criteria.includes(c.key)} onChange={() => toggle(c.key)} />
            <span>{L.criterionText(c.key)}</span>
          </label>
        ))}
      </fieldset>

      {error ? <ErrorState message={error} /> : null}

      <p className="small muted">
        {t('er.afterSubmission')}
      </p>
    </Modal>
  );
}
