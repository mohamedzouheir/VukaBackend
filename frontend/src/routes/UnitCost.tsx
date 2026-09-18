/*
 * W11. Unit cost.
 *
 * Three comparisons, in descending order of how well they survive scrutiny: the entity
 * against its own plan, the entity against its own history, the entity against sector
 * peers.
 *
 * A fourth, cost per outcome across sectors, is deliberately absent. A ballet company and
 * a boxing regulator do not produce commensurable outputs. The API exposes no parameter
 * that produces that comparison, and putting the limitation on the screen rather than in a
 * footnote is what makes the rest of the analytics credible. Every judge has seen a
 * dashboard that compares incomparable things.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { num, rands, signedPercent } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { EmptyState, ErrorState, Loading, NotFoundState } from '../components/Shell';
import { IconArrowLeft, IconEyeOff, IconScale } from '../icons';
import './UnitCost.css';

export function UnitCost() {
  const { t } = useI18n();
  const L = useLabels();
  const { entityId } = useParams<{ entityId: string }>();
  const [selected, setSelected] = useState<string | null>(null);

  const entity = useAsync(() => api.entity(entityId!), [entityId]);
  const costs = useAsync(() => api.unitCost(entityId!), [entityId]);
  const peers = useAsync(() => api.peers(entityId!), [entityId]);

  if (entity.notFound) return <NotFoundState what={t('common.entity')} />;
  if (entity.error) return <ErrorState message={entity.error} onRetry={entity.reload} />;
  if (entity.loading) return <Loading what={t('uc.whatEntity')} />;

  const e = entity.data!;
  const rows = costs.data ?? [];
  const current = rows.find((r) => r.indicatorRef === selected) ?? rows[0] ?? null;

  return (
    <div className="stack">
      <p>
        <Link to={'/portfolio/entity/' + entityId} className="row">
          <IconArrowLeft size={16} /> {e.name}
        </Link>
      </p>

      <div className="section-head">
        <div>
          <h1>{t('uc.title')}</h1>
          <p className="muted">{e.name}</p>
        </div>
      </div>

      {costs.loading ? (
        <Loading what={t('uc.whatFigures')} />
      ) : costs.error ? (
        <ErrorState message={costs.error} onRetry={costs.reload} />
      ) : rows.length === 0 ? (
        <EmptyState>
          {t('uc.nothingToCompare')}
        </EmptyState>
      ) : (
        <>
          <div className="uc-picker">
            <label htmlFor="uc-indicator">{t('uc.indicator')}</label>
            <select
              id="uc-indicator"
              value={current?.indicatorRef ?? ''}
              onChange={(ev) => setSelected(ev.target.value)}
            >
              {rows.map((r) => (
                <option key={r.indicatorRef} value={r.indicatorRef}>
                  {r.indicatorRef} {r.indicator}
                </option>
              ))}
            </select>
          </div>

          {current ? (
            <>
              {/* Against its own plan. The strongest of the three, because both sides come
                  from this entity's own documents. */}
              <section className="card">
                <h2 className="uc-heading">{t('uc.againstPlan')}</h2>
                <dl className="uc-calc">
                  <div>
                    <dt>{t('uc.planned')}</dt>
                    <dd>
                      {rands(current.plannedSpend) ?? t('uc.noApportionedSpend')} {t('uc.over')}{' '}
                      {num(current.plannedVolume) ?? t('uc.noPlannedVolume')}{' '}
                      {current.unitOfMeasure ?? t('uc.units')}
                      <strong>
                        {' = '}
                        {rands(current.plannedUnitCost) ?? t('uc.notComputable')}
                      </strong>
                    </dd>
                  </div>
                  <div>
                    <dt>{t('uc.actual')}</dt>
                    <dd>
                      {rands(current.actualSpend) ?? t('uc.noReportedSpend')} {t('uc.over')}{' '}
                      {num(current.actualVolume) ?? t('uc.noReportedDelivery')}{' '}
                      {current.unitOfMeasure ?? t('uc.units')}
                      <strong>
                        {' = '}
                        {rands(current.actualUnitCost) ?? t('uc.notComputable')}
                      </strong>
                    </dd>
                  </div>
                  <div>
                    <dt>{t('reporter.variance')}</dt>
                    <dd
                      className={
                        current.variancePercent !== null && current.variancePercent > 0
                          ? 'uc-over'
                          : undefined
                      }
                    >
                      {signedPercent(current.variancePercent, 1) ?? t('uc.notComputable')}
                      {current.variancePercent !== null ? ' ' + t('uc.perUnit') : null}
                      <span className="small muted"> {current.verdict.toLowerCase().replace(/_/g, ' ')}</span>
                    </dd>
                  </div>
                </dl>
                <p className="small muted">
                  {t('uc.workingShown')}
                </p>
              </section>

              {/* Against its own history. */}
              <section className="card">
                <h2 className="uc-heading">{t('uc.againstHistory')}</h2>
                {current.history.length === 0 ? (
                  <EmptyState>
                    {t('uc.noPriorYear')}
                  </EmptyState>
                ) : (
                  <ul className="uc-history">
                    {current.history.map((h) => (
                      <li key={h.financialYear}>
                        <span className="uc-year">{h.financialYear}</span>
                        <span className="uc-figure">
                          {rands(h.unitCost) ?? t('uc.noFigure')}
                          {h.unitCost !== null && current.unitOfMeasure
                            ? ' ' + t('uc.per', singular(current.unitOfMeasure))
                            : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </>
      )}

      {/* Against sector peers. The sector bound is not a filter the user set. */}
      <section className="card">
        <h2 className="uc-heading">{t('uc.againstPeers')}</h2>
        {peers.loading ? (
          <Loading what={t('uc.whatPeers')} />
        ) : peers.notFound ? (
          <EmptyState>{t('uc.noPeerComparison')}</EmptyState>
        ) : peers.error ? (
          <ErrorState message={peers.error} onRetry={peers.reload} />
        ) : peers.data && peers.data.peerCount === 0 ? (
          <EmptyState>
            {t('uc.noPeerGroup', L.sector(peers.data.sector))}
          </EmptyState>
        ) : peers.data ? (
          <>
            <p className="small muted">
              {t(
                'uc.peerLine',
                L.sector(peers.data.sector),
                num(peers.data.peerCount) ?? '',
                peers.data.peerCount === 1 ? t('uc.entityWord') : t('uc.entitiesWord'),
              )}
            </p>
            <ul className="uc-peers">
              <li>
                <span>{t('uc.thisEntity')}</span>
                <strong>{rands(peers.data.entityMedianUnitCost) ?? t('uc.noReportedUnitCost')}</strong>
              </li>
              <li>
                <span>{t('uc.peerMedian')}</span>
                <strong>{rands(peers.data.peerMedianUnitCost) ?? t('uc.notComputable')}</strong>
              </li>
            </ul>
            <p className="small muted">{peers.data.note}</p>
          </>
        ) : null}
      </section>

      {/* The absence, stated on the screen. */}
      <section className="uc-absent">
        <p className="row">
          <IconEyeOff size={18} />
          <strong>{t('uc.absentHead')}</strong>
        </p>
        <p>
          {t(
            'uc.absentBody',
            peers.data ? L.sector(peers.data.sector).toLowerCase() : t('uc.ownSector'),
          )}
        </p>
        <p className="small muted">
          <IconScale size={14} /> {t('uc.absentNote')}
        </p>
      </section>
    </div>
  );
}

/** "items" reads better as "item" in "R2 673 per item". */
function singular(unit: string): string {
  return unit.endsWith('s') ? unit.slice(0, -1) : unit;
}
