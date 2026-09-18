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
import { date, num, percent, randsShort } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { I18n, Key } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import { PageHead } from '../components/AppShell';
import { IconChart, IconCheckCircle, IconClock, IconInfo, IconTrend } from '../icons';
import './Analytics.css';

const OUTCOME_ORDER = [
  'UNQUALIFIED', 'UNQUALIFIED_WITH_FINDINGS', 'QUALIFIED', 'ADVERSE', 'DISCLAIMER', 'OUTSTANDING',
];

/* WhatsApp is a product name and stays as it is in every language. The other three are
   ordinary words and are not. */
const CHANNEL_KEYS: Record<string, Key> = {
  WEB: 'an.chWeb', MOBILE: 'an.chPhone', WHATSAPP: 'an.chWhatsApp', EMAIL: 'an.chEmail',
};

export function Analytics() {
  const data = useAsync(() => api.analytics(), []);
  const { t } = useI18n();

  if (data.loading) return <Loading what={t('an.what')} />;
  if (data.error || !data.data) {
    return <ErrorState message={data.error ?? t('an.couldNotRead')} onRetry={data.reload} />;
  }

  const a = data.data;
  const audited = a.years.filter((y) => y.achievedPercent !== null);
  const latestAudited = audited.length ? audited[audited.length - 1] : null;
  const review = a.quarters.find((q) => q.periodId === a.reviewPeriodId) ?? null;

  return (
    <div>
      <PageHead
        icon={<IconChart size={26} />}
        title={t('nav.analytics')}
        subtitle={t('an.subtitle')}
      />

      <div className="tiles">
        <Tile
          icon={<IconCheckCircle size={22} />}
          tone="ok"
          value={latestAudited ? percent(latestAudited.achievedPercent) : null}
          label={t('an.tileAchieved')}
          sub={
            latestAudited
              ? t('an.tileAchievedSub', latestAudited.financialYear, num(latestAudited.entitiesWithCounts) ?? '')
              : t('an.tileAchievedNone')
          }
        />
        <Tile
          icon={<IconTrend size={22} />}
          tone={a.cohort && a.cohort.declined > a.cohort.improved ? 'warn' : 'purple'}
          value={a.cohort ? t('an.tileMovedValue', num(a.cohort.improved) ?? '', num(a.cohort.declined) ?? '') : null}
          label={t('an.tileMoved')}
          sub={a.cohort ? t('an.tileMovedSub', a.cohort.fromYear, a.cohort.toYear, num(a.cohort.entities) ?? '') : t('an.tileMovedNone')}
        />
        <Tile
          icon={<IconClock size={22} />}
          tone={review && review.late + (review.notFiled ?? 0) > 0 ? 'warn' : 'ok'}
          value={review ? t('an.ofCount', num(review.onTime) ?? '', num(review.expected) ?? '') : null}
          label={t('an.tileOnTime')}
          sub={review?.label ?? t('an.noQuarterDue')}
        />
        <Tile
          icon={<IconChart size={22} />}
          value={review ? percent(review.metPercent) : null}
          label={t('an.tileMet')}
          sub={
            review && review.metPercent !== null
              ? t('an.tileMetSub', num(review.metTarget) ?? '', num(review.metTarget + review.belowTarget) ?? '', review.label)
              : t('an.tileMetNone')
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
        {/* The citation itself is a published reference and is not translated, exactly as
            CitationLine treats the ones the API supplies. */}
        {t('an.sources', 'Estimates of National Expenditure 2026, Vote 37, Table 37.3')}
      </p>
    </div>
  );
}

/* ---------- year on year ---------- */

function YearOnYear({ years }: { years: AnalyticsYear[] }) {
  const { t } = useI18n();
  if (years.length === 0) {
    return (
      <div className="card an-section">
        <h2>{t('an.yearOnYear')}</h2>
        <EmptyState>{t('an.yearOnYearNone')}</EmptyState>
      </div>
    );
  }
  const auditedCounts = years.filter((y) => y.entitiesWithCounts > 0);
  const mixedPopulation =
    auditedCounts.length > 1 &&
    new Set(auditedCounts.map((y) => y.entitiesWithCounts)).size > 1;

  return (
    <div className="card an-section">
      <h2>{t('an.yearOnYear')}</h2>
      <p className="small muted">{t('an.yearOnYearNote')}</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('an.colYear')}</th>
              <th className="num">{t('an.colAllocated')}</th>
              <th className="num">{t('an.colChange')}</th>
              <th>{t('an.colAchieved')}</th>
              <th>{t('an.colOutcomes')}</th>
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
                    {y.current ? <span className="muted small"> {t('an.current')}</span> : null}
                  </td>
                  <td className="num">{randsShort(y.allocated) ?? '—'}</td>
                  <td className="num">{change === null ? '—' : signed(change, '%')}</td>
                  <td>
                    {y.achievedPercent === null ? (
                      <span className="muted small">
                        {y.entitiesAudited > 0
                          ? t('an.auditedNoCounts')
                          : y.current
                            ? t('an.inYear')
                            : t('an.notAudited')}
                      </span>
                    ) : (
                      <Bar
                        value={y.achievedPercent}
                        text={t('an.achievedBar', percent(y.achievedPercent) ?? '', num(y.targetsAchieved) ?? '', num(y.targetsTotal) ?? '', num(y.entitiesWithCounts) ?? '')}
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
            {t('an.mixedPopulation', auditedCounts.map((y) => t('an.countInYear', y.entitiesWithCounts, y.financialYear)).join(', '))}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function OutcomeStack({ outcomes }: { outcomes: Record<string, number> }) {
  const { t } = useI18n();
  const L = useLabels();
  const total = Object.values(outcomes).reduce((n, v) => n + v, 0);
  if (total === 0) return <span className="muted small">{t('an.nonePublished')}</span>;
  const present = OUTCOME_ORDER.filter((o) => outcomes[o]);
  const summary = present.map((o) => outcomes[o] + ' ' + L.outcome(o).toLowerCase()).join(', ');
  return (
    <div className="an-outcomes">
      <div className="an-stack" role="img" aria-label={summary}>
        {present.map((o) => (
          <span
            key={o}
            className={'an-seg an-o-' + o.toLowerCase()}
            style={{ width: (outcomes[o] / total) * 100 + '%' }}
            title={L.outcome(o) + ': ' + outcomes[o]}
          />
        ))}
      </div>
      <span className="small muted">{summary}</span>
    </div>
  );
}

/* ---------- who moved ---------- */

function Movers({ cohort }: { cohort: AnalyticsCohort | null }) {
  const { t } = useI18n();
  const L = useLabels();
  return (
    <div className="card an-section">
      <h2>{cohort ? t('an.whoMovedYears', cohort.fromYear, cohort.toYear) : t('an.whoMoved')}</h2>
      {!cohort || cohort.entities === 0 ? (
        <EmptyState>{t('an.whoMovedNone')}</EmptyState>
      ) : (
        <>
          <p>
            {t(
              'an.moversSummary',
              num(cohort.entities) ?? '',
              percent(cohort.fromPercent) ?? '',
              percent(cohort.toPercent) ?? '',
              num(cohort.improved) ?? '',
              num(cohort.declined) ?? '',
            )}
            {cohort.unchanged ? ' ' + t('an.moversUnchanged', num(cohort.unchanged) ?? '') : ''}{' '}
            {t('an.largestFallFirst')}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('an.colEntity')}</th>
                  <th>{t('an.colSector')}</th>
                  <th className="num">{cohort.fromYear}</th>
                  <th className="num">{cohort.toYear}</th>
                  <th className="num">{t('an.colChange')}</th>
                  <th>{t('an.colOutcome')}</th>
                </tr>
              </thead>
              <tbody>
                {cohort.rows.map((m) => (
                  <tr key={m.entityId}>
                    <td>
                      <Link to={'/portfolio/entity/' + m.entityId}>{m.name}</Link>
                    </td>
                    <td>{L.sector(m.sector)}</td>
                    <td className="num" title={t('an.ofCount', String(m.fromAchieved), String(m.fromTotal))}>
                      {percent(m.fromPercent)}
                    </td>
                    <td className="num" title={t('an.ofCount', String(m.toAchieved), String(m.toTotal))}>
                      {percent(m.toPercent)}
                    </td>
                    <td className={'num ' + (m.changePoints < 0 ? 'an-down' : m.changePoints > 0 ? 'an-up' : '')}>
                      {signed(m.changePoints, ' pts')}
                      <span className="visually-hidden">
                        {' '}
                        {m.changePoints < 0 ? t('an.worse') : m.changePoints > 0 ? t('an.better') : t('an.unchanged')}
                      </span>
                    </td>
                    <td className="small">
                      {m.fromOutcome === m.toOutcome
                        ? L.outcome(m.toOutcome)
                        : t('an.outcomeMoved', L.outcome(m.fromOutcome), L.outcome(m.toOutcome).toLowerCase())}
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
  const { t } = useI18n();
  const active = quarters.filter((q) => q.open || q.filed > 0 || q.drafts > 0);
  return (
    <div className="card an-section">
      <h2>{year ? t('an.quarterByQuarterYear', year) : t('an.quarterByQuarter')}</h2>
      <p className="small muted">{t('an.quarterNote')}</p>
      {active.length === 0 ? (
        <EmptyState>{t('an.noQuarterOpen')}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('an.colQuarter')}</th>
                <th>{t('an.colDue')}</th>
                <th className="num">{t('an.colFiled')}</th>
                <th className="num">{t('an.colOnTime')}</th>
                <th className="num">{t('an.colLate')}</th>
                <th className="num">{t('an.colNotFiled')}</th>
                <th>{t('an.colReview')}</th>
                <th>{t('an.colMet')}</th>
                <th className="num">{t('an.colHighCritical')}</th>
              </tr>
            </thead>
            <tbody>
              {active.map((q) => (
                <tr key={q.periodId} className={q.periodId === reviewId ? 'an-current' : undefined}>
                  <td>
                    <strong>{q.label}</strong>
                    <div className="small muted">
                      {q.periodId === reviewId ? t('an.underReview') : q.fallenDue ? t('an.fallenDue') : t('an.open')}
                    </div>
                  </td>
                  <td className="small">{date(q.dueDate) ?? '—'}</td>
                  <td className="num">
                    {t('an.ofCount', num(q.filed) ?? '', num(q.expected) ?? '')}
                    {q.drafts ? <div className="small muted">{t('an.inDraft', num(q.drafts) ?? '')}</div> : null}
                    {q.filed ? <div className="small muted">{channels(q.channels, t)}</div> : null}
                  </td>
                  <td className="num">{num(q.onTime)}</td>
                  <td className={'num' + (q.late ? ' an-down' : '')}>{num(q.late)}</td>
                  <td className={'num' + (q.notFiled ? ' an-down' : '')}>
                    {q.notFiled === null ? <span className="muted small">{t('an.notDue')}</span> : num(q.notFiled)}
                  </td>
                  <td className="small">
                    {q.filed === 0
                      ? '—'
                      : t('an.reviewSplit', num(q.approved) ?? '', num(q.returned) ?? '', num(q.awaitingReview) ?? '')}
                  </td>
                  <td>
                    {q.metPercent === null ? (
                      <span className="muted small">{t('an.noFiguresFiled')}</span>
                    ) : (
                      <Bar
                        value={q.metPercent}
                        text={t('an.metBar', percent(q.metPercent) ?? '', num(q.metTarget) ?? '', num(q.metTarget + q.belowTarget) ?? '')}
                      />
                    )}
                    {q.noFigure ? (
                      <div className="small muted">{t('an.noFigureReason', num(q.noFigure) ?? '')}</div>
                    ) : null}
                    {q.figuresReported ? (
                      <div className="small muted">
                        {t('an.figuresApproved', num(q.figuresVerified) ?? '', num(q.figuresReported) ?? '')}
                      </div>
                    ) : null}
                  </td>
                  <td className="num">
                    {q.scored === 0 ? <span className="muted small">{t('an.notScored')}</span> : t('an.ofCount', num(q.highOrCritical) ?? '', num(q.scored) ?? '')}
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
            {t('an.withoutTargets', num(withoutTargets) ?? '', num(active[0]?.expected ?? 0) ?? '', year ?? t('an.thisYear'))}
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
  const { t } = useI18n();
  const L = useLabels();
  const showChange = earliest !== null && earliest !== year;
  return (
    <div className="card an-section">
      <h2>{periodLabel ? t('an.bySectorPeriod', periodLabel) : t('an.bySector')}</h2>
      <p className="small muted">{t('an.bySectorNote')}</p>
      {sectors.length === 0 ? (
        <EmptyState>{t('an.noSectorSplit')}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('an.colSector')}</th>
                <th className="num">{t('an.colEntities')}</th>
                <th className="num">{t('an.colAllocatedYear', year ?? '')}</th>
                {showChange ? <th className="num">{t('an.colSince', earliest ?? '')}</th> : null}
                <th className="num">{t('an.colFiled')}</th>
                <th>{t('an.colMet')}</th>
                <th className="num">{t('an.colHighCritical')}</th>
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
                    <td><strong>{L.sector(s.sector)}</strong></td>
                    <td className="num">{num(s.entities)}</td>
                    <td className="num">{randsShort(s.allocated) ?? '—'}</td>
                    {showChange ? <td className="num">{change === null ? '—' : signed(change, '%')}</td> : null}
                    <td className="num">{t('an.ofCount', num(s.filed) ?? '', num(s.expected) ?? '')}</td>
                    <td>
                      {s.metPercent === null ? (
                        <span className="muted small">{t('an.noFiguresFiled')}</span>
                      ) : (
                        <Bar
                          value={s.metPercent}
                          text={t('an.metBarShort', percent(s.metPercent) ?? '', num(s.metTarget) ?? '', num(s.figuresReported) ?? '')}
                        />
                      )}
                    </td>
                    <td className={'num' + (s.highOrCritical ? ' an-down' : '')}>
                      {s.scored === 0 ? '—' : t('an.ofCount', num(s.highOrCritical) ?? '', num(s.scored) ?? '')}
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

function channels(c: Record<string, number>, t: I18n['t']): string {
  return Object.entries(c)
    .map(([k, v]) => v + ' ' + (CHANNEL_KEYS[k] ? t(CHANNEL_KEYS[k]) : k.toLowerCase()))
    .join(', ');
}
