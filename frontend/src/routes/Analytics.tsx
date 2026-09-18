/*
 * Analytics & Insights.
 *
 * Every other oversight screen describes one reporting period. This one answers the question none
 * of them can: is it getting better? It reads one endpoint, /api/dashboard/analytics, and every
 * figure on it is either published (ENE allocations, the Auditor-General's outcomes and
 * targets-achieved counts) or confirmed by a named reporter in this system.
 *
 * What the design mockup showed and this does not: a trend by month, document view and download
 * counts, and "performance improved by 12%". Nothing is stored per month, nothing counts a view,
 * and a portfolio rate over nine audited entities one year and sixteen the next measures who got
 * audited rather than who improved. So the year-on-year movement is computed only over the same
 * entities in both years, and the screen says so.
 *
 * Sector rows put rands and delivery side by side and never divide one by the other. Cost per
 * outcome across a ballet company and a boxing regulator is not a comparison this product makes.
 */
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import type { AnalyticsCohort, AnalyticsQuarter, AnalyticsSector, AnalyticsYear } from '../lib/types';
import { auditOutcomeLabel, date, num, percent, randsShort, sectorLabel } from '../lib/format';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import { PageHead } from '../components/AppShell';
import { IconChart, IconCheckCircle, IconClock, IconInfo, IconTrend } from '../icons';
import './Analytics.css';

const OUTCOME_ORDER = [
  'UNQUALIFIED', 'UNQUALIFIED_WITH_FINDINGS', 'QUALIFIED', 'ADVERSE', 'DISCLAIMER', 'OUTSTANDING',
];

const CHANNEL_LABELS: Record<string, string> = {
  WEB: 'web', MOBILE: 'phone', WHATSAPP: 'WhatsApp', EMAIL: 'email',
};

export function Analytics() {
  const data = useAsync(() => api.analytics(), []);

  if (data.loading) return <Loading what="the analytics" />;
  if (data.error || !data.data) {
    return <ErrorState message={data.error ?? 'The analytics could not be read.'} onRetry={data.reload} />;
  }

  const a = data.data;
  const audited = a.years.filter((y) => y.achievedPercent !== null);
  const latestAudited = audited.length ? audited[audited.length - 1] : null;
  const review = a.quarters.find((q) => q.periodId === a.reviewPeriodId) ?? null;

  return (
    <div>
      <PageHead
        icon={<IconChart size={26} />}
        title="Analytics & Insights"
        subtitle="Whether the portfolio is getting better, from published and confirmed figures only."
      />

      <div className="tiles">
        <Tile
          icon={<IconCheckCircle size={22} />}
          tone="ok"
          value={latestAudited ? percent(latestAudited.achievedPercent) : null}
          label="Targets achieved, audited"
          sub={
            latestAudited
              ? `${latestAudited.financialYear}, ${num(latestAudited.entitiesWithCounts)} entities with published counts`
              : 'No audited year with published counts'
          }
        />
        <Tile
          icon={<IconTrend size={22} />}
          tone={a.cohort && a.cohort.declined > a.cohort.improved ? 'warn' : 'purple'}
          value={a.cohort ? `${num(a.cohort.improved)} up, ${num(a.cohort.declined)} down` : null}
          label="Same entities, year on year"
          sub={a.cohort ? `${a.cohort.fromYear} to ${a.cohort.toYear}, ${num(a.cohort.entities)} entities` : 'Needs two audited years'}
        />
        <Tile
          icon={<IconClock size={22} />}
          tone={review && review.late + (review.notFiled ?? 0) > 0 ? 'warn' : 'ok'}
          value={review ? `${num(review.onTime)} of ${num(review.expected)}` : null}
          label="Filed on time"
          sub={review?.label ?? 'No quarter has fallen due'}
        />
        <Tile
          icon={<IconChart size={22} />}
          value={review ? percent(review.metPercent) : null}
          label="Figures meeting the quarter target"
          sub={
            review && review.metPercent !== null
              ? `${num(review.metTarget)} of ${num(review.metTarget + review.belowTarget)} figures, ${review.label}`
              : 'No figures confirmed yet'
          }
        />
      </div>

      <YearOnYear years={a.years} />
      <Movers cohort={a.cohort} />
      <Quarters
        quarters={a.quarters}
        year={a.currentYear}
        reviewId={a.reviewPeriodId}
        withoutTargets={a.entitiesWithoutTargets}
      />
      <Sectors
        sectors={a.sectors}
        periodLabel={a.reviewPeriodLabel}
        year={a.currentYear}
        earliest={a.earliestAllocationYear}
      />

      <p className="small muted">
        Sources. Allocations: Estimates of National Expenditure 2026, Vote 37, Table 37.3. Audit
        outcomes and targets achieved: published annual reports and the Auditor-General's briefing to
        the Portfolio Committee, blank where not published. Quarterly figures are those confirmed in
        Vuka by a named reporter; in this demonstration they are illustrative seed data. Not shown,
        because nothing records them: any monthly series, and document views or downloads.
      </p>
    </div>
  );
}

