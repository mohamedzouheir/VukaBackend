/*
 * Analytics & Insights. The executive's screen.
 *
 * Every other oversight screen describes one reporting period. This one answers the question none
 * of them can: is it getting better? It reads one endpoint, /api/dashboard/analytics, and every
 * figure on it is either published (ENE allocations, the Auditor-General's outcomes and
 * targets-achieved counts) or confirmed by a named reporter in this system.
 *
 * <h2>Why this screen was rebuilt</h2>
 *
 * It used to be five tables and about nine hundred words of caveat. Every one of those words was
 * true and most of them were load-bearing, and it still failed the person it was written for: an
 * executive reads this between meetings and needs the shape of the thing in a glance, not a
 * document. So the shape is now drawn, the figures sit one click behind each picture, and the
 * caveats moved to the bottom where they can be read once rather than stepped over five times.
 *
 * Nothing was softened to do it. A year with no audited figure still draws no bar and says so. A
 * rate over nine audited entities one year and sixteen the next still refuses to be a trend. The
 * sector charts still put rands and delivery side by side and still never divide one by the other,
 * because a cost per outcome across a ballet company and a boxing regulator is not a comparison
 * this product makes.
 *
 * <h2>The two things it gained</h2>
 *
 * It can leave the building: the whole view downloads as a CSV, and the page prints to a committee
 * pack with the charts intact. And it can be asked a question: the button opens Karabo, which
 * answers from Vuka's records with the reader's own access and lists its sources.
 *
 * <h2>Language</h2>
 *
 * Every string here comes from the dictionaries, including the ones inside the charts and the
 * headers of the CSV. An export is a document somebody hands to somebody else, so a reader who
 * chose isiZulu should not be handed an English spreadsheet.
 */
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import type { AnalyticsCohort, AnalyticsQuarter, AnalyticsSector, AnalyticsView, AnalyticsYear } from '../lib/types';
import { date, num, percent, randsShort } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { I18n, Key } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import type { Labels } from '../lib/labels';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import { PageHead } from '../components/AppShell';
import { openKarabo } from '../components/AskKarabo';
import { Bars, Columns, Dumbbells, Figure, Legend, Stack, VIZ, type Datum, type Slice } from '../components/Charts';
import { IconChart, IconCheckCircle, IconClock, IconDownload, IconHelp, IconInfo, IconSheet, IconTrend } from '../icons';
import './Analytics.css';

/* Best to worst, and the order every stack and every table on this screen uses. */
const OUTCOME_ORDER = [
  'UNQUALIFIED', 'UNQUALIFIED_WITH_FINDINGS', 'QUALIFIED', 'ADVERSE', 'DISCLAIMER', 'OUTSTANDING',
];

/* WhatsApp is a product name and stays as it is in every language. The other three are
   ordinary words and are not. */
const CHANNEL_KEYS: Record<string, Key> = {
  WEB: 'an.chWeb', MOBILE: 'an.chPhone', WHATSAPP: 'an.chWhatsApp', EMAIL: 'an.chEmail',
};

/**
 * Audit outcome to colour.
 *
 * Four steps, not six. The three worst opinions share the critical step because six ordered
 * status colours cannot be told apart by a reader with a common colour vision deficiency, and a
 * palette that fails that test is not made acceptable by being pretty. They stay six separate
 * labelled rows in the stack's sentence and in the table, so nothing is merged in the record,
 * only in the fill. Outstanding is hatched grey: an absence, never a series.
 */
function outcomeColour(outcome: string): { colour: string; hatched?: boolean } {
  switch (outcome) {
    case 'UNQUALIFIED': return { colour: VIZ.good };
    case 'UNQUALIFIED_WITH_FINDINGS': return { colour: VIZ.warn };
    case 'OUTSTANDING': return { colour: VIZ.none, hatched: true };
    default: return { colour: VIZ.bad };
  }
}

