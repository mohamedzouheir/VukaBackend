/*
 * W9. Portfolio, the executive's home.
 *
 * Laid out on the executive overview design: a greeting and a period, four counts, three
 * pictures, the entities in risk order, and a right rail of what needs attention and what is
 * due. Journey J4 still sets the order: a Director-General wants to know how many, then which
 * ones, then why, so the counts come first and every row opens the figures behind its score.
 *
 * Every panel of that design is here except two, and those two are left out on purpose. The
 * design charts job creation by year and a staff demographics split. Nothing in the reporting
 * templates records either, so drawing them would mean inventing figures on the screen most
 * likely to be quoted in a committee. Their places are taken by the allocation by year, which is
 * published in the Estimates of National Expenditure, and by the Auditor-General's outcomes.
 * The same goes for the design's monthly delivery line: nothing records a figure per month, so the
 * line here is per audited year and breaks where a year has not been audited.
 *
 * The design's publish toggle on the citizen card is also left out. Publication is the
 * administrator's decision, gated behind the departmental flag, and the executive's role is read
 * only. The card links to what citizens see instead of offering a switch that would be refused.
 *
 * The line that gets quoted survives as an insight: not "three entities are critical" but
 * "R358.6 million sits with entities in the critical band". Risk expressed in rands is the
 * sentence that can be taken into a committee meeting.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../lib/auth';
import type { AnalyticsView, PeriodView, PortfolioRow, SubmissionRow } from '../lib/types';
import { BAND_ORDER, bandColour, date, num, percent, randsShort, reviewPeriod } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { I18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { RiskPanel } from '../components/RiskPanel';
import { RiskBadge } from '../components/RiskBadge';
import { ErrorState, Loading, Tile } from '../components/Shell';
import { openKarabo } from '../components/AskKarabo';
import { Columns, Line, Ring, VIZ } from '../components/Charts';
import type { Datum, Slice } from '../components/Charts';
import {
  IconAlert, IconCalendar, IconChart, IconCheckCircle, IconChevronRight, IconClock, IconExternal,
  IconHelp, IconLandmark, IconScale, IconSun, IconTrend, IconEye,
} from '../icons';
import './Dashboard.css';
import './Portfolio.css';

/** A submission in one of these states has been filed, whatever happened to it afterwards. */
const FILED = new Set(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'RETURNED']);

