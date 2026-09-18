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
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync, useAction } from '../lib/useAsync';
import { useAuth } from '../lib/auth';
import { date, daysRemainingText, num, statusLabel } from '../lib/format';
import { PeriodCard } from '../components/PeriodCard';
import { StateLine } from '../components/StateLine';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import {
  IconAlert, IconCheckCircle, IconDownload, IconPhone, IconReturn, IconUpload,
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

      {currentSub?.status === 'RETURNED' ? (
        <div className="card returned">
          <p className="row">
            <IconReturn size={18} />
            <strong>The Department returned this period.</strong>
          </p>
          <p>
            {currentSub.returnReason ??
              'No overall reason was recorded. The disputed targets are marked on the review screen.'}
          </p>
          <p className="small muted">
            Only the disputed targets were reopened. Everything else stays as filed, with the
            original confirmation and its author on the record.
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => navigate('/entity/submission/' + currentSub.submissionId + '/review')}
          >
            Correct the disputed figures
          </button>
        </div>
      ) : null}

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
                <span className="prior-period">{s.periodLabel}</span>
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