/* ---------- year on year ---------- */

function YearOnYear({ years }: { years: AnalyticsYear[] }) {
  if (years.length === 0) {
    return (
      <div className="card an-section">
        <h2>Year on year</h2>
        <EmptyState>No allocation or audit outcome is on record for any year.</EmptyState>
      </div>
    );
  }
  const auditedCounts = years.filter((y) => y.entitiesWithCounts > 0);
  const mixedPopulation =
    auditedCounts.length > 1 &&
    new Set(auditedCounts.map((y) => y.entitiesWithCounts)).size > 1;

  return (
    <div className="card an-section">
      <h2>Year on year</h2>
      <p className="small muted">
        Money from the ENE, results from the Auditor-General. A year not yet audited shows no rate
        rather than a zero.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th className="num">Allocated</th>
              <th className="num">Change</th>
              <th>Targets achieved</th>
              <th>Audit outcomes</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y, i) => {
              const prev = i > 0 ? years[i - 1].allocated : null;
              const change =
                y.allocated !== null && prev !== null && prev > 0
                  ? ((y.allocated - prev) / prev) * 100
                  : null;
              return (
                <tr key={y.financialYear}>
                  <td>
                    <strong>{y.financialYear}</strong>
                    {y.current ? <span className="muted small"> current</span> : null}
                  </td>
                  <td className="num">{randsShort(y.allocated) ?? '—'}</td>
                  <td className="num">{change === null ? '—' : signed(change, '%')}</td>
                  <td>
                    {y.achievedPercent === null ? (
                      <span className="muted small">
                        {y.entitiesAudited > 0
                          ? 'Audited, counts not published'
                          : y.current
                            ? 'In year, see the quarters below'
                            : 'Not yet audited'}
                      </span>
                    ) : (
                      <Bar
                        value={y.achievedPercent}
                        text={`${percent(y.achievedPercent)} (${num(y.targetsAchieved)} of ${num(y.targetsTotal)}, ${num(y.entitiesWithCounts)} entities)`}
                      />
                    )}
                  </td>
                  <td>
                    <OutcomeStack outcomes={y.outcomes} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {mixedPopulation ? (
        <p className="an-note">
          <IconInfo size={16} />
          <span>
            Each year's rate covers whichever entities published counts that year (
            {auditedCounts.map((y) => `${y.entitiesWithCounts} in ${y.financialYear}`).join(', ')}),
            so the rows are not the same population. The comparison below is like for like.
          </span>
        </p>
      ) : null}
    </div>
  );
}

function OutcomeStack({ outcomes }: { outcomes: Record<string, number> }) {
  const total = Object.values(outcomes).reduce((n, v) => n + v, 0);
  if (total === 0) return <span className="muted small">None published</span>;
  const present = OUTCOME_ORDER.filter((o) => outcomes[o]);
  const summary = present.map((o) => `${outcomes[o]} ${auditOutcomeLabel(o).toLowerCase()}`).join(', ');
  return (
    <div className="an-outcomes">
      <div className="an-stack" role="img" aria-label={summary}>
        {present.map((o) => (
          <span
            key={o}
            className={'an-seg an-o-' + o.toLowerCase()}
            style={{ width: (outcomes[o] / total) * 100 + '%' }}
            title={`${auditOutcomeLabel(o)}: ${outcomes[o]}`}
          />
        ))}
      </div>
      <span className="small muted">{summary}</span>
    </div>
  );
}

/* ---------- who moved ---------- */

