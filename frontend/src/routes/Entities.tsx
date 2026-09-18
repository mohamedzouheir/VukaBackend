/*
 * Entities, the register screen from docs/Front End designs/.
 *
 * The design's table carries an acronym column, a province column and a "Last Report" date. Two
 * of those do not exist: PublicEntity has a shortName but no acronym and no province, and there
 * is no province anywhere in the schema. Rather than invent them, this shows what the register
 * actually holds, which is the sector, the PFMA schedule consequence, the allocation and the
 * reporting state. The absent columns are named in the footnote so the gap is visible rather
 * than papered over.
 *
 * Sector filter and search are client side, over a list of twenty eight rows that arrives in one
 * request. Paging that would be ceremony.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import type { PortfolioRow, Sector } from '../lib/types';
import { num, rands, sectorLabel, statusLabel } from '../lib/format';
import { PageHead } from '../components/AppShell';
import { RiskBadge } from '../components/RiskBadge';
import { RiskPanel } from '../components/RiskPanel';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import { SearchField } from '../components/SearchField';
import { IconAlert, IconCheckCircle, IconEye, IconEyeOff, IconLandmark } from '../icons';
import './Entities.css';

const SECTORS: Sector[] = ['ARTS', 'HERITAGE', 'LIBRARIES', 'SPORT', 'LANGUAGE', 'OTHER'];

export function Entities() {
  const [params, setParams] = useSearchParams();
  const [sector, setSector] = useState<Sector | null>(null);
  const [explain, setExplain] = useState<PortfolioRow | null>(null);

  const query = params.get('q') ?? '';

  const portfolio = useAsync(() => api.portfolio(), []);
  const subs = useAsync(() => api.submissions(), []);
  const periods = useAsync(() => api.periods(), []);

  const period = useMemo(() => (periods.data ?? []).filter((p) => p.open).at(-1) ?? null, [periods.data]);

  const submissionByEntity = useMemo(() => {
    const map = new Map<string, { status: string; confirmed: number; targets: number }>();
    for (const s of subs.data ?? []) {
      if (period && s.periodId !== period.periodId) continue;
      map.set(s.entityId, { status: s.status, confirmed: s.confirmedCount, targets: s.targetCount });
    }
    return map;
  }, [subs.data, period]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (portfolio.data ?? [])
      .filter((r) => (sector ? r.sector === sector : true))
      .filter((r) =>
        q === ''
          ? true
          : r.name.toLowerCase().includes(q) || (r.shortName ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [portfolio.data, sector, query]);

  const counts = useMemo(() => {
    const all = portfolio.data ?? [];
    let submitted = 0;
    let atRisk = 0;
    let nothing = 0;
    for (const r of all) {
      const s = submissionByEntity.get(r.entityId);
      if (s && (s.status === 'SUBMITTED' || s.status === 'UNDER_REVIEW' || s.status === 'APPROVED')) submitted++;
      else nothing++;
      if (r.band === 'CRITICAL' || r.band === 'HIGH') atRisk++;
    }
    return { total: all.length, submitted, atRisk, nothing };
  }, [portfolio.data, submissionByEntity]);

  if (portfolio.error) return <ErrorState message={portfolio.error} onRetry={portfolio.reload} />;

  return (
    <div className="with-aside">
      <div>
        <PageHead
          icon={<IconLandmark size={26} />}
          title="Entities"
          subtitle="Every body funded by the Department, its allocation and its reporting state."
        />

        {portfolio.loading ? (
          <Loading what="the entity register" />
        ) : (
          <>
            <div className="tiles">
              <Tile icon={<IconLandmark size={22} />} value={num(counts.total)} label="Total entities" sub="Receiving an entity transfer" />
              <Tile icon={<IconCheckCircle size={22} />} tone="ok" value={num(counts.submitted)} label="Submitting reports" sub={period?.label ?? 'no open period'} />
              <Tile icon={<IconAlert size={22} />} tone="warn" value={num(counts.atRisk)} label="High or critical" sub="Need attention" />
              <Tile icon={<IconEyeOff size={22} />} tone="purple" value={num(counts.nothing)} label="Nothing filed" sub="This reporting period" />
            </div>

            <div className="card ent-filters">
              <div className="ent-search">
                <SearchField
                  label="Search entities by name"
                  placeholder="Search entities by name..."
                  value={query}
                  onChange={(v) => {
                    const next = new URLSearchParams(params);
                    if (v) next.set('q', v);
                    else next.delete('q');
                    setParams(next, { replace: true });
                  }}
                />
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className={'filter-pill' + (sector === null ? ' filter-on' : '')}
                  aria-pressed={sector === null}
                  onClick={() => setSector(null)}
                >
                  All
                </button>
                {SECTORS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={'filter-pill' + (sector === s ? ' filter-on' : '')}
                    aria-pressed={sector === s}
                    onClick={() => setSector(s)}
                  >
                    {sectorLabel(s)}
                  </button>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 0, marginTop: 'var(--space-4)' }}>
              <div className="section-head" style={{ padding: 'var(--space-4) var(--space-5) 0' }}>
                <h2>Entities ({num(rows.length)})</h2>
              </div>

              {rows.length === 0 ? (
                <div style={{ padding: 'var(--space-5)' }}>
                  <EmptyState>
                    No entity matches that filter. That is a filter with no matches rather than an
                    empty register.
                  </EmptyState>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Entity</th>
                        <th>Sector</th>
                        <th className="num">Allocation</th>
                        <th>Risk</th>
                        <th>This period</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const s = submissionByEntity.get(r.entityId);
                        return (
                          <tr key={r.entityId}>
                            <td>
                              <Link to={'/portfolio/entity/' + r.entityId} className="ent-name">
                                {r.name}
                              </Link>
                              {r.shortName && r.shortName !== r.name ? (
                                <span className="muted small"> {r.shortName}</span>
                              ) : null}
                            </td>
                            <td>
                              <span className="chip chip-muted">{sectorLabel(String(r.sector))}</span>
                            </td>
                            <td className="num">
                              {rands(r.totalAllocation) ?? <em className="muted">no row</em>}
                            </td>
                            <td>
                              <RiskBadge
                                size="sm"
                                score={r.score}
                                band={r.band}
                                onExplain={() => setExplain(r)}
                              />
                            </td>
                            <td>
                              {s ? (
                                <span className="small">
                                  {statusLabel(s.status)}
                                  <span className="muted">
                                    {' '}
                                    {num(s.confirmed)} of {num(s.targets)}
                                  </span>
                                </span>
                              ) : (
                                <span className="chip chip-warn">nothing filed</span>
                              )}
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
              The design for this screen also carries an acronym, a province and a registration
              number. None of the three exists in the schema, so they are absent here rather than
              filled in. Allocations are the published medium term estimates from Estimates of
              National Expenditure 2026, Vote 37, Table 37.3.
            </p>
          </>
        )}
      </div>

      <aside className="aside">
        <section className="card">
          <h2 style={{ marginBottom: 'var(--space-3)' }}>By sector</h2>
          <SectorBars rows={portfolio.data ?? []} />
        </section>

        <section className="card card-sunk">
          <p className="row" style={{ margin: 0, gap: 8 }}>
            <IconEye size={18} />
            <strong>Publication is a departmental decision</strong>
          </p>
          <p className="small muted" style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>
            Nothing reaches the citizen view unless an administrator switches it on, and every
            seeded entity ships with it off. The switch is on the Settings screen.
          </p>
        </section>
      </aside>

      {explain ? (
        <RiskPanel risk={explain} entityName={explain.name} onClose={() => setExplain(null)} />
      ) : null}
    </div>
  );
}

/** Entity counts per sector. A count, not a performance rate, because a rate has no source. */
function SectorBars({ rows }: { rows: PortfolioRow[] }) {
  const counts = SECTORS.map((s) => ({ sector: s, n: rows.filter((r) => r.sector === s).length }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);

  const max = Math.max(...counts.map((c) => c.n), 1);

  if (counts.length === 0) return <p className="muted small">No entities registered.</p>;

  return (
    <div className="stack-tight">
      {counts.map((c) => (
        <div key={c.sector} className="sector-row">
          <span className="sector-name">{sectorLabel(c.sector)}</span>
          <span className="sector-count">{c.n}</span>
          <span className="sector-track" aria-hidden="true">
            <span style={{ width: (c.n / max) * 100 + '%' }} />
          </span>
        </div>
      ))}
    </div>
  );
}
