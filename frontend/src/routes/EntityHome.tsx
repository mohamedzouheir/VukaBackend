/*
 * W1. Entity home.
 *
 * The entity name is present because it came off the token, not because anyone chose it.
 * There is no entity selector and there is no generic landing page: journey J1 records
 * that every extra click is a reason to go back to email.
 *
 * Prior periods are on this screen deliberately. The lateness signal is computed from
 * exactly this history, so showing the reporter the same history the risk engine reads
 * means the score is never a surprise. A system that scores you on data you cannot see is
 * a system people work around.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync, useAction } from '../lib/useAsync';
import { useAuth } from '../lib/auth';
import { isOpenDispute, useLiveComments } from '../lib/useLiveComments';
import type { SubmissionRow } from '../lib/types';
import { date, dateTime, daysRemainingText, num, statusLabel } from '../lib/format';
import { PeriodCard } from '../components/PeriodCard';
import { StateLine } from '../components/StateLine';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import {
  IconAlert, IconCheckCircle, IconChevronRight, IconComment, IconDownload, IconPhone, IconReturn,
  IconUpload,
} from '../icons';
import './EntityHome.css';

export function EntityHome() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const entityId = me?.entityId ?? null;

  const periods = useAsync(() => api.periods(), []);
  const subs = useAsync(
    () => api.submissions({ entityId: entityId! }),
    [entityId],
    entityId !== null,
  );

  /* A reviewer can return a period while this screen is open, and in the demonstration they do.
     Re-read the list every ten seconds while the tab is visible, so the returned card appears on
     its own rather than after a reload nobody thinks to do. */
  const reloadSubs = subs.reload;
  useEffect(() => {
    if (entityId === null) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') reloadSubs();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [entityId, reloadSubs]);

  const [opening, setOpening] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const open = useAction(async (periodId: string, then: 'upload' | 'review') => {
    const res = await api.openSubmission(entityId!, periodId, 'WEB');
    navigate('/entity/submission/' + res.submissionId + '/' + then);
  });

  /* The open period is the most recent one whose window has started. Never asked for:
     the quarter is derivable from the date, so it is defaulted rather than selected. */
  const current = useMemo(() => {
    const list = periods.data ?? [];
    return list.filter((p) => p.open).at(-1) ?? list.at(-1) ?? null;
  }, [periods.data]);

  const currentSub = useMemo(
    () => (subs.data ?? []).find((s) => current && s.periodId === current.periodId) ?? null,
    [subs.data, current],
  );

  /* Every period the Department has sent back, whichever quarter it was. The open quarter is Q2
     while the one under review is Q1, so a returned card keyed to the open quarter alone never
     showed the return the reporter most needed to see. */
  const returned = useMemo(
    () => (subs.data ?? []).filter((s) => s.status === 'RETURNED'),
    [subs.data],
  );

  const prior = useMemo(
    () =>
      (subs.data ?? [])
        .filter((s) => !current || s.periodId !== current.periodId)
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [subs.data, current],
  );

  if (!entityId) {
    return (
      <EmptyState>
        This account carries no entity id, so there is nothing for it to report on. An administrator
        sets the entityId claim on a reporter account, and it is deliberately not something the
        client can choose.
      </EmptyState>
    );
  }

  if (periods.error) return <ErrorState message={periods.error} onRetry={periods.reload} />;

  const targetCount = currentSub?.targetCount ?? null;
  const confirmed = currentSub?.confirmedCount ?? null;
  const outstanding =
    targetCount !== null && confirmed !== null ? targetCount - confirmed : null;

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h1>{me?.entityName ?? 'Your entity'}</h1>
          <p className="muted small">
            Reporting as {me?.name ?? me?.email}. The entity is taken from your signed token, which
            is why there is nothing here to choose.
          </p>
        </div>
      </div>

      {/* What the Department sent back comes first, above the new quarter, because it is the
          only thing on this screen somebody else is waiting on. */}
      {returned.map((r) => (
        <ReturnedCard key={r.submissionId} sub={r} />
      ))}

      <PeriodCard
        period={current}
        loading={periods.loading}
        error={periods.error}
        targetCount={targetCount}
        confirmed={confirmed}
      >
        {current ? (
          <>
            <a
              className="btn"
              href={api.templateUrl(entityId, current.periodId)}
              title="An .xlsx carrying your registered targets, their indicator codes and their annual targets, with the actuals column empty"
              onClick={(e) => {
                // Through fetch, so the token travels with it. A plain navigation carries no
                // Authorization header and landed the reporter on a JSON 401.
                e.preventDefault();
                setDownloadError(null);
                api
                  .download(api.templateUrl(entityId, current.periodId), 'vuka-template.xlsx')
                  .catch((err: unknown) =>
                    setDownloadError(err instanceof Error ? err.message : 'The template could not be downloaded.'),
                  );
              }}
            >
              <IconDownload size={16} /> Download template
            </a>
            <button
              type="button"
              className="primary"
              disabled={open.pending || opening}
              onClick={() => {
                setOpening(true);
                void open.run(current.periodId, 'upload').finally(() => setOpening(false));
              }}
            >
              <IconUpload size={16} /> Upload completed file
            </button>
            <a className="btn" href="/m" title="One indicator per screen, server rendered, under 5KB">
              <IconPhone size={16} /> Capture on a phone
            </a>
            {currentSub ? (
              <button
                type="button"
                onClick={() => navigate('/entity/submission/' + currentSub.submissionId + '/review')}
              >
                <IconCheckCircle size={16} /> Open this period
              </button>
            ) : null}
          </>
        ) : null}
      </PeriodCard>

      {open.error ? <ErrorState message={open.error} /> : null}
      {downloadError ? <ErrorState message={downloadError} /> : null}

      <StateLine
        status={currentSub?.status ?? null}
        viewer="ENTITY_REPORTER"
        outstanding={outstanding}
        returnReason={currentSub?.returnReason ?? null}
      />

      {/* Prior periods, because the risk engine reads exactly this history. */}
      <div className="card">
        <div className="section-head">
          <h2>Prior periods</h2>
          <span className="spacer" />
          <p className="small muted">
            The lateness signal in your risk score is computed from these rows and nothing else.
          </p>
        </div>

        {subs.loading ? (
          <Loading what="your reporting history" />
        ) : subs.error ? (
          <ErrorState message={subs.error} onRetry={subs.reload} />
        ) : prior.length === 0 ? (
          <EmptyState>
            No prior periods on record for this entity. That is an absence of history rather than a
            clean history, and the risk engine treats it that way.
          </EmptyState>
        ) : (
          <ul className="prior">
            {prior.map((s) => (
              <li key={s.submissionId}>
                <Link className="prior-period" to={'/entity/submission/' + s.submissionId + '/review'}>
                  {s.periodLabel}
                </Link>
                <span className="chip">{statusLabel(s.status)}</span>
                <span className="muted small">
                  {num(s.confirmedCount)} of {num(s.targetCount)} reported
                </span>
                <span className="spacer" />
                <span className={'small' + (s.daysLate && s.daysLate > 0 ? ' prior-late' : ' muted')}>
                  {s.submittedAt
                    ? s.daysLate === null
                      ? 'submitted ' + date(s.submittedAt)
                      : s.daysLate > 0
                        ? 'submitted ' + s.daysLate + (s.daysLate === 1 ? ' day late' : ' days late')
                        : 'submitted on time'
                    : 'never submitted'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {current && current.daysRemaining !== null && current.daysRemaining <= 15 ? (
        <p className="ind-note">
          <IconAlert size={16} />
          <span>
            {daysRemainingText(current.daysRemaining)} on {current.label}. The Department is notified
            at thirty days, at fifteen days and hourly in the final day, so a late submission is
            visible to them before it is late.
          </span>
        </p>
      ) : null}

      <div className="tiles">
        <Tile
          value={targetCount === null ? null : num(targetCount)}
          label="Targets registered for the year"
          sub="Loaded from your tabled Annual Performance Plan"
        />
        <Tile
          value={confirmed === null ? null : num(confirmed)}
          label="Figures confirmed this period"
          sub="Written in your name, and not editable afterwards"
        />
        <Tile
          value={currentSub === null ? null : num(currentSub.evidenceCount)}
          label="Evidence documents attached"
          sub="A figure with none shows as unverifiable"
        />
      </div>
    </div>
  );
}

/**
 * UC-6. One period the Department returned: who returned it, why, and each disputed figure with
 * the reviewer's own words against it, then one button into the confirmation screen, which opens
 * on the disputed rows only.
 *
 * The disputes are read live, on the same five second poll the confirmation screen uses, so a
 * figure the reviewer disputes while the reporter is looking appears here without a reload.
 */
function ReturnedCard({ sub }: { sub: SubmissionRow }) {
  const navigate = useNavigate();
  const live = useLiveComments(sub.submissionId);
  const disputes = (live.comments ?? []).filter(isOpenDispute);

  return (
    <section className="card returned" aria-labelledby={'returned-' + sub.submissionId}>
      <p className="row" style={{ gap: 8, margin: 0 }}>
        <IconReturn size={18} />
        <strong id={'returned-' + sub.submissionId}>
          {sub.periodLabel} was returned to you
          {sub.reviewedByName ? ' by ' + sub.reviewedByName : ''}
        </strong>
        <span className="spacer" />
        {sub.reviewedAt ? <span className="small muted">{dateTime(sub.reviewedAt)}</span> : null}
      </p>

      <p style={{ margin: 'var(--space-2) 0 0' }}>
        {sub.returnReason ?? 'No overall reason was recorded. The disputed figures are listed below.'}
      </p>

      {live.comments === null ? (
        <p className="small muted">Reading the reviewer's comments...</p>
      ) : disputes.length === 0 ? (
        <p className="small muted">
          No figure is marked as disputed, so the reason above is the whole of what was asked.
        </p>
      ) : (
        <ul className="returned-disputes">
          {disputes.map((c) => (
            <li key={c.commentId}>
              <IconComment size={16} className="muted" />
              <span>
                <strong className="mono">{c.indicatorRef ?? 'A figure'}</strong>{' '}
                <span>{c.body}</span>
                <em className="small muted">
                  {' '}
                  {c.authorName ?? 'DSAC'}
                  {c.createdAt ? ', ' + dateTime(c.createdAt) : ''}
                </em>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="small muted">
        Only these figures were reopened. Everything else stays as filed, with the original
        confirmation and its author on the record. Reply against a figure on the next screen and the
        reviewer sees it within seconds.
      </p>

      <button
        type="button"
        className="primary"
        onClick={() => navigate('/entity/submission/' + sub.submissionId + '/review')}
      >
        {disputes.length === 0
          ? 'Open the returned period'
          : disputes.length === 1
            ? 'Answer the disputed figure'
            : 'Answer the ' + num(disputes.length) + ' disputed figures'}{' '}
        <IconChevronRight size={16} />
      </button>
      <span className="visually-hidden" role="status">{live.announcement}</span>
    </section>
  );
}
