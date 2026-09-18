/*
 * W10. Entity drilldown.
 *
 * The four boxes at the top are the whole product in one row: allocated, promised,
 * reported, verified, each citing where it came from. That row is what the pitch opens on,
 * and it is the reason the accountability chain is modelled as foreign keys rather than as
 * a diagram on a slide.
 *
 * The risk explanation here is the same explanation the reviewer saw, from the same stored
 * signals. Two versions of one fact is worse than none, which is why the panel is a shared
 * component reading stored signals rather than a second computation.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../lib/auth';
import { num, rands } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { ChainStrip } from '../components/ChainStrip';
import { RiskBadge, RiskBadgeError } from '../components/RiskBadge';
import { RiskPanel } from '../components/RiskPanel';
import { EmptyState, ErrorState, Loading, NotFoundState, SectorChip } from '../components/Shell';
import { IconAlert, IconArrowLeft, IconGauge, IconScale } from '../icons';
import './EntityDrilldown.css';

export function EntityDrilldown() {
  const { t } = useI18n();
  const L = useLabels();
  const { entityId } = useParams<{ entityId: string }>();
  const { me } = useAuth();
  const [explain, setExplain] = useState(false);

  const entity = useAsync(() => api.entity(entityId!), [entityId]);
  const chain = useAsync(() => api.chain(entityId!), [entityId]);

  if (entity.notFound) return <NotFoundState what={t('common.entity')} />;
  if (entity.error) return <ErrorState message={entity.error} onRetry={entity.reload} />;
  if (entity.loading) return <Loading what={t('uc.whatEntity')} />;

  const e = entity.data!;
  const reported = e.targets.filter((t) => t.status !== 'NOT_STARTED');

  return (
    <div className="stack">
      <p>
        <Link to="/portfolio" className="row">
          <IconArrowLeft size={16} /> {t('dd.portfolio')}
        </Link>
      </p>

      <div className="section-head">
        <div>
          <h1>{e.name}</h1>
          <p className="row small muted">
            <SectorChip sector={String(e.sector)} />
            <span>{t('dd.sectorLine', L.sector(String(e.sector)))}</span>
          </p>
        </div>
        <span className="spacer" />
        {e.risk ? (
          <RiskBadge score={e.risk.score} band={e.risk.band} movement={e.risk.movement} onExplain={() => setExplain(true)} />
        ) : (
          <RiskBadgeError onExplain={() => setExplain(true)} />
        )}
      </div>

      {e.mandate ? <p className="muted">{e.mandate}</p> : null}

      {/* The chain. */}
      <section>
        <h2 className="dd-heading">{t('dd.chain')}</h2>
        <ChainStrip chain={chain.data} loading={chain.loading} error={chain.error} />
      </section>

      {/* Trajectory. Hand drawn bars rather than a charting library, because a chart
          library is a hundred kilobytes for four numbers. */}
      <section className="card">
        <h2 className="dd-heading">{t('dd.trajectory')}</h2>
        <p className="small muted">{t('dd.trajectorySub')}</p>
        {chain.loading ? (
          <Loading what={t('dd.whatAllocations')} />
        ) : chain.error ? (
          <ErrorState message={chain.error} onRetry={chain.reload} />
        ) : (chain.data?.allocations ?? []).length === 0 ? (
          <EmptyState>
            {t('dd.noAllocations')}
          </EmptyState>
        ) : (
          <Trajectory rows={chain.data!.allocations} />
        )}
      </section>

      {/* Audit history. */}
      <section className="card">
        <h2 className="dd-heading">{t('dd.auditHistory')}</h2>
        {e.auditFindings.length === 0 ? (
          <EmptyState>
            {t('dd.noAuditOutcome')}
          </EmptyState>
        ) : (
          <ul className="dd-findings">
            {e.auditFindings.map((f, i) => (
              <li key={i}>
                <span className="dd-fy">{f.financialYear || t('dd.yearNotRecorded')}</span>
                <span className="dd-outcome">{L.outcome(f.outcome)}</span>
                {f.repeatFinding ? <span className="chip chip-warn">{t('dd.repeatFinding')}</span> : null}
                <span className="dd-desc">{f.description ?? t('dd.noDescriptionOnRecord')}</span>
                <span className="small muted">{L.status(f.resolutionStatus)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Outstanding. */}
      <section className="card">
        <h2 className="dd-heading">{t('dd.outstanding')}</h2>
        {chain.loading ? (
          <Loading what={t('dd.whatOutstanding')} />
        ) : (
          <ul className="dd-outstanding">
            <li>
              <IconAlert size={16} />
              <span>
                {chain.data?.targetsWithNoResult === null || chain.data?.targetsWithNoResult === undefined
                  ? t('dd.noResultCountUnreadable')
                  : chain.data.targetsWithNoResult === 1
                    ? t('dd.oneTargetNoResult')
                    : t('dd.targetsNoResult', num(chain.data.targetsWithNoResult) ?? '')}
              </span>
            </li>
            <li>
              <IconAlert size={16} />
              <span>
                {chain.data?.figuresWithNoEvidence === null || chain.data?.figuresWithNoEvidence === undefined
                  ? t('dd.noEvidenceCountUnreadable')
                  : chain.data.figuresWithNoEvidence === 1
                    ? t('dd.oneFigureNoEvidence')
                    : t('dd.figuresNoEvidence', num(chain.data.figuresWithNoEvidence) ?? '')}
              </span>
            </li>
          </ul>
        )}

        <div className="row dd-actions">
          <button type="button" onClick={() => setExplain(true)}>
            <IconGauge size={16} /> {t('risk.explain')}
          </button>
          <Link className="btn" to={'/portfolio/entity/' + entityId + '/unit-cost'}>
            <IconScale size={16} /> {t('uc.title')}
          </Link>
        </div>
      </section>

      {/* Targets, with what has been reported against each. */}
      <section className="card">
        <div className="section-head">
          <h2 className="dd-heading">{t('dd.targetsForYear')}</h2>
          <span className="spacer" />
          <p className="small muted">
            {t('dd.haveResult', num(reported.length) ?? '', num(e.targets.length) ?? '')}
          </p>
        </div>

        {e.targets.length === 0 ? (
          <EmptyState>
            {t('dd.noTargets')}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('uc.indicator')}</th>
                  <th className="num">{t('reporter.annualTarget')}</th>
                  <th className="num">{t('dd.colDelivered')}</th>
                  <th>{t('tasks.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {e.targets.map((row) => (
                  <tr key={row.targetId}>
                    <td>
                      <span className="mono ind-ref">{row.indicatorRef}</span> {row.indicator}
                      {row.unitOfMeasure ? (
                        <span className="small muted"> ({row.unitOfMeasure})</span>
                      ) : null}
                    </td>
                    <td className="num">{num(row.annualTarget) ?? t('common.notSet')}</td>
                    <td className="num">
                      {/* Never a zero for an absent result. */}
                      {row.status === 'NOT_STARTED' ? (
                        <em className="muted">{t('common.noResultReported')}</em>
                      ) : (
                        num(row.delivered)
                      )}
                    </td>
                    <td>{L.status(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="small muted">
        {t('dd.totalAllocation', rands(e.totalAllocation) ?? t('common.noAllocationRow'))}
        {chain.data?.allocatedCitation ? '. ' + chain.data.allocatedCitation : null}
        {me?.role === 'DSAC_EXECUTIVE' ? t('dd.readOnlyByDesign') : null}
      </p>

      {explain ? (
        <RiskPanel
          risk={e.risk}
          entityName={e.name}
          error={e.risk ? null : t('dd.scoreUnreadable')}
          onClose={() => setExplain(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Four bars, drawn as divs.
 *
 * A charting library would be about a hundred kilobytes against a two hundred and fifty
 * kilobyte budget for the whole dashboard, and this is four numbers. Each bar carries its
 * figure as text, so the picture is never the only way to read it.
 */
function Trajectory({ rows }: { rows: { financialYear: string; amount: number | null; basis: string | null }[] }) {
  const max = Math.max(...rows.map((r) => r.amount ?? 0), 1);

  return (
    <ul className="traj">
      {rows.map((r) => (
        <li key={r.financialYear}>
          <span className="traj-year">{r.financialYear}</span>
          <span className="traj-track" aria-hidden="true">
            <span
              className="traj-bar"
              style={{ width: r.amount === null ? '0%' : (r.amount / max) * 100 + '%' }}
            />
          </span>
          <span className="traj-value">{rands(r.amount) ?? 'no row'}</span>
          {r.basis ? <span className="traj-basis small muted">{r.basis}</span> : null}
        </li>
      ))}
    </ul>
  );
}