function Movers({ cohort }: { cohort: AnalyticsCohort | null }) {
  return (
    <div className="card an-section">
      <h2>Who moved{cohort ? `, ${cohort.fromYear} to ${cohort.toYear}` : ''}</h2>
      {!cohort || cohort.entities === 0 ? (
        <EmptyState>
          Movement needs published targets-achieved counts for the same entity in two audited
          years, and none are on record yet.
        </EmptyState>
      ) : (
        <>
          <p>
            Across the <strong>{num(cohort.entities)} entities</strong> with published counts in
            both years, targets achieved went from{' '}
            <strong>{percent(cohort.fromPercent)}</strong> to{' '}
            <strong>{percent(cohort.toPercent)}</strong>. {num(cohort.improved)} improved,{' '}
            {num(cohort.declined)} declined
            {cohort.unchanged ? `, ${num(cohort.unchanged)} unchanged` : ''}. Largest fall first.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Sector</th>
                  <th className="num">{cohort.fromYear}</th>
                  <th className="num">{cohort.toYear}</th>
                  <th className="num">Change</th>
                  <th>Audit outcome</th>
                </tr>
              </thead>
              <tbody>
                {cohort.rows.map((m) => (
                  <tr key={m.entityId}>
                    <td>
                      <Link to={'/portfolio/entity/' + m.entityId}>{m.name}</Link>
                    </td>
                    <td>{sectorLabel(m.sector)}</td>
                    <td className="num" title={`${m.fromAchieved} of ${m.fromTotal}`}>
                      {percent(m.fromPercent)}
                    </td>
                    <td className="num" title={`${m.toAchieved} of ${m.toTotal}`}>
                      {percent(m.toPercent)}
                    </td>
                    <td className={'num ' + (m.changePoints < 0 ? 'an-down' : m.changePoints > 0 ? 'an-up' : '')}>
                      {signed(m.changePoints, ' pts')}
                      <span className="visually-hidden">
                        {m.changePoints < 0 ? ' worse' : m.changePoints > 0 ? ' better' : ' unchanged'}
                      </span>
                    </td>
                    <td className="small">
                      {m.fromOutcome === m.toOutcome
                        ? auditOutcomeLabel(m.toOutcome)
                        : `${auditOutcomeLabel(m.fromOutcome)} to ${auditOutcomeLabel(m.toOutcome).toLowerCase()}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- quarter by quarter ---------- */

function Quarters({
  quarters, year, reviewId, withoutTargets,
}: { quarters: AnalyticsQuarter[]; year: string | null; reviewId: string | null; withoutTargets: number }) {
  const active = quarters.filter((q) => q.open || q.filed > 0 || q.drafts > 0);
  return (
    <div className="card an-section">
      <h2>Quarter by quarter{year ? `, ${year}` : ''}</h2>
      <p className="small muted">
        Filing against the due date the Department set, figures against each target's own quarter
        value, and the stored risk bands. A quarter not yet due has no "not filed" count, because
        nothing is late before the due date.
      </p>
      {active.length === 0 ? (
        <EmptyState>No quarter of the current year has opened yet.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quarter</th>
                <th>Due</th>
                <th className="num">Filed</th>
                <th className="num">On time</th>
                <th className="num">Late</th>
                <th className="num">Not filed</th>
                <th>Review</th>
                <th>Met quarter target</th>
                <th className="num">High or critical</th>
              </tr>
            </thead>
            <tbody>
              {active.map((q) => (
                <tr key={q.periodId} className={q.periodId === reviewId ? 'an-current' : undefined}>
                  <td>
                    <strong>{q.label}</strong>
                    <div className="small muted">
                      {q.periodId === reviewId ? 'under review' : q.fallenDue ? 'fallen due' : 'open'}
                    </div>
                  </td>
                  <td className="small">{date(q.dueDate) ?? '—'}</td>
                  <td className="num">
                    {num(q.filed)} of {num(q.expected)}
                    {q.drafts ? <div className="small muted">{num(q.drafts)} in draft</div> : null}
                    {q.filed ? <div className="small muted">{channels(q.channels)}</div> : null}
                  </td>
                  <td className="num">{num(q.onTime)}</td>
                  <td className={'num' + (q.late ? ' an-down' : '')}>{num(q.late)}</td>
                  <td className={'num' + (q.notFiled ? ' an-down' : '')}>
                    {q.notFiled === null ? <span className="muted small">not due</span> : num(q.notFiled)}
                  </td>
                  <td className="small">
                    {q.filed === 0
                      ? '—'
                      : `${num(q.approved)} approved, ${num(q.returned)} returned, ${num(q.awaitingReview)} waiting`}
                  </td>
                  <td>
                    {q.metPercent === null ? (
                      <span className="muted small">No figures filed</span>
                    ) : (
                      <Bar
                        value={q.metPercent}
                        text={`${percent(q.metPercent)} (${num(q.metTarget)} of ${num(q.metTarget + q.belowTarget)})`}
                      />
                    )}
                    {q.noFigure ? (
                      <div className="small muted">{num(q.noFigure)} with no figure, reason given</div>
                    ) : null}
                    {q.figuresReported ? (
                      <div className="small muted">
                        {num(q.figuresVerified)} of {num(q.figuresReported)} approved
                      </div>
                    ) : null}
                  </td>
                  <td className="num">
                    {q.scored === 0 ? <span className="muted small">not scored</span> : `${num(q.highOrCritical)} of ${num(q.scored)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {withoutTargets > 0 ? (
        <p className="an-note">
          <IconInfo size={16} />
          <span>
            {num(withoutTargets)} of {num(active[0]?.expected ?? 0)} funded entities have no target
            registered for {year ?? 'this year'}. They still owe a quarterly report and are counted
            as expected, but have nothing to report a figure against until their plan is loaded.
          </span>
        </p>
      ) : null}
    </div>
  );
}

/* ---------- by sector ---------- */

function Sectors({
  sectors, periodLabel, year, earliest,
}: { sectors: AnalyticsSector[]; periodLabel: string | null; year: string | null; earliest: string | null }) {
  const showChange = earliest !== null && earliest !== year;
  return (
    <div className="card an-section">
      <h2>By sector{periodLabel ? `, ${periodLabel}` : ''}</h2>
      <p className="small muted">
        Money and delivery side by side, never divided into a cost per outcome. Each entity is
        measured against its own targets, so the rates compare how well each sector keeps its own
        promises, not what its outputs are worth.
      </p>
      {sectors.length === 0 ? (
        <EmptyState>No quarter has fallen due, so there is nothing to split by sector yet.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sector</th>
                <th className="num">Entities</th>
                <th className="num">Allocated {year ?? ''}</th>
                {showChange ? <th className="num">Since {earliest}</th> : null}
                <th className="num">Filed</th>
                <th>Met quarter target</th>
                <th className="num">High or critical</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((s) => {
                const change =
                  s.allocated !== null && s.allocatedEarliest !== null && s.allocatedEarliest > 0
                    ? ((s.allocated - s.allocatedEarliest) / s.allocatedEarliest) * 100
                    : null;
                return (
                  <tr key={s.sector}>
                    <td><strong>{sectorLabel(s.sector)}</strong></td>
                    <td className="num">{num(s.entities)}</td>
                    <td className="num">{randsShort(s.allocated) ?? '—'}</td>
                    {showChange ? <td className="num">{change === null ? '—' : signed(change, '%')}</td> : null}
                    <td className="num">{num(s.filed)} of {num(s.expected)}</td>
                    <td>
                      {s.metPercent === null ? (
                        <span className="muted small">No figures filed</span>
                      ) : (
                        <Bar
                          value={s.metPercent}
                          text={`${percent(s.metPercent)} (${num(s.metTarget)} of ${num(s.figuresReported)})`}
                        />
                      )}
                    </td>
                    <td className={'num' + (s.highOrCritical ? ' an-down' : '')}>
                      {s.scored === 0 ? '—' : `${num(s.highOrCritical)} of ${num(s.scored)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- pieces ---------- */

/** A proportion bar that always carries its figure in text, so it survives greyscale and screen readers. */
function Bar({ value, text }: { value: number; text: string }) {
  return (
    <div className="an-bar">
      <span className="an-track" aria-hidden="true">
        <span className="an-fill" style={{ width: Math.max(0, Math.min(100, value)) + '%' }} />
      </span>
      <span className="an-bar-text">{text}</span>
    </div>
  );
}

function signed(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  return (rounded > 0 ? '+' : '') + rounded.toFixed(1) + unit;
}

function channels(c: Record<string, number>): string {
  return Object.entries(c)
    .map(([k, v]) => `${v} ${CHANNEL_LABELS[k] ?? k.toLowerCase()}`)
    .join(', ');
}