export function Portfolio() {
  const { me } = useAuth();
  const { t } = useI18n();
  const periods = useAsync(() => api.periods(), []);
  const [picked, setPicked] = useState<string | null>(null);

  const defaultPeriod = useMemo(() => reviewPeriod(periods.data), [periods.data]);
  const periodId = picked ?? defaultPeriod?.periodId ?? null;
  const period = (periods.data ?? []).find((p) => p.periodId === periodId) ?? null;

  // Scored for the chosen period. Waits for the periods so the first request is the right one
  // rather than a default that is thrown away a moment later.
  const portfolio = useAsync(
    () => api.portfolio(periodId ?? undefined),
    [periodId, periods.loading],
    !periods.loading,
  );
  const subs = useAsync(() => api.submissions(), []);
  const analytics = useAsync(() => api.analytics(), []);
  const [explain, setExplain] = useState<PortfolioRow | null>(null);

  // Only periods that have started can be reported on, so only those are offered.
  const choosable = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (periods.data ?? []).filter((p) => !p.periodStart || p.periodStart <= today);
  }, [periods.data]);

  if (portfolio.error) return <ErrorState message={portfolio.error} onRetry={portfolio.reload} />;
  // Keeps the last period on screen while another loads, rather than blanking the page.
  if (!portfolio.data && (portfolio.loading || periods.loading)) return <Loading what={t('pf.what')} />;

  const rows = portfolio.data ?? [];

  return (
    <div className="with-aside pf">
      <div className="pf-main">
        <header className="pf-head">
          <span className="pf-sun"><IconSun size={30} /></span>
          <div>
            <h1>{greeting(me?.name ?? null, t)}</h1>
            <p>{t('pf.greetingSub')}</p>
          </div>
          <span className="spacer" />
          <div className="pf-head-tools">
            <span className="pf-today">
              <IconCalendar size={17} />
              {new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())}
            </span>
            <label className="visually-hidden" htmlFor="pf-period">{t('pf.periodPick')}</label>
            <select
              id="pf-period"
              className="pf-period"
              value={periodId ?? ''}
              onChange={(e) => setPicked(e.target.value || null)}
            >
              {choosable.map((p) => (
                <option key={p.periodId} value={p.periodId}>{p.label}</option>
              ))}
            </select>
          </div>
        </header>

        {/* The two ways off this screen an executive actually uses: ask it something, or go to
            the charts and the export. A question arrives before the reading does. */}
        <div className="po-tools">
          <button type="button" onClick={openKarabo}>
            <IconHelp size={16} /> {t('karabo.ask')}
          </button>
          <Link className="btn" to="/analytics">
            <IconChart size={16} /> {t('pf.toAnalytics')}
          </Link>
        </div>

        <Counts rows={rows} subs={subs.data} period={period} periods={periods.data ?? []} />

        <div className="pf-charts">
          <RiskRing rows={rows} />
          <AnalyticsCharts analytics={analytics} />
        </div>

        <EntityTable rows={rows} subs={subs.data} period={period} onExplain={setExplain} />

        {subs.error ? (
          <ErrorState message={t('pf.subsUnreadable') + subs.error} onRetry={subs.reload} />
        ) : null}

        <Insights rows={rows} analytics={analytics.data} />

        <p className="small muted">
          Allocations are the published medium term estimates from Estimates of National Expenditure
          2026, Vote 37, Table 37.3. Quarterly submission timings in the seed are illustrative,
          because per entity quarterly performance is not published at this granularity.
        </p>
      </div>

      <aside className="aside">
        <Alerts rows={rows} onExplain={setExplain} />
        <Deadlines periods={periods.data ?? []} subs={subs.data} entities={rows.length} />
        <CitizenCard />
        <BrandCard />
      </aside>

      {explain ? (
        <RiskPanel risk={explain} entityName={explain.name} onClose={() => setExplain(null)} />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* counts                                                              */
/* ------------------------------------------------------------------ */

function Counts({
  rows, subs, period, periods,
}: {
  rows: PortfolioRow[];
  subs: SubmissionRow[] | null;
  period: PeriodView | null;
  periods: PeriodView[];
}) {
  const { t } = useI18n();
  const L = useLabels();

  const npos = rows.filter((r) => r.entityType === 'NPO').length;
  const filed = period && subs
    ? new Set(subs.filter((s) => s.periodId === period.periodId && FILED.has(s.status)).map((s) => s.entityId)).size
    : null;
  const scored = rows.filter((r) => r.band !== 'NOT_SCORED');
  const elevated = scored.filter((r) => r.band === 'HIGH' || r.band === 'CRITICAL').length;

  // The next deadline ahead, which is not always the period being read: in September the
  // executive reads Q1 while Q2 is the one still to come in.
  const next = periods
    .filter((p) => p.daysRemaining !== null && p.daysRemaining >= 0)
    .sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0))[0] ?? null;
  const toFile = next && subs ? rows.length - filedFor(subs, next.periodId) : null;

  return (
    <div className="tiles pf-tiles">
      <Tile
        icon={<IconLandmark size={24} />}
        value={num(rows.length)}
        label={t('pf.tileBodies')}
        sub={t('pf.tileBodiesSub', num(rows.length - npos) ?? '', num(npos) ?? '')}
      />
      <Tile
        icon={<IconCheckCircle size={24} />}
        tone="ok"
        value={filed === null || rows.length === 0 ? null : percent((filed / rows.length) * 100)}
        label={t('pf.tileFiled', period?.label ?? '')}
        sub={filed === null ? undefined : t('pf.countOfEntities', num(filed) ?? '', num(rows.length) ?? '')}
      />
      <Tile
        icon={<IconAlert size={24} />}
        tone="critical"
        value={scored.length === 0 ? null : percent((elevated / scored.length) * 100)}
        label={t('pf.tileRisk')}
        sub={t('pf.countOfScored', num(elevated) ?? '', num(scored.length) ?? '')}
      />
      <Tile
        icon={<IconClock size={24} />}
        tone="purple"
        value={next ? num(toFile) : null}
        label={next ? t('pf.tileToFile', next.label) : t('pf.noDeadlines')}
        sub={next ? t('dash.dueOn', date(next.dueDate) ?? '') + ', ' + (L.daysRemaining(next.daysRemaining) ?? '') : undefined}
      />
    </div>
  );
}