export function Analytics() {
  const data = useAsync(() => api.analytics(), []);
  const i18n = useI18n();
  const { t } = i18n;
  const L = useLabels();

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
        subtitle={t('an.subtitleCharts')}
      />

      {/* The three things an executive does with this screen: ask it something, take it away,
          put it in front of a committee. They belong at the top, beside the title, rather than
          at the bottom of a page they may never scroll to. */}
      <div className="an-tools no-print">
        <button type="button" className="primary" onClick={openKarabo}>
          <IconHelp size={16} /> {t('karabo.ask')}
        </button>
        <button type="button" onClick={() => downloadCsv(a, i18n, L)}>
          <IconSheet size={16} /> {t('an.downloadCsv')}
        </button>
        <button type="button" onClick={() => window.print()}>
          <IconDownload size={16} /> {t('an.printPdf')}
        </button>
      </div>

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
          sub={
            a.cohort
              ? t('an.tileMovedSub', a.cohort.fromYear, a.cohort.toYear, num(a.cohort.entities) ?? '')
              : t('an.tileMovedNone')
          }
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

      <MoneyAndDelivery years={a.years} />
      <Outcomes years={a.years} />
      <Filing
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
      <Movers cohort={a.cohort} />

      <details className="card an-sources">
        <summary>{t('an.sourcesSummary')}</summary>
        <p>{t('an.sourcesA')}</p>
        <p>{t('an.sourcesB')}</p>
      </details>

    </div>
  );
}

/* ------------------------------------------------------------------ */
/* money and delivery, side by side and never divided                  */
/* ------------------------------------------------------------------ */

function MoneyAndDelivery({ years }: { years: AnalyticsYear[] }) {
  const { t } = useI18n();

  if (years.length === 0) {
    return (
      <div className="card an-section">
        <h2>{t('an.yearOnYear')}</h2>
        <EmptyState>{t('an.yearOnYearNone')}</EmptyState>
      </div>
    );
  }

  const moneyData: Datum[] = years.map((y) => ({
    key: y.financialYear,
    label: y.financialYear,
    value: y.allocated,
    note: randsShort(y.allocated) ?? '',
    detail: t('an.allocatedDetail', y.financialYear, randsShort(y.allocated) ?? t('an.notOnRecord')),
    absentText: t('an.notOnRecord'),
    emphasis: y.current,
  }));

  const deliveryData: Datum[] = years.map((y) => ({
    key: y.financialYear,
    label: y.financialYear,
    value: y.achievedPercent,
    note: y.achievedPercent === null ? '' : percent(y.achievedPercent) ?? '',
    detail:
      y.achievedPercent === null
        ? t('an.noPublishedCount', y.financialYear)
        : t(
            'an.achievedDetail',
            y.financialYear,
            num(y.targetsAchieved) ?? '',
            num(y.targetsTotal) ?? '',
            num(y.entitiesWithCounts) ?? '',
          ),
    absentText:
      y.entitiesAudited > 0
        ? t('an.countsNotPublished')
        : y.current
          ? t('an.inYearShort')
          : t('an.notAuditedShort'),
    emphasis: y.current,
  }));

  const counted = years.filter((y) => y.entitiesWithCounts > 0);
  const mixed = counted.length > 1 && new Set(counted.map((y) => y.entitiesWithCounts)).size > 1;

  return (
    <div className="card an-section">
      <h2>{t('an.moneyAndDelivery')}</h2>
      <div className="viz-pair">
        <Figure title={t('an.figAllocated')} hint={t('an.figAllocatedHint')} table={<YearTable years={years} money />}>
          <Columns data={moneyData} label={t('an.chartAllocationLabel')} colour={VIZ.cat[0]} />
        </Figure>

        <Figure title={t('an.figAchieved')} hint={t('an.figAchievedHint')} table={<YearTable years={years} />}>
          <Columns data={deliveryData} label={t('an.chartAchievedLabel')} colour={VIZ.cat[1]} />
        </Figure>
      </div>

      {/* Two charts rather than one with a second scale. A rands axis and a per-cent axis on the
          same picture is the most common way a chart lies, and it is not available here. */}
      {mixed ? (
        <p className="an-note">
          <IconInfo size={16} />
          <span>{t('an.twoChartsNote')}</span>
        </p>
      ) : null}
    </div>
  );
}

