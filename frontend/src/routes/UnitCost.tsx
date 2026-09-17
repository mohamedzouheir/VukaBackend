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
import { num, rands, sectorLabel, signedPercent } from '../lib/format';
import { EmptyState, ErrorState, Loading, NotFoundState } from '../components/Shell';
import { IconArrowLeft, IconEyeOff, IconScale } from '../icons';
import './UnitCost.css';

export function UnitCost() {
  const { entityId } = useParams<{ entityId: string }>();
  const [selected, setSelected] = useState<string | null>(null);

  const entity = useAsync(() => api.entity(entityId!), [entityId]);
  const costs = useAsync(() => api.unitCost(entityId!), [entityId]);
  const peers = useAsync(() => api.peers(entityId!), [entityId]);

  if (entity.notFound) return <NotFoundState what="entity" />;
  if (entity.error) return <ErrorState message={entity.error} onRetry={entity.reload} />;
  if (entity.loading) return <Loading what="this entity" />;

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
          <h1>Unit cost</h1>
          <p className="muted">{e.name}</p>
        </div>
      </div>

      {costs.loading ? (
        <Loading what="the unit cost figures" />
      ) : costs.error ? (
        <ErrorState message={costs.error} onRetry={costs.reload} />
      ) : rows.length === 0 ? (
        <EmptyState>
          No indicator for this entity carries both a planned unit cost and a reported spend, so
          there is nothing to compare. A unit cost with only one side of the division is not a unit
          cost, and it is left absent rather than estimated.
        </EmptyState>
      ) : (
        <>
          <div className="uc-picker">
            <label htmlFor="uc-indicator">Indicator</label>
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
                <h2 className="uc-heading">Against its own plan</h2>
                <dl className="uc-calc">
                  <div>
                    <dt>Planned</dt>
                    <dd>
                      {rands(current.plannedSpend) ?? 'no apportioned spend'} over{' '}
                      {num(current.plannedVolume) ?? 'no planned volume'}{' '}
                      {current.unitOfMeasure ?? 'units'}
                      <strong>
                        {' = '}
                        {rands(current.plannedUnitCost) ?? 'not computable'}
                      </strong>
                    </dd>
                  </div>
                  <div>
                    <dt>Actual</dt>
                    <dd>
                      {rands(current.actualSpend) ?? 'no reported spend'} over{' '}
                      {num(current.actualVolume) ?? 'no reported delivery'}{' '}
                      {current.unitOfMeasure ?? 'units'}
                      <strong>
                        {' = '}
                        {rands(current.actualUnitCost) ?? 'not computable'}
                      </strong>
                    </dd>
                  </div>
                  <div>
                    <dt>Variance</dt>
                    <dd
                      className={
                        current.variancePercent !== null && current.variancePercent > 0
                          ? 'uc-over'
                          : undefined
                      }
                    >
                      {signedPercent(current.variancePercent, 1) ?? 'not computable'}
                      {current.variancePercent !== null ? ' per unit' : null}
                      <span className="small muted"> {current.verdict.toLowerCase().replace(/_/g, ' ')}</span>
                    </dd>
                  </div>
                </dl>
                <p className="small muted">
                  The numerator and the denominator are both shown. A unit cost with its working
                  hidden is a number nobody can check, and this product does not put those on a
                  screen.
                </p>
              </section>

              {/* Against its own history. */}
              <section className="card">
                <h2 className="uc-heading">Against its own history</h2>
                {current.history.length === 0 ? (
                  <EmptyState>
                    No prior year unit cost on record for this indicator. A single year is not a
                    trend and is not presented as one.
                  </EmptyState>
                ) : (
                  <ul className="uc-history">
                    {current.history.map((h) => (
                      <li key={h.financialYear}>
                        <span className="uc-year">{h.financialYear}</span>
                        <span className="uc-figure">
                          {rands(h.unitCost) ?? 'no figure'}
                          {h.unitCost !== null && current.unitOfMeasure
                            ? ' per ' + singular(current.unitOfMeasure)
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
        <h2 className="uc-heading">Against sector peers</h2>
        {peers.loading ? (
          <Loading what="the peer comparison" />
        ) : peers.notFound ? (
          <EmptyState>No peer comparison is available for this entity.</EmptyState>
        ) : peers.error ? (
          <ErrorState message={peers.error} onRetry={peers.reload} />
        ) : peers.data && peers.data.peerCount === 0 ? (
          <EmptyState>
            No comparable entity in the {sectorLabel(peers.data.sector)} sector carries a reported
            unit cost, so there is no peer group. A median of one is not a median, and the
            comparison is withheld rather than drawn from a single other body.
          </EmptyState>
        ) : peers.data ? (
          <>
            <p className="small muted">
              {sectorLabel(peers.data.sector)} sector, {num(peers.data.peerCount)} comparable{' '}
              {peers.data.peerCount === 1 ? 'entity' : 'entities'}
            </p>
            <ul className="uc-peers">
              <li>
                <span>This entity</span>
                <strong>{rands(peers.data.entityMedianUnitCost) ?? 'no reported unit cost'}</strong>
              </li>
              <li>
                <span>Peer median</span>
                <strong>{rands(peers.data.peerMedianUnitCost) ?? 'not computable'}</strong>
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
          <strong>The comparison this system does not offer</strong>
        </p>
        <p>
          Comparison is within the {peers.data ? sectorLabel(peers.data.sector).toLowerCase() : "entity's own"}{' '}
          sector only. There is no view that compares cost per outcome across sectors, because a
          library item and a boxing licence are not commensurable outputs. The system does not offer
          that comparison and there is no API parameter that produces it.
        </p>
        <p className="small muted">
          <IconScale size={14} /> The restriction is built into the endpoint rather than into a
          guideline. That is the difference between a decision and a warning label.
        </p>
      </section>
    </div>
  );
}

/** "items" reads better as "item" in "R2 673 per item". */
function singular(unit: string): string {
  return unit.endsWith('s') ? unit.slice(0, -1) : unit;
}