function filedFor(subs: SubmissionRow[], periodId: string): number {
  return new Set(subs.filter((s) => s.periodId === periodId && FILED.has(s.status)).map((s) => s.entityId)).size;
}

/* ------------------------------------------------------------------ */
/* the three pictures                                                  */
/* ------------------------------------------------------------------ */

export function RiskRing({ rows }: { rows: PortfolioRow[] }) {
  const { t } = useI18n();
  const L = useLabels();
  const scored = rows.filter((r) => r.band !== 'NOT_SCORED').length;
  const low = rows.filter((r) => r.band === 'LOW').length;

  // Most serious first in the legend, which is the order the question is asked in.
  const slices: Slice[] = BAND_ORDER.map((band) => ({
    key: band,
    label: L.band(band),
    value: rows.filter((r) => r.band === band).length,
    colour: band === 'NOT_SCORED' ? VIZ.none : bandColour(band),
    hatched: band === 'NOT_SCORED',
  }));

  return (
    <section className="card pf-chart">
      <h2>{t('pf.ringTitle')}</h2>
      <div className="pf-ring">
        <Ring
          slices={slices}
          label={t('pf.ringLabel', num(low) ?? '', num(scored) ?? '')}
          centre={scored === 0 ? '—' : percent((low / scored) * 100) ?? '—'}
          centreSub={t('pf.ringCentreSub')}
        />
        <ul className="pf-ring-legend">
          {slices.map((s) => (
            <li key={s.key} className={s.value === 0 ? 'pf-zero' : undefined}>
              <span className={'viz-swatch' + (s.hatched ? ' viz-hatched' : '')} style={{ background: s.colour }} aria-hidden="true" />
              <span className="pf-ring-word">{s.label}</span>
              <strong>{num(s.value)}</strong>
              <span className="muted">{rows.length ? percent((s.value / rows.length) * 100) : '—'}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AnalyticsCharts({
  analytics,
}: {
  analytics: { data: AnalyticsView | null; loading: boolean; error: string | null; reload: () => void };
}) {
  const { t } = useI18n();

  if (analytics.loading || analytics.error || !analytics.data) {
    return (
      <section className="card pf-chart pf-chart-span">
        {analytics.loading ? (
          <Loading what={t('an.what')} />
        ) : (
          <ErrorState message={analytics.error ?? t('an.couldNotRead')} onRetry={analytics.reload} />
        )}
      </section>
    );
  }

  const years = analytics.data.years;

  const achieved: Datum[] = years.map((y) => ({
    key: y.financialYear,
    label: y.financialYear,
    value: y.achievedPercent,
    note: y.achievedPercent === null ? undefined : percent(y.achievedPercent, 1) ?? undefined,
    detail:
      y.achievedPercent === null
        ? y.financialYear + ': ' + t('pf.lineNotAudited')
        : t('pf.lineDetail', y.financialYear, num(y.targetsAchieved) ?? '', num(y.targetsTotal) ?? '', num(y.entitiesWithCounts) ?? ''),
    absentText: t('pf.lineNotAudited'),
    emphasis: y.current,
  }));

  const allocated: Datum[] = years.map((y) => ({
    key: y.financialYear,
    label: y.financialYear,
    value: y.allocated,
    note: randsShort(y.allocated) ?? undefined,
    detail:
      y.allocated === null
        ? y.financialYear + ': ' + t('common.noAllocationRow')
        : t('pf.allocDetail', y.financialYear, randsShort(y.allocated) ?? '', num(y.entitiesFunded) ?? ''),
    absentText: t('common.noAllocationRow'),
    emphasis: y.current,
  }));

  return (
    <>
      <section className="card pf-chart">
        <h2>{t('pf.lineTitle')}</h2>
        <p className="small muted pf-chart-hint">{t('pf.lineHint')}</p>
        <Line data={achieved} label={t('pf.lineLabel')} colour={VIZ.cat[0]} />
      </section>
      <section className="card pf-chart">
        <h2>{t('pf.allocTitle')}</h2>
        <p className="small muted pf-chart-hint">{t('pf.allocHint')}</p>
        <Columns data={allocated} label={t('pf.allocLabel')} colour={VIZ.cat[1]} height={170} />
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* the entities                                                        */
/* ------------------------------------------------------------------ */

const TABLE_ROWS = 8;

function EntityTable({
  rows, subs, period, onExplain,
}: {
  rows: PortfolioRow[];
  subs: SubmissionRow[] | null;
  period: PeriodView | null;
  onExplain: (r: PortfolioRow) => void;
}) {
  const { t } = useI18n();
  const L = useLabels();

  const byEntity = useMemo(() => {
    const inPeriod = new Map<string, SubmissionRow>();
    const lastFiled = new Map<string, string>();
    for (const s of subs ?? []) {
      if (period && s.periodId === period.periodId) inPeriod.set(s.entityId, s);
      if (s.submittedAt && (lastFiled.get(s.entityId) ?? '') < s.submittedAt) lastFiled.set(s.entityId, s.submittedAt);
    }
    return { inPeriod, lastFiled };
  }, [subs, period]);

  // The API returns the portfolio in risk order, which is the order a committee asks in.
  const shown = rows.slice(0, TABLE_ROWS);

  return (
    <section className="card">
      <div className="section-head">
        <span className="pf-card-icon"><IconLandmark size={20} /></span>
        <h2>{t('pf.tableTitle')}</h2>
        <span className="spacer" />
        <Link to="/entities" className="pf-more">
          {t('pf.viewAllEntities')} <IconChevronRight size={15} />
        </Link>
      </div>
      <div className="table-wrap">
        <table className="pf-table">
          <thead>
            <tr>
              <th>{t('pf.colEntity')}</th>
              <th>{t('pf.colSector')}</th>
              <th>{t('pf.colFiling', period?.label ?? '')}</th>
              <th>{t('pf.colRisk')}</th>
              <th>{t('pf.colIssue')}</th>
              <th>{t('pf.colLast')}</th>
              <th><span className="visually-hidden">{t('pf.open')}</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const issue = largestFactor(r);
              const last = byEntity.lastFiled.get(r.entityId) ?? null;
              return (
                <tr key={r.entityId}>
                  <td>
                    <Link to={'/portfolio/entity/' + r.entityId} className="pf-entity">
                      <span className="pf-entity-icon" aria-hidden="true"><IconLandmark size={17} /></span>
                      <span>{r.name}</span>
                    </Link>
                  </td>
                  <td className="muted">{L.sector(r.sector)}</td>
                  <td><FilingChip sub={byEntity.inPeriod.get(r.entityId) ?? null} period={period} /></td>
                  <td>
                    <RiskBadge score={r.score} band={r.band} size="sm" movement={r.movement} onExplain={() => onExplain(r)} />
                  </td>
                  <td className="pf-issue">{issue ? L.signal(issue.type) : <span className="muted">{t('pf.noIssue')}</span>}</td>
                  <td className="muted pf-nowrap">{last ? date(last) : t('pf.neverFiled')}</td>
                  <td>
                    <Link to={'/portfolio/entity/' + r.entityId} className="pf-row-go" aria-label={t('pf.openEntity', r.name)}>
                      <IconChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > TABLE_ROWS ? (
        <p className="small muted pf-table-foot">{t('pf.tableFoot', num(TABLE_ROWS) ?? '', num(rows.length) ?? '')}</p>
      ) : null}
    </section>
  );
}

/** The signal contributing most to a score, where any contributes at all. */
function largestFactor(r: PortfolioRow) {
  return r.signals
    .filter((s) => (s.contribution ?? 0) > 0)
    .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0))[0] ?? null;
}

function FilingChip({ sub, period }: { sub: SubmissionRow | null; period: PeriodView | null }) {
  const { t } = useI18n();
  const L = useLabels();
  if (!sub) {
    // Nothing on record. Late only once the due date has passed; before that it is simply not due.
    const overdue = period?.daysRemaining !== null && period?.daysRemaining !== undefined && period.daysRemaining < 0;
    return overdue
      ? <span className="chip chip-danger">{t('pf.fileNotFiled')}</span>
      : <span className="chip chip-muted">{t('pf.fileNotDue')}</span>;
  }
  switch (sub.status) {
    case 'APPROVED':
      return <span className="chip chip-ok">{L.status(sub.status)}</span>;
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return <span className="chip pf-chip-purple">{t('pf.fileAwaiting')}</span>;
    case 'RETURNED':
      return <span className="chip chip-warn">{L.status(sub.status)}</span>;
    default:
      return <span className="chip chip-warn">{t('status.inProgress')}</span>;
  }
}

/* ------------------------------------------------------------------ */
/* insights                                                            */
/* ------------------------------------------------------------------ */

function Insights({ rows, analytics }: { rows: PortfolioRow[]; analytics: AnalyticsView | null }) {
  const { t } = useI18n();

  const rising = rows.filter((r) => (r.movement ?? 0) > 0).length;

  const critical = rows.filter((r) => r.band === 'CRITICAL');
  const criticalWithMoney = critical.filter((r) => r.totalAllocation !== null);
  const criticalMoney = criticalWithMoney.reduce((n, r) => n + (r.totalAllocation ?? 0), 0);

  let moneyText: string;
  if (critical.length === 0) moneyText = t('pf.noneCritical');
  else if (criticalWithMoney.length === 0)
    moneyText = (critical.length === 1 ? t('pf.oneCritical') : t('pf.criticalCount', num(critical.length) ?? '')) + ' ' + t('pf.noAllocationForCritical');
  else
    moneyText = critical.length === 1
      ? t('pf.criticalMoneyOne', randsShort(criticalMoney) ?? '')
      : t('pf.criticalMoney', randsShort(criticalMoney) ?? '');

  // The two most recent years that carry an audit outcome, compared on clean audits.
  const audited = (analytics?.years ?? []).filter((y) => Object.values(y.outcomes).some((n) => n > 0));
  const [prev, last] = audited.slice(-2);
  const auditText = prev && last
    ? t('pf.insAudit', num(last.outcomes.UNQUALIFIED ?? 0) ?? '', num(last.entitiesAudited) ?? '', last.financialYear, num(prev.outcomes.UNQUALIFIED ?? 0) ?? '', num(prev.entitiesAudited) ?? '', prev.financialYear)
    : t('pf.insAuditNone');

  const due = (analytics?.quarters ?? []).filter((q) => q.fallenDue).at(-1) ?? null;
  const timelyText = due
    ? t('pf.insTimely', num(due.onTime) ?? '', num(due.expected) ?? '', due.label, num(due.late) ?? '', num(due.notFiled ?? 0) ?? '')
    : t('pf.insTimelyNone');

  return (
    <section className="card">
      <div className="section-head">
        <span className="pf-card-icon"><IconTrend size={20} /></span>
        <h2>{t('pf.insightsTitle')}</h2>
      </div>
      <div className="pf-insights">
        <Insight tone="danger" icon={<IconTrend size={20} />} title={t('pf.insRiseTitle')} to="/risk" link={t('pf.insRiseLink')}>
          {rising === 0 ? t('pf.insRiseNone') : rising === 1 ? t('pf.insRiseOne') : t('pf.insRise', num(rising) ?? '')}
        </Insight>
        <Insight tone="gold" icon={<IconScale size={20} />} title={t('pf.insMoneyTitle')} to="/entities" link={t('pf.insMoneyLink')}>
          {moneyText}
        </Insight>
        <Insight tone="purple" icon={<IconCheckCircle size={20} />} title={t('pf.insAuditTitle')} to="/analytics" link={t('pf.insAuditLink')}>
          {auditText}
        </Insight>
        <Insight tone="teal" icon={<IconClock size={20} />} title={t('pf.insTimelyTitle')} to="/analytics" link={t('pf.insTimelyLink')}>
          {timelyText}
        </Insight>
      </div>
    </section>
  );
}

function Insight({
  tone, icon, title, children, to, link,
}: {
  tone: 'danger' | 'gold' | 'purple' | 'teal';
  icon: ReactNode;
  title: string;
  children: ReactNode;
  to: string;
  link: string;
}) {
  return (
    <article className={'pf-insight pf-insight-' + tone}>
      <span className="pf-insight-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      <Link to={to} className="pf-more">
        {link} <IconChevronRight size={14} />
      </Link>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* right rail                                                          */
/* ------------------------------------------------------------------ */

function Alerts({ rows, onExplain }: { rows: PortfolioRow[]; onExplain: (r: PortfolioRow) => void }) {
  const { t } = useI18n();
  const L = useLabels();
  const elevated = rows.filter((r) => r.band === 'HIGH' || r.band === 'CRITICAL').length;
  // Anything above the low band, worst first. In a quiet quarter that is the medium band, and
  // saying so is more useful than an empty card.
  const list = rows
    .filter((r) => r.band === 'CRITICAL' || r.band === 'HIGH' || r.band === 'MEDIUM')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);

  return (
    <section className="card pf-alerts">
      <div className="section-head">
        <span className="pf-alerts-icon"><IconAlert size={20} /></span>
        <h2>{t('pf.alertsTitle')}</h2>
        <span className="spacer" />
        <span className="pf-count" aria-label={t('pf.alertsCount', num(elevated) ?? '')}>{num(elevated)}</span>
      </div>
      {list.length === 0 ? (
        <p className="small muted">{t('pf.noAlerts')}</p>
      ) : (
        <ul className="pf-alert-list">
          {list.map((r) => {
            const f = largestFactor(r);
            return (
              <li key={r.entityId}>
                <span className="pf-alert-mark" style={{ color: bandColour(r.band) }}><IconAlert size={18} /></span>
                <div>
                  <Link to={'/portfolio/entity/' + r.entityId}><strong>{r.name}</strong></Link>
                  <p>{f?.description ?? L.signal(f?.type)}</p>
                  <button type="button" className="link small" onClick={() => onExplain(r)}>
                    {L.band(r.band)} · {num(r.score)} · {t('pf.why')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link to="/risk" className="pf-more">
        {t('pf.viewAllAlerts')} <IconChevronRight size={15} />
      </Link>
    </section>
  );
}

function Deadlines({ periods, subs, entities }: { periods: PeriodView[]; subs: SubmissionRow[] | null; entities: number }) {
  const { t } = useI18n();
  const L = useLabels();
  const ahead = periods
    .filter((p) => p.daysRemaining !== null && p.daysRemaining >= 0)
    .sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0))
    .slice(0, 3);

  return (
    <section className="card">
      <div className="section-head">
        <span className="pf-card-icon"><IconCalendar size={20} /></span>
        <h2>{t('pf.deadlinesTitle')}</h2>
      </div>
      {ahead.length === 0 ? (
        <p className="small muted">{t('pf.noDeadlines')}</p>
      ) : (
        <ul className="pf-deadlines">
          {ahead.map((p, i) => {
            const days = p.daysRemaining ?? 0;
            const left = subs ? entities - filedFor(subs, p.periodId) : null;
            return (
              <li key={p.periodId}>
                <span className="pf-days">
                  <strong>{num(days)}</strong>
                  <em>{days === 1 ? t('pf.day') : t('pf.days')}</em>
                </span>
                <span className={'pf-dot pf-dot-' + i} aria-hidden="true" />
                <span className="pf-deadline-text">
                  <strong>{p.label}</strong>
                  <em>{t('dash.dueOn', date(p.dueDate) ?? '')} · {L.basis(p.deadlineBasis)}</em>
                  {left !== null ? <em>{t('pf.stillToFile', num(left) ?? '', num(entities) ?? '')}</em> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CitizenCard() {
  const { t, withLang } = useI18n();
  return (
    <section className="card pf-citizen">
      <div className="section-head">
        <span className="pf-card-icon pf-card-icon-ok"><IconEye size={20} /></span>
        <h2>{t('pf.citizenTitle')}</h2>
      </div>
      <p className="small">{t('pf.citizenBody')}</p>
      <p className="small muted">{t('pf.citizenWho')}</p>
      <a className="btn btn-primary" href={withLang('/public')} target="_blank" rel="noreferrer">
        {t('pf.citizenOpen')} <IconExternal size={15} />
      </a>
    </section>
  );
}

function BrandCard() {
  const { t } = useI18n();
  return (
    <Link to="/analytics" className="pf-brand" aria-label={t('pf.toAnalytics')}>
      <span className="pf-brand-word"><img src="/img/vuka-logo.png" alt="V" />uka</span>
      <p>{t('pf.brandLine')}</p>
      <span className="pf-brand-go" aria-hidden="true"><IconChevronRight size={18} /></span>
    </Link>
  );
}

function greeting(name: string | null, t: I18n['t']): string {
  const h = new Date().getHours();
  const part = h < 12 ? t('dash.morning') : h < 17 ? t('dash.afternoon') : t('dash.evening');
  if (!name) return part;
  // "N. Mabaso" greeted as "N" reads as a glitch. Where the first word is only an initial, use
  // the whole name as it was given.
  const first = name.trim().split(/\s+/)[0];
  return t('dash.greetingNamed', part, /^[A-Za-z]\.?$/.test(first) ? name.trim() : first);
}
