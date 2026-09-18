/*
 * W6. Review queue.
 *
 * Ranked by risk band, not by date received. Journey J3: a reviewer holding twenty eight
 * entities and a quarter to close cannot read everything, and their real question every
 * morning is which three things to look at today. Sorting by date means they work
 * alphabetically, run out of week at entity nineteen, and the ones that mattered were at
 * twenty four and twenty seven.
 *
 * Every row carries the single highest contributing signal in words, because a reviewer
 * who does not trust the ordering reverts to reading everything and the ranking has bought
 * nobody anything.
 *
 * Note what the top row is. An entity that has not submitted at all still appears, ranked,
 * with a score. Most systems show you what arrived. The thing a reviewer needs most is
 * what did not.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { can, useAuth } from '../lib/auth';
import type { PortfolioRow, SubmissionRow } from '../lib/types';
import { BAND_ORDER, num, reviewPeriod } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { RiskBadge, RiskBadgeSkeleton } from '../components/RiskBadge';
import { RiskPanel } from '../components/RiskPanel';
import { EmptyState, ErrorState, Loading } from '../components/Shell';
import { IconChevronRight, IconFilter, IconGauge, IconSpinner } from '../icons';
import './ReviewQueue.css';

type Sort = 'risk' | 'entity' | 'received';

export function ReviewQueue() {
  const { me } = useAuth();
  const { t } = useI18n();
  const portfolio = useAsync(() => api.portfolio(), []);
  const subs = useAsync(() => api.submissions(), []);
  const periods = useAsync(() => api.periods(), []);

  const [sort, setSort] = useState<Sort>('risk');
  const [explain, setExplain] = useState<PortfolioRow | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [limit, setLimit] = useState(5);

  const period = useMemo(() => reviewPeriod(periods.data), [periods.data]);

  /* One row per entity, carrying whichever submission exists for the current period. An
     entity with no submission still gets a row, which is the point of the screen. */
  const byEntity = useMemo(() => {
    const map = new Map<string, SubmissionRow>();
    for (const s of subs.data ?? []) {
      if (period && s.periodId !== period.periodId) continue;
      map.set(s.entityId, s);
    }
    return map;
  }, [subs.data, period]);

  const rows = useMemo(() => {
    const list = (portfolio.data ?? []).map((e) => ({ entity: e, sub: byEntity.get(e.entityId) ?? null }));
    if (sort === 'entity') {
      list.sort((a, b) => a.entity.name.localeCompare(b.entity.name));
    } else if (sort === 'received') {
      list.sort((a, b) => (b.sub?.submittedAt ?? '').localeCompare(a.sub?.submittedAt ?? ''));
    }
    // risk order is what the API already returns
    return list;
  }, [portfolio.data, byEntity, sort]);

  const counts = useMemo(() => {
    const total = rows.length;
    let submitted = 0;
    let outstanding = 0;
    let returned = 0;
    for (const r of rows) {
      const status = r.sub?.status;
      if (status === 'SUBMITTED' || status === 'UNDER_REVIEW' || status === 'APPROVED') submitted++;
      else if (status === 'RETURNED') returned++;
      else outstanding++;
    }
    return { total, submitted, outstanding, returned };
  }, [rows]);

  async function recompute() {
    setRecomputing(true);
    try {
      await api.recompute(period?.periodId);
      portfolio.reload();
    } finally {
      setRecomputing(false);
    }
  }

  if (portfolio.error) return <ErrorState message={portfolio.error} onRetry={portfolio.reload} />;

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h1>{t('review.queue')}</h1>
          <p className="muted">{period ? period.label : t('review.noOpenPeriod')}</p>
        </div>
        <span className="spacer" />
        {/* Offered only where the API accepts it. An executive reaching this screen by address
            reads the scores and is not shown a control that would be refused. */}
        {can(me, 'REVIEW_SUBMISSIONS') ? (
          <button type="button" onClick={() => void recompute()} disabled={recomputing}>
            {recomputing ? <IconSpinner size={16} className="spin" /> : <IconGauge size={16} />}
            {t('risk.recompute')}
          </button>
        ) : null}
      </div>

      {portfolio.loading ? (
        <Loading what={t('review.what')} />
      ) : (
        <>
          <p className="queue-counts">
            {t(
              'review.counts',
              num(counts.total) ?? '',
              num(counts.submitted) ?? '',
              num(counts.outstanding) ?? '',
              num(counts.returned) ?? '',
            )}
          </p>

          <div className="queue-sort">
            <IconFilter size={16} />
            <span className="small muted">{t('review.sortedBy')}</span>
            {(
              [
                ['risk', t('review.byRisk')],
                ['entity', t('review.byEntity')],
                ['received', t('review.byDate')],
              ] as [Sort, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={'queue-sort-btn' + (sort === key ? ' queue-sort-on' : '')}
                aria-pressed={sort === key}
                onClick={() => setSort(key)}
              >
                {label}
              </button>
            ))}
            {sort !== 'risk' ? (
              <span className="small muted">
                {t('review.sortNote')}
              </span>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <EmptyState>
              {t('review.noEntities')}
            </EmptyState>
          ) : null}

          <ol className="queue">
            {rows.slice(0, limit).map(({ entity, sub }) => (
              <QueueRow key={entity.entityId} entity={entity} sub={sub} onExplain={() => setExplain(entity)} />
            ))}
          </ol>

          {rows.length > limit ? (
            <p className="queue-more">
              <span className="muted small">{t('review.more', num(rows.length - limit) ?? '')}</span>
              <button type="button" className="link" onClick={() => setLimit(rows.length)}>
                {t('review.showAll')}
              </button>
            </p>
          ) : null}

          {subs.error ? (
            <ErrorState
              message={
                t('review.subsUnreadable') + subs.error
              }
              onRetry={subs.reload}
            />
          ) : null}
        </>
      )}

      {explain ? (
        <RiskPanel risk={explain} entityName={explain.name} onClose={() => setExplain(null)} />
      ) : null}
    </div>
  );
}