function YearTable({ years, money = false }: { years: AnalyticsYear[]; money?: boolean }) {
  const { t } = useI18n();
  return (
    <table>
      <thead>
        <tr>
          <th>{t('an.colYear')}</th>
          {money ? <th className="num">{t('an.colAllocated')}</th> : null}
          {money ? <th className="num">{t('an.colChange')}</th> : null}
          {money ? null : <th className="num">{t('an.colAchieved')}</th>}
          {money ? null : <th className="num">{t('an.colOf')}</th>}
          {money ? null : <th className="num">{t('an.colEntitiesCounted')}</th>}
        </tr>
      </thead>
      <tbody>
        {years.map((y, i) => {
          const prev = i > 0 ? years[i - 1].allocated : null;
          const change =
            y.allocated !== null && prev !== null && prev > 0 ? ((y.allocated - prev) / prev) * 100 : null;
          return (
            <tr key={y.financialYear}>
              <td>
                <strong>{y.financialYear}</strong>
                {y.current ? <span className="muted small"> {t('an.current')}</span> : null}
              </td>
              {money ? <td className="num">{randsShort(y.allocated) ?? '—'}</td> : null}
              {money ? <td className="num">{change === null ? '—' : signed(change, '%')}</td> : null}
              {money ? null : <td className="num">{y.targetsAchieved === null ? '—' : num(y.targetsAchieved)}</td>}
              {money ? null : <td className="num">{y.targetsTotal === null ? '—' : num(y.targetsTotal)}</td>}
              {money ? null : <td className="num">{num(y.entitiesWithCounts)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/* audit outcomes                                                      */
/* ------------------------------------------------------------------ */

function Outcomes({ years }: { years: AnalyticsYear[] }) {
  const { t } = useI18n();
  const L = useLabels();
  const withOutcomes = years.filter((y) => Object.values(y.outcomes).some((n) => n > 0));
  if (withOutcomes.length === 0) return null;

  return (
    <div className="card an-section">
      <h2>{t('an.auditOutcomes')}</h2>
      <Figure title={t('an.figOpinions')} hint={t('an.figOpinionsHint')} table={<OutcomeTable years={withOutcomes} />}>
        <Legend
          items={[
            { label: t('an.legendUnqualified'), colour: VIZ.good },
            { label: t('an.legendWithFindings'), colour: VIZ.warn },
            { label: t('an.legendWorse'), colour: VIZ.bad },
            { label: t('an.legendOutstanding'), colour: VIZ.none, hatched: true },
          ]}
        />
        <div className="an-stacks">
          {withOutcomes.map((y) => {
            const present = OUTCOME_ORDER.filter((o) => y.outcomes[o]);
            const slices: Slice[] = present.map((o) => ({
              key: o,
              label: L.outcome(o),
              value: y.outcomes[o],
              ...outcomeColour(o),
            }));
            const summary = present.map((o) => y.outcomes[o] + ' ' + L.outcome(o).toLowerCase()).join(', ');
            return (
              <div key={y.financialYear} className="an-stack-row">
                <span className="viz-row-label">{y.financialYear}</span>
                <Stack slices={slices} label={y.financialYear + ': ' + summary} />
                <span className="an-stack-words small muted">{summary}</span>
              </div>
            );
          })}
        </div>
      </Figure>
    </div>
  );
}

function OutcomeTable({ years }: { years: AnalyticsYear[] }) {
  const { t } = useI18n();
  const L = useLabels();
  const present = OUTCOME_ORDER.filter((o) => years.some((y) => y.outcomes[o]));
  return (
    <table>
      <thead>
        <tr>
          <th>{t('an.colYear')}</th>
          {present.map((o) => (
            <th key={o} className="num">{L.outcome(o)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {years.map((y) => (
          <tr key={y.financialYear}>
            <td><strong>{y.financialYear}</strong></td>
            {present.map((o) => (
              <td key={o} className="num">{y.outcomes[o] ? num(y.outcomes[o]) : '—'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/* filing, quarter by quarter                                          */
/* ------------------------------------------------------------------ */

function Filing({
  quarters, year, reviewId, withoutTargets,
}: { quarters: AnalyticsQuarter[]; year: string | null; reviewId: string | null; withoutTargets: number }) {
  const { t } = useI18n();
  const active = quarters.filter((q) => q.open || q.filed > 0 || q.drafts > 0);

  if (active.length === 0) {
    return (
      <div className="card an-section">
        <h2>{year ? t('an.filingYear', year) : t('an.filing')}</h2>
        <EmptyState>{t('an.noQuarterOpen')}</EmptyState>
      </div>
    );
  }

  const met: Datum[] = active.map((q) => ({
    key: q.periodId,
    label: shortQuarter(q.label),
    value: q.metPercent,
    note: q.metPercent === null ? '' : percent(q.metPercent) ?? '',
    detail:
      q.metPercent === null
        ? t('an.noFiguresConfirmedFor', q.label)
        : t('an.metDetail', q.label, num(q.metTarget) ?? '', num(q.metTarget + q.belowTarget) ?? ''),
    absentText: t('an.noneFiled'),
    emphasis: q.periodId === reviewId,
  }));

  return (
    <div className="card an-section">
      <h2>{year ? t('an.filingYear', year) : t('an.filing')}</h2>
      <div className="viz-pair">
        <Figure
          title={t('an.figWhoFiled')}
          hint={t('an.figWhoFiledHint')}
          table={<QuarterTable quarters={active} reviewId={reviewId} />}
        >
          <Legend
            items={[
              { label: t('an.colOnTime'), colour: VIZ.good },
              { label: t('an.colLate'), colour: VIZ.warn },
              { label: t('an.colNotFiled'), colour: VIZ.bad },
              { label: t('an.legendNotDue'), colour: VIZ.none, hatched: true },
            ]}
          />
          <div className="an-stacks">
            {active.map((q) => {
              const notDue = q.notFiled === null ? Math.max(0, q.expected - q.filed) : 0;
              const slices: Slice[] = [
                { key: 'on', label: t('an.colOnTime'), value: q.onTime, colour: VIZ.good },
                { key: 'late', label: t('an.colLate'), value: q.late, colour: VIZ.warn },
                { key: 'no', label: t('an.colNotFiled'), value: q.notFiled ?? 0, colour: VIZ.bad },
                { key: 'due', label: t('an.legendNotDue'), value: notDue, colour: VIZ.none, hatched: true },
              ];
              const words =
                t('an.filingWords', num(q.onTime) ?? '', num(q.late) ?? '') +
                (q.notFiled === null
                  ? t('an.filingWordsNotDue', num(notDue) ?? '')
                  : t('an.filingWordsNotFiled', num(q.notFiled) ?? ''));
              return (
                <div
                  key={q.periodId}
                  className={'an-stack-row' + (q.periodId === reviewId ? ' an-current' : '')}
                >
                  <span className="viz-row-label">{shortQuarter(q.label)}</span>
                  <Stack slices={slices} label={q.label + ': ' + words} />
                  <span className="an-stack-words small muted">{words}</span>
                </div>
              );
            })}
          </div>
        </Figure>

        <Figure title={t('an.figMet')} hint={t('an.figMetHint')} table={<MetTable quarters={active} />}>
          <Columns data={met} label={t('an.chartMetLabel')} colour={VIZ.cat[2]} />
        </Figure>
      </div>

      {withoutTargets > 0 ? (
        <p className="an-note">
          <IconInfo size={16} />
          <span>
            {t(
              'an.withoutTargets',
              num(withoutTargets) ?? '',
              num(active[0]?.expected ?? 0) ?? '',
              year ?? t('an.thisYear'),
            )}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function QuarterTable({ quarters, reviewId }: { quarters: AnalyticsQuarter[]; reviewId: string | null }) {
  const { t } = useI18n();
  return (
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
          <th className="num">{t('an.colHighCritical')}</th>
        </tr>
      </thead>
      <tbody>
        {quarters.map((q) => (
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
            <td className="num">{num(q.late)}</td>
            <td className="num">
              {q.notFiled === null ? <span className="muted small">{t('an.notDue')}</span> : num(q.notFiled)}
            </td>
            <td className="small">
              {q.filed === 0
                ? '—'
                : t('an.reviewSplit', num(q.approved) ?? '', num(q.returned) ?? '', num(q.awaitingReview) ?? '')}
            </td>
            <td className="num">
              {q.scored === 0 ? (
                <span className="muted small">{t('an.notScored')}</span>
              ) : (
                t('an.ofCount', num(q.highOrCritical) ?? '', num(q.scored) ?? '')
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MetTable({ quarters }: { quarters: AnalyticsQuarter[] }) {
  const { t } = useI18n();
  return (
    <table>
      <thead>
        <tr>
          <th>{t('an.colQuarter')}</th>
          <th className="num">{t('an.colMetShort')}</th>
          <th className="num">{t('an.colBelow')}</th>
          <th className="num">{t('an.colNoFigure')}</th>
          <th className="num">{t('an.colApproved')}</th>
        </tr>
      </thead>
      <tbody>
        {quarters.map((q) => (
          <tr key={q.periodId}>
            <td><strong>{q.label}</strong></td>
            <td className="num">{num(q.metTarget)}</td>
            <td className="num">{num(q.belowTarget)}</td>
            <td className="num">{num(q.noFigure)}</td>
            <td className="num">
              {q.figuresReported
                ? t('an.ofCount', num(q.figuresVerified) ?? '', num(q.figuresReported) ?? '')
                : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/* by sector                                                           */
/* ------------------------------------------------------------------ */

function Sectors({
  sectors, periodLabel, year, earliest,
}: { sectors: AnalyticsSector[]; periodLabel: string | null; year: string | null; earliest: string | null }) {
  const { t } = useI18n();
  const L = useLabels();

  if (sectors.length === 0) {
    return (
      <div className="card an-section">
        <h2>{t('an.bySector')}</h2>
        <EmptyState>{t('an.noSectorSplit')}</EmptyState>
      </div>
    );
  }

  const byMoney = [...sectors].sort((x, y) => (y.allocated ?? 0) - (x.allocated ?? 0));

  const moneyData: Datum[] = byMoney.map((s) => ({
    key: s.sector,
    label: L.sector(s.sector),
    value: s.allocated,
    note: randsShort(s.allocated) ?? '—',
    detail: t(
      'an.sectorMoneyDetail',
      L.sector(s.sector),
      randsShort(s.allocated) ?? t('an.notOnRecord'),
      num(s.entities) ?? '',
    ),
    absentText: t('an.notOnRecord'),
  }));

  const deliveryData: Datum[] = byMoney.map((s) => ({
    key: s.sector,
    label: L.sector(s.sector),
    value: s.metPercent,
    note: s.metPercent === null ? '—' : percent(s.metPercent) ?? '',
    detail:
      s.metPercent === null
        ? t('an.sectorNoFigures', L.sector(s.sector))
        : t('an.sectorMetDetail', L.sector(s.sector), num(s.metTarget) ?? '', num(s.figuresReported) ?? ''),
    absentText: t('an.noFiguresFiled'),
  }));

  return (
    <div className="card an-section">
      <h2>{periodLabel ? t('an.bySectorPeriod', periodLabel) : t('an.bySector')}</h2>
      <div className="viz-pair">
        <Figure
          title={t('an.colAllocated')}
          hint={year ?? undefined}
          table={<SectorTable sectors={byMoney} earliest={earliest} year={year} />}
        >
          <Bars data={moneyData} label={t('an.chartSectorMoneyLabel')} colour={VIZ.cat[0]} />
        </Figure>
        <Figure
          title={t('an.figMet')}
          hint={t('an.figSectorMetHint')}
          table={<SectorTable sectors={byMoney} earliest={earliest} year={year} />}
        >
          <Bars data={deliveryData} label={t('an.chartSectorMetLabel')} colour={VIZ.cat[1]} />
        </Figure>
      </div>
      {/* The rule this screen will not break, stated once rather than under every chart. */}
      <p className="an-note">
        <IconInfo size={16} />
        <span>{t('an.neverDivided')}</span>
      </p>
    </div>
  );
}

function SectorTable({ sectors, earliest, year }: { sectors: AnalyticsSector[]; earliest: string | null; year: string | null }) {
  const { t } = useI18n();
  const L = useLabels();
  const showChange = earliest !== null && earliest !== year;
  return (
    <table>
      <thead>
        <tr>
          <th>{t('an.colSector')}</th>
          <th className="num">{t('an.colEntities')}</th>
          <th className="num">{t('an.colAllocated')}</th>
          {showChange ? <th className="num">{t('an.colSince', earliest ?? '')}</th> : null}
          <th className="num">{t('an.colFiled')}</th>
          <th className="num">{t('an.colMet')}</th>
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
              <td className="num">
                {s.metPercent === null
                  ? '—'
                  : t('an.metBar', percent(s.metPercent) ?? '', num(s.metTarget) ?? '', num(s.figuresReported) ?? '')}
              </td>
              <td className="num">
                {s.scored === 0 ? '—' : t('an.ofCount', num(s.highOrCritical) ?? '', num(s.scored) ?? '')}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/* who moved                                                           */
/* ------------------------------------------------------------------ */

function Movers({ cohort }: { cohort: AnalyticsCohort | null }) {
  const { t } = useI18n();

  if (!cohort || cohort.entities === 0) {
    return (
      <div className="card an-section">
        <h2>{t('an.whoMoved')}</h2>
        <EmptyState>{t('an.whoMovedNone')}</EmptyState>
      </div>
    );
  }

  const rows = cohort.rows.map((m) => ({
    key: m.entityId,
    label: m.shortName ?? m.name,
    from: Math.max(0, Math.min(100, m.fromPercent)),
    to: Math.max(0, Math.min(100, m.toPercent)),
    detail: t(
      'an.moverDetail',
      m.name,
      percent(m.fromPercent) ?? '',
      cohort.fromYear,
      percent(m.toPercent) ?? '',
      cohort.toYear,
      String(m.fromAchieved),
      String(m.fromTotal),
      String(m.toAchieved),
      String(m.toTotal),
    ),
  }));

  return (
    <div className="card an-section">
      <h2>{t('an.whoMovedYears', cohort.fromYear, cohort.toYear)}</h2>
      <Figure
        title={t('an.figMovers', num(cohort.entities) ?? '')}
        hint={t(
          'an.figMoversHint',
          percent(cohort.fromPercent) ?? '',
          percent(cohort.toPercent) ?? '',
          num(cohort.improved) ?? '',
          num(cohort.declined) ?? '',
        )}
        table={<MoverTable cohort={cohort} />}
        wide
      >
        <Dumbbells rows={rows} fromLabel={cohort.fromYear} toLabel={cohort.toYear} />
      </Figure>
    </div>
  );
}

function MoverTable({ cohort }: { cohort: AnalyticsCohort }) {
  const { t } = useI18n();
  const L = useLabels();
  return (
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
            <td><Link to={'/portfolio/entity/' + m.entityId}>{m.name}</Link></td>
            <td>{L.sector(m.sector)}</td>
            <td className="num" title={`${m.fromAchieved} / ${m.fromTotal}`}>{percent(m.fromPercent)}</td>
            <td className="num" title={`${m.toAchieved} / ${m.toTotal}`}>{percent(m.toPercent)}</td>
            <td className={'num ' + (m.changePoints < 0 ? 'an-down' : m.changePoints > 0 ? 'an-up' : '')}>
              {signed(m.changePoints, ' pts')}
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
  );
}

/* ------------------------------------------------------------------ */
/* export                                                              */
/* ------------------------------------------------------------------ */

/**
 * The whole view as one CSV, built here rather than on the server.
 *
 * It is the same data the screen is drawn from, in the same order, so a figure quoted from the
 * spreadsheet and a figure quoted from the screen cannot disagree. A blank cell means not
 * published, and the header says so, because a blank turned into a nought somewhere between here
 * and a committee pack is the failure this whole product exists to stop.
 *
 * Headed in the reader's language, because an export is a document somebody hands to somebody
 * else. The figures themselves are figures in every language.
 */
function analyticsCsv(a: AnalyticsView, { t }: I18n, L: Labels): string {
  const out: string[][] = [];
  const cell = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));

  out.push([t('an.csvTitle')]);
  out.push([t('an.csvGenerated'), new Date().toISOString()]);
  out.push([t('an.csvCurrentYear'), cell(a.currentYear)]);
  out.push([t('an.csvReviewPeriod'), cell(a.reviewPeriodLabel)]);
  out.push([t('an.csvBlankMeans')]);
  out.push([]);

  out.push([t('an.yearOnYear')]);
  out.push([
    t('an.colYear'), t('an.csvAllocatedRand'), t('an.csvEntitiesFunded'), t('an.csvEntitiesAudited'),
    t('an.colEntitiesCounted'), t('an.colAchieved'), t('an.csvTargetsTotal'), t('an.csvAchievedPercent'),
    t('an.csvRepeatFindings'), ...OUTCOME_ORDER.map((o) => L.outcome(o)),
  ]);
  for (const y of a.years) {
    out.push([
      y.financialYear, cell(y.allocated), cell(y.entitiesFunded), cell(y.entitiesAudited),
      cell(y.entitiesWithCounts), cell(y.targetsAchieved), cell(y.targetsTotal),
      y.achievedPercent === null ? '' : y.achievedPercent.toFixed(1), cell(y.repeatFindings),
      ...OUTCOME_ORDER.map((o) => cell(y.outcomes[o] || '')),
    ]);
  }
  out.push([]);

  out.push([t('an.quarterByQuarter'), cell(a.currentYear)]);
  out.push([
    t('an.colQuarter'), t('an.colDue'), t('an.csvExpected'), t('an.colFiled'), t('an.colOnTime'),
    t('an.colLate'), t('an.colNotFiled'), t('an.csvDrafts'), t('an.colApproved'), t('an.csvReturned'),
    t('an.csvAwaitingReview'), t('an.csvFiguresReported'), t('an.colMet'), t('an.colBelow'),
    t('an.colNoFigure'), t('an.csvFiguresApproved'), t('an.csvMetPercent'), t('an.csvScored'),
    t('an.colHighCritical'),
  ]);
  for (const q of a.quarters) {
    out.push([
      q.label, cell(q.dueDate), cell(q.expected), cell(q.filed), cell(q.onTime), cell(q.late),
      q.notFiled === null ? '' : String(q.notFiled), cell(q.drafts), cell(q.approved), cell(q.returned),
      cell(q.awaitingReview), cell(q.figuresReported), cell(q.metTarget), cell(q.belowTarget),
      cell(q.noFigure), cell(q.figuresVerified), q.metPercent === null ? '' : q.metPercent.toFixed(1),
      cell(q.scored), cell(q.highOrCritical),
    ]);
  }
  out.push([]);

  out.push([t('an.bySector'), cell(a.reviewPeriodLabel)]);
  out.push([
    t('an.colSector'), t('an.colEntities'), t('an.csvAllocatedRand'), t('an.csvAllocatedEarliest'),
    t('an.colFiled'), t('an.csvExpected'), t('an.csvFiguresReported'), t('an.colMet'),
    t('an.csvMetPercent'), t('an.csvScored'), t('an.colHighCritical'),
  ]);
  for (const s of a.sectors) {
    out.push([
      L.sector(s.sector), cell(s.entities), cell(s.allocated), cell(s.allocatedEarliest), cell(s.filed),
      cell(s.expected), cell(s.figuresReported), cell(s.metTarget),
      s.metPercent === null ? '' : s.metPercent.toFixed(1), cell(s.scored), cell(s.highOrCritical),
    ]);
  }
  out.push([]);

  if (a.cohort) {
    out.push([
      t('an.whoMoved'),
      a.cohort.fromYear + ' - ' + a.cohort.toYear,
      t('an.csvCohortNote', String(a.cohort.entities)),
    ]);
    out.push([
      t('an.colEntity'), t('an.colSector'),
      a.cohort.fromYear + ' ' + t('an.colAchieved'), a.cohort.fromYear + ' ' + t('an.csvTargetsTotal'),
      a.cohort.fromYear + ' %', a.cohort.toYear + ' ' + t('an.colAchieved'),
      a.cohort.toYear + ' ' + t('an.csvTargetsTotal'), a.cohort.toYear + ' %',
      t('an.csvChangePoints'), a.cohort.fromYear + ' ' + t('an.colOutcome'),
      a.cohort.toYear + ' ' + t('an.colOutcome'),
    ]);
    for (const m of a.cohort.rows) {
      out.push([
        m.name, L.sector(m.sector), cell(m.fromAchieved), cell(m.fromTotal), m.fromPercent.toFixed(1),
        cell(m.toAchieved), cell(m.toTotal), m.toPercent.toFixed(1), m.changePoints.toFixed(1),
        cell(m.fromOutcome && L.outcome(m.fromOutcome)), cell(m.toOutcome && L.outcome(m.toOutcome)),
      ]);
    }
    out.push([]);
  }

  out.push([t('an.csvSources')]);
  out.push([t('an.colAllocated'), t('an.csvSourceAllocations')]);
  out.push([t('an.colOutcomes'), t('an.csvSourceOutcomes')]);
  out.push([t('an.csvQuarterlyFigures'), t('an.csvSourceQuarterly')]);

  return out
    .map((row) => row.map((c) => (/[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(','))
    .join('\r\n');
}

function downloadCsv(a: AnalyticsView, i18n: I18n, L: Labels) {
  // A BOM, because this file is opened in Excel on a Windows desktop more often than anywhere
  // else, and without it the rand sign and the isiXhosa diacritics arrive mangled.
  const blob = new Blob(['﻿' + analyticsCsv(a, i18n, L)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'vuka-analytics-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- pieces ---------- */

/** "Q1 2026/27" becomes "Q1". An axis has room for a label, not for a sentence. */
function shortQuarter(label: string): string {
  return label.replace(/\s+\d{4}\/\d{2}.*$/, '');
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
