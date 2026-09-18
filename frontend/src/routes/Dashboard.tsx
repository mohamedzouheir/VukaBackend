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
import { BAND_ORDER, bandColour, num, randsShort, date } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { I18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { PageHead } from '../components/AppShell';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import {
  IconAlert, IconCheckCircle, IconChevronRight, IconClock, IconHome, IconLandmark,
  IconTasks, IconUpload, IconCitation,
} from '../icons';
import './Dashboard.css';

export function Dashboard() {
  const { t } = useI18n();
  const L = useLabels();
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

  const period = useMemo(() => (periods.data ?? []).filter((p) => p.open).at(-1) ?? null, [periods.data]);

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
          title={greeting(me?.name ?? null, t)}
          subtitle={dsac ? t('dash.subDsac') : t('dash.subReporter')}
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
              <h2>{t('dash.riskDistribution')}</h2>
              <span className="spacer" />
              <Link to="/risk" className="row" style={{ gap: 4, fontSize: '0.875rem', fontWeight: 600 }}>
                {t('nav.risk')} <IconChevronRight size={15} />
              </Link>
            </div>

            {portfolio.loading ? (
              <Loading what={t('pf.what')} />
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
            <h2>{dsac ? t('dash.recentSubmissions') : t('dash.yourPeriods')}</h2>
            <span className="spacer" />
            {canReview(me?.role) ? (
              <Link to="/review" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                {t('dash.openQueue')}
              </Link>
            ) : null}
          </div>

          {subs.loading ? (
            <Loading what={t('dash.whatSubmissions')} />
          ) : subs.error ? (
            <ErrorState message={subs.error} onRetry={subs.reload} />
          ) : (subs.data ?? []).length === 0 ? (
            <EmptyState>
              {t('dash.nothingFiled')}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('entities.colEntity')}</th>
                    <th>{t('dash.colPeriod')}</th>
                    <th className="num">{t('dash.colReported')}</th>
                    <th>{t('tasks.colStatus')}</th>
                    <th>{t('dash.colSubmitted')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(subs.data ?? []).slice(0, 8).map((s) => (
                    <tr key={s.submissionId}>
                      <td>{s.entityName}</td>
                      <td className="muted">{s.periodLabel}</td>
                      <td className="num">
                        {t('dash.reportedOf', num(s.confirmedCount) ?? '', num(s.targetCount) ?? '')}
                      </td>
                      <td>
                        <StatusChip status={s.status} />
                      </td>
                      <td className="muted small">
                        {s.submittedAt ? date(s.submittedAt) : t('riskScreen.notSubmitted')}
                        {s.daysLate !== null && s.daysLate > 0 ? (
                          <span className="chip chip-warn" style={{ marginLeft: 6 }}>
                            {t('dash.daysLate', s.daysLate)}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <Link
                          to={canReview(me?.role) ? '/review/' + s.submissionId : '/entity/submission/' + s.submissionId + '/review'}
                        >
                          {t('common.open')}
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
          <h2 style={{ marginBottom: 'var(--space-3)' }}>{t('dash.quickActions')}</h2>
          <div className="quick">
            {me?.role === 'ENTITY_REPORTER' ? (
              <Link to="/entity" className="quick-item">
                <span className="quick-icon" style={{ background: 'var(--brand-wash)', color: 'var(--brand)' }}>
                  <IconUpload size={18} />
                </span>
                <span>
                  <strong>{t('dash.reportQuarter')}</strong>
                  <em>{t('dash.reportQuarterSub')}</em>
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
                  <strong>{t('dash.workQueue')}</strong>
                  <em>{t('dash.workQueueSub')}</em>
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
                  <strong>{t('dash.browseEntities')}</strong>
                  <em>{t('dash.browseEntitiesSub')}</em>
                </span>
                <IconChevronRight size={16} className="muted" />
              </Link>
            ) : null}
            <a href="/public" target="_blank" rel="noreferrer" className="quick-item">
              <span className="quick-icon" style={{ background: 'var(--ok-wash)', color: 'var(--ok)' }}>
                <IconCheckCircle size={18} />
              </span>
              <span>
                <strong>{t('dash.openCitizen')}</strong>
                <em>{t('dash.openCitizenSub')}</em>
              </span>
              <IconChevronRight size={16} className="muted" />
            </a>
          </div>
        </section>

        <section className="card">
          <div className="section-head">
            <h2>{t('dash.myTasks')}</h2>
            <span className="spacer" />
            <Link to="/tasks" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              {t('common.viewAll')}
            </Link>
          </div>
          {tasks.loading ? (
            <Loading what={t('tasks.what')} />
          ) : tasks.error ? (
            <ErrorState message={tasks.error} onRetry={tasks.reload} />
          ) : openTasks.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              {t('dash.nothingAssigned')}
            </p>
          ) : (
            <ul className="tasklist">
              {openTasks.slice(0, 5).map((row) => (
                <li key={row.id}>
                  <IconTasks size={16} className="muted" />
                  <span>
                    <strong>{row.title ?? t('tasks.untitled')}</strong>
                    {row.dueDate ? (
                      <em>{t('dash.dueOn', date(row.dueDate) ?? '')}</em>
                    ) : (
                      <em>{t('tasks.noDueDate')}</em>
                    )}
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
                {t('dash.dueOn', date(period.dueDate) ?? t('common.notSet'))}
                {period.daysRemaining !== null ? ', ' + L.daysRemaining(period.daysRemaining) : null}
              </span>
            </p>
            <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>
              {period.statutory ? t('dash.statutoryPfma') : t('dash.notStatutoryPfma')}
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
  const { t } = useI18n();
  if (loading) return <Loading what={t('pf.what')} />;
  return (
    <div className="tiles">
      <Tile icon={<IconLandmark size={22} />} value={num(counts.entities)} label={t('dash.fundedBodies')} sub={t('dash.fundedBodiesSub2')} />
      <Tile icon={<IconCheckCircle size={22} />} tone="ok" value={t('pf.countOf', num(counts.submitted) ?? '', num(counts.entities) ?? '')} label={t('dash.submitted')} sub={period ?? t('entities.noOpenPeriod')} />
      <Tile icon={<IconClock size={22} />} tone="warn" value={num(counts.outstanding)} label={t('dash.outstanding')} sub={t('dash.outstandingSub2')} />
      <Tile icon={<IconAlert size={22} />} tone="critical" value={num(counts.critical)} label={t('dash.critical')} sub={t('dash.criticalSub2')} />
      <Tile icon={<IconCitation size={22} />} tone="purple" value={randsShort(counts.allocated)} label={t('dash.allocated')} sub={t('dash.allocatedSub')} />
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
  const { t } = useI18n();
  const L = useLabels();
  if (loading) return <Loading what={t('dash.whatReporting')} />;
  const current = period ? subs.find((s) => s.periodId === period.periodId) : undefined;
  return (
    <div className="tiles">
      <Tile icon={<IconCitation size={22} />} value={current ? num(current.targetCount) : null} label={t('dash.targetsThisYear')} sub={t('dash.targetsThisYearSub')} />
      <Tile icon={<IconCheckCircle size={22} />} tone="ok" value={current ? num(current.confirmedCount) : null} label={t('dash.figuresConfirmed')} sub={t('dash.confirmedSub2')} />
      <Tile icon={<IconUpload size={22} />} tone="purple" value={current ? num(current.evidenceCount) : null} label={t('dash.evidenceAttached')} sub={t('dash.evidenceSub2')} />
      <Tile
        icon={<IconClock size={22} />}
        tone="warn"
        value={
          period?.daysRemaining !== null && period?.daysRemaining !== undefined
            ? L.daysRemaining(period.daysRemaining)
            : null
        }
        label={t('dash.deadline')}
        sub={period ? period.label : t('entities.noOpenPeriod')}
      />
    </div>
  );
}

/** Band distribution as proportional bars. Each carries its count and its word, not just colour. */
function BandBars({ rows }: { rows: PortfolioRow[] }) {
  const L = useLabels();
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
              {L.band(band)}
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
  const L = useLabels();
  const tone =
    status === 'APPROVED' ? 'chip-ok'
    : status === 'RETURNED' ? 'chip-danger'
    : status === 'DRAFT' ? 'chip-muted'
    : 'chip';
  return <span className={'chip ' + tone}>{L.status(status)}</span>;
}

function greeting(name: string | null, t: I18n['t']): string {
  const h = new Date().getHours();
  const part = h < 12 ? t('dash.morning') : h < 17 ? t('dash.afternoon') : t('dash.evening');
  return name ? t('dash.greetingNamed', part, name.split(/[\s.]/)[0]) : part;
}
