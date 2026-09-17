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
import { auditOutcomeLabel, num, rands, sectorLabel, statusLabel } from '../lib/format';
import { ChainStrip } from '../components/ChainStrip';
import { RiskBadge, RiskBadgeError } from '../components/RiskBadge';
import { RiskPanel } from '../components/RiskPanel';
import { EmptyState, ErrorState, Loading, NotFoundState, SectorChip } from '../components/Shell';
import { IconAlert, IconArrowLeft, IconGauge, IconScale } from '../icons';
import './EntityDrilldown.css';

export function EntityDrilldown() {
  const { entityId } = useParams<{ entityId: string }>();
  const { me } = useAuth();
  const [explain, setExplain] = useState(false);

  const entity = useAsync(() => api.entity(entityId!), [entityId]);
  const chain = useAsync(() => api.chain(entityId!), [entityId]);

  if (entity.notFound) return <NotFoundState what="entity" />;
  if (entity.error) return <ErrorState message={entity.error} onRetry={entity.reload} />;
  if (entity.loading) return <Loading what="this entity" />;

  const e = entity.data!;
  const reported = e.targets.filter((t) => t.status !== 'NOT_STARTED');

  return (
    <div className="stack">
      <p>
        <Link to="/portfolio" className="row">
          <IconArrowLeft size={16} /> portfolio
        </Link>
      </p>

      <div className="section-head">
        <div>
          <h1>{e.name}</h1>
          <p className="row small muted">
            <SectorChip sector={String(e.sector)} />
            <span>{sectorLabel(String(e.sector))} sector</span>
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
        <h2 className="dd-heading">The chain</h2>
        <ChainStrip chain={chain.data} loading={chain.loading} error={chain.error} />
      </section>

      {/* Trajectory. Hand drawn bars rather than a charting library, because a chart
          library is a hundred kilobytes for four numbers. */}
      <section className="card">
        <h2 className="dd-heading">Trajectory</h2>
        <p className="small muted">Allocation by financial year, in rands.</p>
        {chain.loading ? (
          <Loading what="the allocation history" />
        ) : chain.error ? (
          <ErrorState message={chain.error} onRetry={chain.reload} />
        ) : (chain.data?.allocations ?? []).length === 0 ? (
          <EmptyState>
            No allocation rows for this entity. That is an absent figure rather than a zero
            allocation, and it is left absent rather than filled in.
          </EmptyState>
        ) : (
          <Trajectory rows={chain.data!.allocations} />
        )}
      </section>

      {/* Audit history. */}
      <section className="card">
        <h2 className="dd-heading">Audit history</h2>
        {e.auditFindings.length === 0 ? (
          <EmptyState>
            No published audit outcome could be reached for this entity. The risk engine treats an
            absent row as absence of evidence rather than as a clean audit, and the row stays empty
            rather than being filled from an assumption.
          </EmptyState>
        ) : (
          <ul className="dd-findings">
            {e.auditFindings.map((f, i) => (
              <li key={i}>
                <span className="dd-fy">{f.financialYear || 'year not recorded'}</span>
                <span className="dd-outcome">{auditOutcomeLabel(f.outcome)}</span>
                {f.repeatFinding ? <span className="chip chip-warn">repeat finding</span> : null}
                <span className="dd-desc">{f.description ?? 'No description on the record.'}</span>
                <span className="small muted">{statusLabel(f.resolutionStatus)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Outstanding. */}
      <section className="card">
        <h2 className="dd-heading">Outstanding</h2>
        {chain.loading ? (
          <Loading what="what is outstanding" />
        ) : (
          <ul className="dd-outstanding">
            <li>
              <IconAlert size={16} />
              <span>
                {chain.data?.targetsWithNoResult === null || chain.data?.targetsWithNoResult === undefined
                  ? 'The count of targets with no result could not be read.'
                  : num(chain.data.targetsWithNoResult) +
                    (chain.data.targetsWithNoResult === 1
                      ? ' target with no result'
                      : ' targets with no result') +
                    ' for the open period'}
              </span>
            </li>
            <li>
              <IconAlert size={16} />
              <span>
                {chain.data?.figuresWithNoEvidence === null || chain.data?.figuresWithNoEvidence === undefined
                  ? 'The count of figures with no evidence could not be read.'
                  : num(chain.data.figuresWithNoEvidence) +
                    (chain.data.figuresWithNoEvidence === 1
                      ? ' reported figure with no evidence attached, which the Department sees as unverifiable'
                      : ' reported figures with no evidence attached, which the Department sees as unverifiable')}
              </span>
            </li>
          </ul>
        )}

        <div className="row dd-actions">
          <button type="button" onClick={() => setExplain(true)}>
            <IconGauge size={16} /> Explain the score
          </button>
          <Link className="btn" to={'/portfolio/entity/' + entityId + '/unit-cost'}>
            <IconScale size={16} /> Unit cost
          </Link>
        </div>
      </section>

      {/* Targets, with what has been reported against each. */}
      <section className="card">
        <div className="section-head">
          <h2 className="dd-heading">Targets for the year</h2>
          <span className="spacer" />
          <p className="small muted">
            {num(reported.length)} of {num(e.targets.length)} have a result on record
          </p>
        </div>

        {e.targets.length === 0 ? (
          <EmptyState>
            No targets registered for the current financial year. An administrator loads these from
            the entity's tabled Annual Performance Plan.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Indicator</th>
                  <th className="num">Annual target</th>
                  <th className="num">Delivered</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {e.targets.map((t) => (
                  <tr key={t.targetId}>
                    <td>
                      <span className="mono ind-ref">{t.indicatorRef}</span> {t.indicator}
                      {t.unitOfMeasure ? (
                        <span className="small muted"> ({t.unitOfMeasure})</span>
                      ) : null}
                    </td>
                    <td className="num">{num(t.annualTarget) ?? 'not set'}</td>
                    <td className="num">
                      {/* Never a zero for an absent result. */}
                      {t.status === 'NOT_STARTED' ? (
                        <em className="muted">no result reported</em>
                      ) : (
                        num(t.delivered)
                      )}
                    </td>
                    <td>{statusLabel(t.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="small muted">
        Total allocation on record for the current financial year:{' '}
        {rands(e.totalAllocation) ?? 'no allocation row'}
        {chain.data?.allocatedCitation ? '. ' + chain.data.allocatedCitation : null}
        {me?.role === 'DSAC_EXECUTIVE'
          ? '. This view is read only by design: an executive role cannot touch the data at all.'
          : null}
      </p>

      {explain ? (
        <RiskPanel
          risk={e.risk}
          entityName={e.name}
          error={e.risk ? null : 'The stored score could not be read.'}
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
