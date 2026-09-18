/*
 * Risk & Alerts, from docs/Front End designs/.
 *
 * <h2>What this screen takes from the design, and what it refuses</h2>
 *
 * Taken: the band tiles across the top, the distribution, the ranked alert table with priority,
 * entity, issue, score, status and an action, and the detail panel on the right.
 *
 * Refused, and the refusals matter more than the rest:
 *
 *   "Alerts Trend", a seven day line chart. Nothing stores a score per day. The engine computes
 *   a score for a reporting period, so a daily series would be drawn from numbers that do not
 *   exist.
 *
 *   "Predicted Impact: potential shortfall of 1,900 beneficiaries if current trend continues."
 *   This one is not a data gap, it is a contradiction. The entire defensibility argument for the
 *   risk engine is that it is arithmetic and not a prediction, reproducible by hand from stored
 *   figures. A panel headed Predicted Impact undoes the sentence a Director-General is meant to
 *   be able to say in public. In its place the panel shows the five stored signals, which is
 *   what the score is actually made of.
 *
 *   "Days Left" against an alert due date. Periods have due dates; alerts do not.
 *
 * Every figure below comes from a stored RiskScore and its RiskSignals.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { can, useAuth } from '../lib/auth';
import type { PortfolioRow, SubmissionRow } from '../lib/types';
import { BAND_ORDER, bandColour, num, rands, reviewPeriod } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { PageHead } from '../components/AppShell';
import { RiskBadge } from '../components/RiskBadge';
import { RiskPanel } from '../components/RiskPanel';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import {
  IconAlert, IconCheckCircle, IconChevronRight, IconGauge, IconInfo, IconSpinner, IconX,
} from '../icons';
import './RiskAlerts.css';

type BandFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export function RiskAlerts() {
  const { me } = useAuth();
  const { t } = useI18n();
  const L = useLabels();
  const portfolio = useAsync(() => api.portfolio(), []);
  const subs = useAsync(() => api.submissions(), []);
  const periods = useAsync(() => api.periods(), []);

  const [filter, setFilter] = useState<BandFilter>('ALL');
  const [selected, setSelected] = useState<PortfolioRow | null>(null);
  const [explain, setExplain] = useState<PortfolioRow | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  const period = useMemo(() => reviewPeriod(periods.data), [periods.data]);

  const subByEntity = useMemo(() => {
    const map = new Map<string, SubmissionRow>();
    for (const s of subs.data ?? []) {
      if (period && s.periodId !== period.periodId) continue;
      map.set(s.entityId, s);
    }
    return map;
  }, [subs.data, period]);

  const scored = useMemo(
    () => (portfolio.data ?? []).filter((r) => r.score !== null),
    [portfolio.data],
  );

  const rows = useMemo(
    () => (filter === 'ALL' ? scored : scored.filter((r) => r.band === filter)),
    [scored, filter],
  );

  const bandCount = (b: string) => scored.filter((r) => r.band === b).length;

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
    <div className="with-aside">
      <div>
        <PageHead
          icon={<IconAlert size={26} />}
          title={t('riskScreen.title')}
          subtitle={t('riskScreen.sub')}
        >
          {/* Offered only where the API accepts it. An executive reaching this screen by address
              reads the scores and is not shown a control that would be refused. */}
          {can(me, 'REVIEW_SUBMISSIONS') ? (
            <button type="button" onClick={() => void recompute()} disabled={recomputing}>
              {recomputing ? <IconSpinner size={16} className="spin" /> : <IconGauge size={16} />}
              Recompute scores
            </button>
          ) : null}
        </PageHead>

        {portfolio.loading ? (
          <Loading what={t('riskScreen.what')} />
        ) : scored.length === 0 ? (
          <EmptyState>
            No entity has been scored for this period. That is an absence of scoring rather than an
            absence of risk. Press Recompute to score the open period.
          </EmptyState>
        ) : (
          <>
            <div className="tiles">
              <Tile icon={<IconAlert size={22} />} tone="critical" value={num(bandCount('CRITICAL'))} label={L.band('CRITICAL')} sub={t('riskScreen.criticalSub')} />
              <Tile icon={<IconAlert size={22} />} tone="warn" value={num(bandCount('HIGH'))} label={L.band('HIGH')} sub={t('riskScreen.highSub')} />
              <Tile icon={<IconInfo size={22} />} tone="purple" value={num(bandCount('MEDIUM'))} label={L.band('MEDIUM')} sub={t('riskScreen.mediumSub')} />
              <Tile icon={<IconCheckCircle size={22} />} tone="ok" value={num(bandCount('LOW'))} label={L.band('LOW')} sub={t('riskScreen.lowSub')} />
            </div>

            <div className="card ra-block">
              <div className="section-head">
                <h2>{t('riskScreen.activeAlerts')}</h2>
                <span className="spacer" />
                <div className="row" style={{ gap: 6 }}>
                  {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as BandFilter[]).map((b) => (
                    <button
                      key={b}
                      type="button"
                      className={'filter-pill' + (filter === b ? ' filter-on' : '')}
                      aria-pressed={filter === b}
                      onClick={() => setFilter(b)}
                    >
                      {b === 'ALL'
                        ? t('riskScreen.filterCount', t('common.all'), num(scored.length) ?? '')
                        : t('riskScreen.filterCount', L.band(b), num(bandCount(b)) ?? '')}
                    </button>
                  ))}
                </div>
              </div>

              {rows.length === 0 ? (
                <EmptyState>{t('riskScreen.emptyBand')}</EmptyState>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('riskScreen.colBand')}</th>
                        <th>{t('entities.colEntity')}</th>
                        <th>{t('riskScreen.colFactor')}</th>
                        <th className="num">{t('riskScreen.colScore')}</th>
                        <th>{t('riskScreen.colReporting')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const s = subByEntity.get(r.entityId);
                        return (
                          <tr
                            key={r.entityId}
                            className={selected?.entityId === r.entityId ? 'ra-selected' : undefined}
                          >
                            <td>
                              <span className="ra-band" data-band={r.band}>
                                {L.band(r.band)}
                              </span>
                            </td>
                            <td>
                              <Link to={'/portfolio/entity/' + r.entityId} className="ent-name">
                                {r.shortName ?? r.name}
                              </Link>
                            </td>
                            <td className="ra-factor">
                              {r.signals[0]?.description ?? t('risk.noSignals')}
                            </td>
                            <td className="num">
                              <RiskBadge size="sm" score={r.score} band={r.band} onExplain={() => setExplain(r)} />
                            </td>
                            <td className="small">
                              {s ? (
                                L.status(s.status)
                              ) : (
                                <span className="chip chip-warn">{t('riskScreen.notSubmitted')}</span>
                              )}
                            </td>
                            <td>
                              <button type="button" className="link" onClick={() => setSelected(r)}>
                                {t('riskScreen.view')}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="small muted" style={{ marginTop: 'var(--space-4)' }}>
              {t('riskScreen.methodNote')}
            </p>
          </>
        )}
      </div>

      <aside className="aside">
        {selected ? (
          <AlertDetail
            row={selected}
            submission={subByEntity.get(selected.entityId) ?? null}
            onClose={() => setSelected(null)}
            onExplain={() => setExplain(selected)}
          />
        ) : (
          <section className="card">
            <h2 style={{ marginBottom: 'var(--space-3)' }}>{t('riskScreen.distribution')}</h2>
            {portfolio.loading ? (
              <Loading what={t('riskScreen.whatScores')} />
            ) : (
              <div className="stack-tight">
                {BAND_ORDER.filter((b) => b !== 'NOT_SCORED').map((b) => {
                  const n = bandCount(b);
                  const pct = scored.length ? Math.round((n / scored.length) * 100) : 0;
                  return (
                    <div key={b} className="sector-row">
                      <span className="sector-name">
                        <span
                          className="risk-swatch"
                          style={{ background: bandColour(b), marginRight: 8 }}
                          aria-hidden="true"
                        />
                        {L.band(b)}
                      </span>
                      <span className="sector-count">
                        {n} <span className="muted">({pct}%)</span>
                      </span>
                      <span className="sector-track" aria-hidden="true">
                        <span style={{ width: pct + '%', background: bandColour(b) }} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="small muted" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
              {t('riskScreen.selectAlert')}
            </p>
          </section>
        )}
      </aside>

      {explain ? (
        <RiskPanel risk={explain} entityName={explain.name} onClose={() => setExplain(null)} />
      ) : null}
    </div>
  );
}

/**
 * The detail panel. Where the design puts Alert Summary, Why this is a risk, Predicted Impact and
 * Recommended Action, this puts the five stored signals with their contributions, because that is
 * what the score is made of and the only part that can be defended line by line.
 */
function AlertDetail({
  row,
  submission,
  onClose,
  onExplain,
}: {
  row: PortfolioRow;
  submission: SubmissionRow | null;
  onClose: () => void;
  onExplain: () => void;
}) {
  const { t } = useI18n();
  const L = useLabels();

  return (
    <section className="card ra-detail" data-band={row.band}>
      <div className="ra-detail-head" data-band={row.band}>
        <strong>{t('riskScreen.bandRisk', L.band(row.band))}</strong>
        <span className="spacer" />
        <button type="button" className="ra-close" onClick={onClose} aria-label={t('common.close')}>
          <IconX size={16} />
        </button>
      </div>

      <div className="ra-detail-body">
        <h3>{row.name}</h3>
        <p className="small muted" style={{ marginTop: 2 }}>
          {t('riskScreen.allocatedThisYear', rands(row.totalAllocation) ?? t('riskScreen.noAllocationRow'))}
        </p>

        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          <RiskBadge score={row.score} band={row.band} movement={row.movement} onExplain={onExplain} />
        </div>

        <h4 style={{ marginTop: 'var(--space-4)' }}>{t('riskScreen.whyScore')}</h4>
        {row.signals.length === 0 ? (
          <p className="small muted">{t('risk.noSignals')}</p>
        ) : (
          <ul className="ra-signals">
            {row.signals.map((s) => (
              <li key={s.type}>
                <span className="ra-sig-head">
                  <strong>{L.signal(s.type)}</strong>
                  <span className="ra-sig-contrib">
                    {s.contribution === null ? t('risk.notStored') : num(s.contribution, { decimals: 1 })}
                  </span>
                </span>
                <span className="small muted">{s.description ?? t('riskScreen.noDescriptionStored')}</span>
              </li>
            ))}
          </ul>
        )}

        <h4 style={{ marginTop: 'var(--space-4)' }}>{t('riskScreen.reportingPeriod')}</h4>
        <p className="small" style={{ margin: 0 }}>
          {submission
            ? t(
                'riskScreen.reportingLine',
                L.status(submission.status),
                num(submission.confirmedCount) ?? '',
                num(submission.targetCount) ?? '',
                submission.evidenceCount > 0
                  ? t('riskScreen.evidenceDocs', num(submission.evidenceCount) ?? '')
                  : t('riskScreen.noEvidenceAttached'),
              )
            : t('riskScreen.nothingFiled')}
        </p>

        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <Link className="btn btn-primary" to={'/portfolio/entity/' + row.entityId}>
            {t('riskScreen.openEntity')} <IconChevronRight size={15} />
          </Link>
          {submission ? (
            <Link className="btn" to={'/review/' + submission.submissionId}>
              {t('riskScreen.reviewFiling')}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
