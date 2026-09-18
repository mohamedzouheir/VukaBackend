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
import { date, num } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { PeriodCard } from '../components/PeriodCard';
import { StateLine } from '../components/StateLine';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import {
  IconAlert, IconCheckCircle, IconDownload, IconPhone, IconReturn, IconUpload,
} from '../icons';
import './EntityHome.css';

export function EntityHome() {
  const { t } = useI18n();
  const L = useLabels();
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
          <h1>{me?.entityName ?? t('ws.yourEntity')}</h1>
          <p className="muted small">
            {t('home.reportingAs', me?.name ?? me?.email ?? '')}
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
              title={t('home.templateTitle')}
              onClick={(e) => {
                // Through fetch, so the token travels with it. A plain navigation carries no
                // Authorization header and landed the reporter on a JSON 401.
                e.preventDefault();
                setDownloadError(null);
                api
                  .download(api.templateUrl(entityId, current.periodId), 'vuka-template.xlsx')
                  .catch((err: unknown) =>
                    setDownloadError(err instanceof Error ? err.message : t('home.templateFailed')),
                  );
              }}
            >
              <IconDownload size={16} /> {t('home.downloadTemplate')}
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
              <IconUpload size={16} /> {t('home.uploadFile')}
            </button>
            <a className="btn" href="/m" title={t('home.phoneTitle')}>
              <IconPhone size={16} /> {t('home.captureOnPhone')}
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
            <strong>{t('home.returned')}</strong>
          </p>
          <p>
            {currentSub.returnReason ??
              t('home.noOverallReason')}
          </p>
          <p className="small muted">
            {t('home.onlyDisputed')}
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => navigate('/entity/submission/' + currentSub.submissionId + '/review')}
          >
            {t('home.correctDisputed')}
          </button>
        </div>
      ) : null}

      {/* Prior periods, because the risk engine reads exactly this history. */}
      <div className="card">
        <div className="section-head">
          <h2>{t('reporter.priorPeriods')}</h2>
          <span className="spacer" />
          <p className="small muted">
            {t('home.latenessNote')}
          </p>
        </div>

        {subs.loading ? (
          <Loading what={t('home.whatHistory')} />
        ) : subs.error ? (
          <ErrorState message={subs.error} onRetry={subs.reload} />
        ) : prior.length === 0 ? (
          <EmptyState>
            {t('home.noPrior')}
          </EmptyState>
        ) : (
          <ul className="prior">
            {prior.map((s) => (
              <li key={s.submissionId}>
                <span className="prior-period">{s.periodLabel}</span>
                <span className="chip">{L.status(s.status)}</span>
                <span className="muted small">
                  {t('home.reportedOf', num(s.confirmedCount) ?? '', num(s.targetCount) ?? '')}
                </span>
                <span className="spacer" />
                <span className={'small' + (s.daysLate && s.daysLate > 0 ? ' prior-late' : ' muted')}>
                  {s.submittedAt
                    ? s.daysLate === null
                      ? t('home.submittedOn', date(s.submittedAt) ?? '')
                      : s.daysLate > 0
                        ? s.daysLate === 1
                          ? t('home.submittedOneDayLate')
                          : t('home.submittedDaysLate', s.daysLate)
                        : t('home.submittedOnTime')
                    : t('home.neverSubmitted')}
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
            {t('home.deadlineNote', L.daysRemaining(current.daysRemaining) ?? '', current.label)}
          </span>
        </p>
      ) : null}

      <div className="tiles">
        <Tile
          value={targetCount === null ? null : num(targetCount)}
          label={t('home.targetsLabel')}
          sub={t('home.targetsSub')}
        />
        <Tile
          value={confirmed === null ? null : num(confirmed)}
          label={t('home.confirmedLabel')}
          sub={t('home.confirmedSub')}
        />
        <Tile
          value={currentSub === null ? null : num(currentSub.evidenceCount)}
          label={t('home.evidenceLabel')}
          sub={t('home.evidenceSub')}
        />
      </div>
    </div>
  );
}