export function QueueRow({
  entity,
  sub,
  onExplain,
}: {
  entity: PortfolioRow;
  sub: SubmissionRow | null;
  onExplain: () => void;
}) {
  const { t } = useI18n();
  const L = useLabels();

  // The single highest contributing signal, in the words the risk panel will repeat.
  const top = entity.signals[0] ?? null;
  const bandIndex = BAND_ORDER.indexOf(entity.band);

  return (
    <li className="queue-row" data-band={entity.band} style={{ order: bandIndex }}>
      <div className="queue-row-head">
        <RiskBadge score={entity.score} band={entity.band} movement={entity.movement} onExplain={onExplain} />
        <h2>{entity.name}</h2>
        <span className="spacer" />
        <span className={'chip' + (sub ? '' : ' chip-warn')}>
          {sub ? L.status(sub.status) : t('riskScreen.notSubmitted')}
        </span>
      </div>

      <p className="queue-factor">
        {top ? (
          <>
            <strong>{t('review.largestFactor')}</strong> {top.description ?? L.signal(top.type)}
          </>
        ) : entity.band === 'NOT_SCORED' ? (
          t('review.notScoredRecompute')
        ) : (
          t('review.factorNoneMaterial')
        )}
      </p>

      <p className="queue-meta">
        {sub ? (
          <>
            {t('review.metaReported', num(sub.confirmedCount) ?? '', num(sub.targetCount) ?? '')}
            {sub.evidenceCount > 0
              ? t('review.metaEvidence', num(sub.evidenceCount) ?? '')
              : t('review.metaNoEvidence')}
            {sub.daysLate !== null && sub.daysLate > 0
              ? sub.daysLate === 1
                ? t('review.metaOneDayLate')
                : t('review.metaDaysLate', sub.daysLate)
              : null}
          </>
        ) : (
          t('review.nothingOpened')
        )}
      </p>

      {sub ? (
        <p className="queue-open">
          <Link className="btn" to={'/review/' + sub.submissionId}>
            {t('review.open')} <IconChevronRight size={16} />
          </Link>
        </p>
      ) : (
        <p className="queue-open">
          <Link className="btn" to={'/portfolio/entity/' + entity.entityId}>
            {t('review.seeEntity')} <IconChevronRight size={16} />
          </Link>
        </p>
      )}
    </li>
  );
}

/** Loading. Kept beside the real row so the two cannot drift apart. */
export function QueueRowSkeleton() {
  return (
    <li className="queue-row" aria-hidden="true">
      <div className="queue-row-head">
        <RiskBadgeSkeleton />
        <span className="skeleton" style={{ width: '14rem', height: '1.1rem' }} />
      </div>
      <span className="skeleton" style={{ width: '70%', height: '0.9rem' }} />
    </li>
  );
}
