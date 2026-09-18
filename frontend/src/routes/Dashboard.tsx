/*
 * Dashboard, the landing screen for every signed-in role.
 *
 * Modelled on the overview screens in docs/Front End designs/: a greeting, a row of stat tiles,
 * the substance, and a right rail of quick actions and recent activity.
 *
 * What it does not copy from those screens is the charting. The designs carry a "Progress Over
 * Time" line from January to December and a "Performance by Sector" bar row, and nothing in the
 * schema records a figure per month or a sector rate. Drawing either would mean inventing the
 * numbers, in a product whose entire argument is that a figure carries the cell it came from.
 * So the same space is given to the risk band distribution, which is real, stored, and explains
 * itself on click.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth, canReview, isDsac } from '../lib/auth';
import type { PortfolioRow } from '../lib/types';
import { BAND_ORDER, bandColour, bandWord, num, randsShort, date, daysRemainingText, reviewPeriod } from '../lib/format';
import { PageHead } from '../components/AppShell';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import {
  IconAlert, IconCheckCircle, IconChevronRight, IconClock, IconHome, IconLandmark,
  IconTasks, IconUpload, IconCitation,
} from '../icons';
import './Dashboard.css';

export function Dashboard() {
  const { me } = useAuth();
  const dsac = isDsac(me?.role);

  const portfolio = useAsync(() => api.portfolio(), [], dsac);
  const periods = useAsync(() => api.periods(), []);
  const subs = useAsync(
    () => (dsac ? api.submissions() : api.submissions({ entityId: me!.entityId! })),
    [dsac, me?.entityId],
    dsac || Boolean(me?.entityId),
  );
  const tasks = useAsync(() => api.myTasks(), []);

  // A reporter works on the open quarter, the Department on the one that has fallen due.
  const period = useMemo(
    () => (dsac ? reviewPeriod(periods.data) : (periods.data ?? []).filter((p) => p.open).at(-1) ?? null),
    [dsac, periods.data],
  );

  const counts = useMemo(() => {
    const rows = portfolio.data ?? [];
    const relevant = period ? (subs.data ?? []).filter((s) => s.periodId === period.periodId) : [];
    const submitted = relevant.filter(
      (s) => s.status === 'SUBMITTED' || s.status === 'UNDER_REVIEW' || s.status === 'APPROVED',
    );
    const withAllocation = rows.filter((r) => r.totalAllocation !== null);
    return {
      entities: rows.length,
      allocated: withAllocation.length ? withAllocation.reduce((n, r) => n + (r.totalAllocation ?? 0), 0) : null,
      submitted: submitted.length,
      outstanding: rows.length - submitted.length,
      critical: rows.filter((r) => r.band === 'CRITICAL').length,
      targets: relevant.reduce((n, s) => n + s.targetCount, 0),
      reported: relevant.reduce((n, s) => n + s.confirmedCount, 0),
    };
  }, [portfolio.data, subs.data, period]);

  const openTasks = (tasks.data ?? []).filter((t) => t.status !== 'DONE');

  return (
    <div className="with-aside">
      <div>
        <PageHead
          icon={<IconHome size={26} />}
          title={greeting(me?.name ?? null)}
          subtitle={
            dsac
              ? 'Where the portfolio stands this quarter, and what is waiting on the Department.'
              : 'Where your reporting stands this quarter, and what is waiting on you.'
          }
        />

        {dsac ? (
          <DsacTiles counts={counts} period={period?.label ?? null} loading={portfolio.loading} />
        ) : (
          <ReporterTiles period={period} subs={subs.data ?? []} loading={subs.loading} />
        )}

        {/* Risk band distribution. Real, stored, and the same signals the panel explains. */}
        {dsac ? (
          <section className="card dash-block">
            <div className="section-head">
              <h2>Risk distribution</h2>
              <span className="spacer" />
              <Link to="/risk" className="row" style={{ gap: 4, fontSize: '0.875rem', fontWeight: 600 }}>
                Risk &amp; Alerts <IconChevronRight size={15} />
              </Link>
            </div>

            {portfolio.loading ? (
              <Loading what="the portfolio" />
            ) : portfolio.error ? (
              <ErrorState message={portfolio.error} onRetry={portfolio.reload} />
            ) : (
              <BandBars rows={portfolio.data ?? []} />
            )}
          </section>
        ) : null}

        {/* Recent submissions, which is the closest real thing to the designs' activity table. */}
        <section className="card dash-block">
          <div className="section-head">
            <h2>{dsac ? 'Recent submissions' : 'Your reporting periods'}</h2>
            <span className="spacer" />
            {canReview(me?.role) ? (
              <Link to="/review" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                Open the review queue
              </Link>
            ) : null}
          </div>

          {subs.loading ? (
            <Loading what="submissions" />
          ) : subs.error ? (
            <ErrorState message={subs.error} onRetry={subs.reload} />
          ) : (subs.data ?? []).length === 0 ? (
            <EmptyState>
              Nothing has been filed yet. That is an empty register rather than a portfolio with
              nothing outstanding.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  {/* nowrap: beside the right rail at laptop widths the headers, the period and
                      the link were breaking mid-word ("PERI OD", "Op en"). A reporter's table
                      drops the entity column, which only ever repeats their own name. */}
                  <tr className="nowrap">
                    {dsac ? <th>Entity</th> : null}
                    <th>Period</th>
                    <th className="num">Reported</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(subs.data ?? []).slice(0, 8).map((s) => (
                    <tr key={s.submissionId}>
                      {dsac ? <td>{s.entityName}</td> : null}
                      <td className="muted nowrap">{s.periodLabel}</td>
                      <td className="num">
                        {num(s.confirmedCount)} of {num(s.targetCount)}
                      </td>
                      <td>
                        <StatusChip status={s.status} />
                      </td>
                      <td className="muted small">
                        {s.submittedAt ? date(s.submittedAt) : 'not submitted'}
                        {s.daysLate !== null && s.daysLate > 0 ? (
                          <span className="chip chip-warn" style={{ marginLeft: 6 }}>
                            {s.daysLate}d late
                          </span>
                        ) : null}
                      </td>
                      <td className="nowrap">
                        <Link
                          to={canReview(me?.role) ? '/review/' + s.submissionId : '/entity/submission/' + s.submissionId + '/review'}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* ---------------- right rail ---------------- */}
      <aside className="aside">
        <section className="card">
          <h2 style={{ marginBottom: 'var(--space-3)' }}>Quick actions</h2>
          <div className="quick">
            {me?.role === 'ENTITY_REPORTER' ? (
              <Link to="/entity" className="quick-item">
                <span className="quick-icon" style={{ background: 'var(--brand-wash)', color: 'var(--brand)' }}>
                  <IconUpload size={18} />
                </span>
                <span>
                  <strong>Report this quarter</strong>
                  <em>Download the template, upload, confirm</em>
                </span>
                <IconChevronRight size={16} className="muted" />
              </Link>
            ) : null}
            {canReview(me?.role) ? (
              <Link to="/review" className="quick-item">
                <span className="quick-icon" style={{ background: 'var(--purple-wash)', color: 'var(--purple)' }}>
                  <IconCitation size={18} />
                </span>
                <span>
                  <strong>Work the review queue</strong>
                  <em>Ranked by risk, not by date received</em>
                </span>
                <IconChevronRight size={16} className="muted" />
              </Link>
            ) : null}
            {dsac ? (
              <Link to="/entities" className="quick-item">
                <span className="quick-icon" style={{ background: 'var(--teal-wash)', color: 'var(--teal)' }}>
                  <IconLandmark size={18} />
                </span>
                <span>
                  <strong>Browse entities</strong>
                  <em>Every funded body and what it was allocated</em>
                </span>
                <IconChevronRight size={16} className="muted" />
              </Link>
            ) : null}
            <a href="/public" target="_blank" rel="noreferrer" className="quick-item">
              <span className="quick-icon" style={{ background: 'var(--ok-wash)', color: 'var(--ok)' }}>
                <IconCheckCircle size={18} />
              </span>
              <span>
                <strong>Open the citizen view</strong>
                <em>What the public can see, no login</em>
              </span>
              <IconChevronRight size={16} className="muted" />
            </a>
          </div>
        </section>

        <section className="card">
          <div className="section-head">
            <h2>My tasks</h2>
            <span className="spacer" />
            <Link to="/tasks" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              View all
            </Link>
          </div>
          {tasks.loading ? (
            <Loading what="your tasks" />
          ) : tasks.error ? (
            <ErrorState message={tasks.error} onRetry={tasks.reload} />
          ) : openTasks.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              Nothing assigned to you.
            </p>
          ) : (
            <ul className="tasklist">
              {openTasks.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <IconTasks size={16} className="muted" />
                  <span>
                    <strong>{t.title ?? 'Untitled task'}</strong>
                    {t.dueDate ? <em>Due {date(t.dueDate)}</em> : <em>No due date</em>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {period ? (
          <section className="card card-sunk">
            <h4 style={{ marginBottom: 6 }}>{period.label}</h4>
            <p className="row small" style={{ margin: 0, gap: 6 }}>
              <IconClock size={15} />
              <span>
                Due {date(period.dueDate) ?? 'not set'}
                {period.daysRemaining !== null ? ', ' + daysRemainingText(period.daysRemaining) : null}
              </span>
            </p>
            <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>
              {period.statutory
                ? 'A statutory date under the PFMA.'
                : 'Not a statutory date. It rests on a departmental instruction rather than on a regulation.'}
            </p>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DsacTiles({
  counts,
  period,
  loading,
}: {
  counts: { entities: number; allocated: number | null; submitted: number; outstanding: number; critical: number; targets: number; reported: number };
  period: string | null;
  loading: boolean;
}) {
  if (loading) return <Loading what="the portfolio" />;
  return (
    <div className="tiles">
      <Tile icon={<IconLandmark size={22} />} value={num(counts.entities)} label="Funded bodies" sub="Receiving an entity transfer" />
      <Tile icon={<IconCheckCircle size={22} />} tone="ok" value={num(counts.submitted) + ' of ' + num(counts.entities)} label="Submitted" sub={period ?? 'no open period'} />
      <Tile icon={<IconClock size={22} />} tone="warn" value={num(counts.outstanding)} label="Outstanding" sub="Nothing filed this period" />
      <Tile icon={<IconAlert size={22} />} tone="critical" value={num(counts.critical)} label="Critical entities" sub="Score of 70 or above" />
      <Tile icon={<IconCitation size={22} />} tone="purple" value={randsShort(counts.allocated)} label="Allocated this year" sub="Vote 37, Table 37.3" />
    </div>
  );
}

function ReporterTiles({
  period,
  subs,
  loading,
}: {
  period: { periodId: string; label: string; dueDate: string | null; daysRemaining: number | null } | null;
  subs: { periodId: string; targetCount: number; confirmedCount: number; evidenceCount: number }[];
  loading: boolean;
}) {
  if (loading) return <Loading what="your reporting" />;
  const current = period ? subs.find((s) => s.periodId === period.periodId) : undefined;
  return (
    <div className="tiles">
      <Tile icon={<IconCitation size={22} />} value={current ? num(current.targetCount) : null} label="Targets this year" sub="From your tabled plan" />
      <Tile icon={<IconCheckCircle size={22} />} tone="ok" value={current ? num(current.confirmedCount) : null} label="Figures confirmed" sub="In your name, not editable" />
      <Tile icon={<IconUpload size={22} />} tone="purple" value={current ? num(current.evidenceCount) : null} label="Evidence attached" sub="A figure with none is unverifiable" />
      <Tile
        icon={<IconClock size={22} />}
        tone="warn"
        value={period?.daysRemaining !== null && period?.daysRemaining !== undefined ? daysRemainingText(period.daysRemaining) : null}
        label="Deadline"
        sub={period ? period.label : 'no open period'}
      />
    </div>
  );
}

/** Band distribution as proportional bars. Each carries its count and its word, not just colour. */
function BandBars({ rows }: { rows: PortfolioRow[] }) {
  const total = rows.length || 1;
  return (
    <div className="bands">
      {BAND_ORDER.map((band) => {
        const n = rows.filter((r) => r.band === band).length;
        if (n === 0) return null;
        return (
          <div className="band-row" key={band}>
            <span className="band-label">
              <span className="risk-swatch" style={{ background: bandColour(band) }} aria-hidden="true" />
              {bandWord(band)}
            </span>
            <span className="band-track" aria-hidden="true">
              <span style={{ width: (n / total) * 100 + '%', background: bandColour(band) }} />
            </span>
            <span className="band-count">
              {num(n)} <span className="muted small">({Math.round((n / total) * 100)}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const tone =
    status === 'APPROVED' ? 'chip-ok'
    : status === 'RETURNED' ? 'chip-danger'
    : status === 'DRAFT' ? 'chip-muted'
    : 'chip';
  const label =
    status === 'NOT_STARTED' ? 'No result reported'
    : status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
  return <span className={'chip ' + tone}>{label}</span>;
}

function greeting(name: string | null): string {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  if (!name) return part;
  // "N. Mabaso" greeted as "N" read as a glitch. Where the first word is only an initial, use
  // the whole name as it was given.
  const first = name.trim().split(/\s+/)[0];
  return part + ', ' + (/^[A-Za-z]\.?$/.test(first) ? name.trim() : first);
}
