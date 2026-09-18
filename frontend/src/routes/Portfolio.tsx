/*
 * W9. Portfolio.
 *
 * Counts first. Journey J4: a Director-General wants to know how many, then which ones,
 * then why. Opening on a chart nobody asked for gets the order wrong.
 *
 * The line at the bottom is the one that gets quoted. Not "three entities are critical"
 * but "R358.6 million sits with entities in the critical band". Risk expressed in rands is
 * the sentence that can be taken into a committee meeting, and it is one multiplication
 * away from data already held.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import type { PortfolioRow, Sector } from '../lib/types';
import { BAND_ORDER, bandColour, num, randsShort } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { RiskPanel } from '../components/RiskPanel';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import { IconFilter, IconInfo } from '../icons';
import './Portfolio.css';

const SECTORS: Sector[] = ['ARTS', 'HERITAGE', 'LIBRARIES', 'SPORT', 'LANGUAGE', 'OTHER'];

export function Portfolio() {
  const { t } = useI18n();
  const L = useLabels();
  const portfolio = useAsync(() => api.portfolio(), []);
  const subs = useAsync(() => api.submissions(), []);
  const periods = useAsync(() => api.periods(), []);

  const [sector, setSector] = useState<Sector | null>(null);
  const [explain, setExplain] = useState<PortfolioRow | null>(null);

  const period = useMemo(() => (periods.data ?? []).filter((p) => p.open).at(-1) ?? null, [periods.data]);

  const rows = useMemo(
    () => (portfolio.data ?? []).filter((r) => (sector ? r.sector === sector : true)),
    [portfolio.data, sector],
  );

  const counts = useMemo(() => {
    const list = portfolio.data ?? [];
    const relevant = period ? (subs.data ?? []).filter((s) => s.periodId === period.periodId) : [];
    const submitted = relevant.filter(
      (s) => s.status === 'SUBMITTED' || s.status === 'UNDER_REVIEW' || s.status === 'APPROVED',
    );
    const targetsSet = relevant.reduce((n, s) => n + s.targetCount, 0);
    const targetsReported = relevant.reduce((n, s) => n + s.confirmedCount, 0);

    // Summed over whatever rows carry an allocation. An entity with no allocation row
    // contributes nothing rather than a zero, and the count of missing rows is shown, so
    // a partial total is never read as a complete one.
    const withAllocation = list.filter((r) => r.totalAllocation !== null);
    const allocated = withAllocation.reduce((sum, r) => sum + (r.totalAllocation ?? 0), 0);
    const criticalRows = list.filter((r) => r.band === 'CRITICAL');
    const criticalMoney = criticalRows
      .filter((r) => r.totalAllocation !== null)
      .reduce((sum, r) => sum + (r.totalAllocation ?? 0), 0);

    return {
      entities: list.length,
      submitted: submitted.length,
      outstanding: list.length - submitted.length,
      critical: criticalRows.length,
      criticalMoney: criticalRows.length === 0 ? null : criticalMoney,
      allocated: withAllocation.length === 0 ? null : allocated,
      missingAllocation: list.length - withAllocation.length,
      targetsSet,
      targetsReported,
    };
  }, [portfolio.data, subs.data, period]);

  const grouped = useMemo(() => {
    const map = new Map<string, PortfolioRow[]>();
    for (const band of BAND_ORDER) map.set(band, []);
    for (const r of rows) map.get(r.band)?.push(r);
    // Inside a band, largest first, because that is the order a committee asks about them.
    for (const list of map.values()) list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return map;
  }, [rows]);

  if (portfolio.error) return <ErrorState message={portfolio.error} onRetry={portfolio.reload} />;
  if (portfolio.loading) return <Loading what={t('pf.what')} />;

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h1>{t('pf.title')}</h1>
          <p className="muted">{period ? period.label : t('review.noOpenPeriod')}</p>
        </div>
      </div>

      {/* Counts first. */}
      <div className="tiles">
        <Tile
          value={randsShort(counts.allocated)}
          label={t('pf.allocatedThisYear')}
          sub={
            counts.missingAllocation > 0
              ? t('pf.noAllocationRows', num(counts.missingAllocation) ?? '')
              : t('pf.voteCitation')
          }
        />
        <Tile
          value={num(counts.entities)}
          label={t('pf.fundedBodies')}
          sub={t('pf.fundedBodiesSub')}
        />
        <Tile
          value={t('pf.countOf', num(counts.submitted) ?? '', num(counts.entities) ?? '')}
          label={t('pf.submittedQuarter')}
          sub={period ? period.label : t('entities.noOpenPeriod')}
        />
        <Tile
          value={
            counts.targetsSet === 0
              ? null
              : t('pf.countOf', num(counts.targetsReported) ?? '', num(counts.targetsSet) ?? '')
          }
          label={t('pf.targetsReported')}
          sub={t('pf.targetsReportedSub')}
        />
        <Tile
          value={num(counts.outstanding)}
          label={t('pf.outstanding')}
          sub={t('pf.outstandingSub')}
        />
        <Tile
          value={num(counts.critical)}
          label={t('dash.critical')}
          sub={t('pf.criticalSub')}
          tone="critical"
        />
      </div>

      <div className="queue-sort">
        <IconFilter size={16} />
        <span className="small muted">{t('pf.bySector')}</span>
        <button
          type="button"
          className={'queue-sort-btn' + (sector === null ? ' queue-sort-on' : '')}
          aria-pressed={sector === null}
          onClick={() => setSector(null)}
        >
          {t('pf.all')}
        </button>
        {SECTORS.map((s) => (
          <button
            key={s}
            type="button"
            className={'queue-sort-btn' + (sector === s ? ' queue-sort-on' : '')}
            aria-pressed={sector === s}
            onClick={() => setSector(s)}
          >
            {L.sector(s).toLowerCase()}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState>
          {t('pf.noEntitiesInSector')}
        </EmptyState>
      ) : (
        <div className="card">
          <h2>{t('pf.byRiskBand')}</h2>
          <p className="small muted">
            {t('pf.greyscaleNote')}
          </p>

          <div className="heatmap">
            {BAND_ORDER.map((band) => {
              const list = grouped.get(band) ?? [];
              if (list.length === 0) return null;
              return (
                <div className="heat-band" key={band}>
                  <div className="heat-label">
                    <span
                      className="risk-swatch"
                      style={{ background: bandColour(band) }}
                      aria-hidden="true"
                    />
                    <span>{L.band(band)}</span>
                    <span className="muted small">{num(list.length)}</span>
                  </div>
                  <ul className="heat-cells">
                    {list.map((r) => (
                      <li key={r.entityId}>
                        <Link to={'/portfolio/entity/' + r.entityId} className="heat-cell">
                          <span className="heat-name">{r.shortName ?? r.name}</span>
                          <span className="heat-score">
                            {r.score === null ? t('pf.notScored') : num(r.score)}
                          </span>
                          <span className="heat-money">
                            {randsShort(r.totalAllocation) ?? t('common.noAllocationRow')}
                          </span>
                        </Link>
                        <button
                          type="button"
                          className="link heat-why"
                          onClick={() => setExplain(r)}
                        >
                          {t('pf.why')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* The line that gets quoted. Risk expressed in rands rather than in a count. */}
          <p className="portfolio-quote">
            <IconInfo size={16} />
            <span>
              {counts.critical === 0 ? (
                t('pf.noneCritical')
              ) : counts.criticalMoney === null ? (
                <>
                  <strong>
                    {counts.critical === 1
                      ? t('pf.oneCritical')
                      : t('pf.criticalCount', num(counts.critical) ?? '')}
                  </strong>{' '}
                  {t('pf.noAllocationForCritical')}
                </>
              ) : (
                <>
                  <strong>
                    {counts.critical === 1
                      ? t('pf.criticalMoneyOne', randsShort(counts.criticalMoney) ?? '')
                      : t('pf.criticalMoney', randsShort(counts.criticalMoney) ?? '')}
                  </strong>{' '}
                  {t('pf.clickForFigures')}
                </>
              )}
            </span>
          </p>
        </div>
      )}

      {subs.error ? (
        <ErrorState
          message={t('pf.subsUnreadable') + subs.error}
          onRetry={subs.reload}
        />
      ) : null}

      <p className="small muted">
        Allocations shown in the drilldown are the published medium term estimates from Estimates of
        National Expenditure 2026, Vote 37, Table 37.3. Quarterly submission timings in the seed are
        illustrative, because per entity quarterly performance is not published at this granularity.
      </p>

      {explain ? (
        <RiskPanel risk={explain} entityName={explain.name} onClose={() => setExplain(null)} />
      ) : null}
    </div>
  );
}
