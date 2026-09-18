/*
 * Dashboard, the reviewer's landing screen.
 *
 * Nobody else comes here. The executive lands on the portfolio, the admin on the publication
 * register and the reporter on their own reporting screen (see Home in App.tsx), because a
 * dashboard that restated those is how every role came to open on the same screen.
 *
 * Modelled on the overview screens in docs/Front End designs/: a greeting, a row of stat tiles,
 * the substance, and a right rail of quick actions and tasks.
 *
 * What it does not copy from those screens is the charting. The designs carry a "Progress Over
 * Time" line from January to December and a "Performance by Sector" bar row. Nothing records a
 * figure per month, so that line would be invented. The sector rate is real, computed from
 * confirmed figures, and lives on Analytics with the other trends rather than being repeated here.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../lib/auth';
import type { PortfolioRow, SubmissionRow } from '../lib/types';
import { num, date, reviewPeriod } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { I18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { PageHead } from '../components/AppShell';
import { RiskPanel } from '../components/RiskPanel';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import { QueueRow } from './ReviewQueue';
import {
  IconAlert, IconCheckCircle, IconChevronRight, IconClock, IconFolder, IconHome, IconList,
  IconReturn, IconTasks, IconCitation,
} from '../icons';
import './ReviewQueue.css';
import './Dashboard.css';

export function Dashboard() {
  return <ReviewerToday />;
}

/* ------------------------------------------------------------------ */
/* The reviewer's day. Journey J3.                                     */
/* ------------------------------------------------------------------ */

/**
 * Lerato's question every morning is which three things to look at today. So the screen answers
 * it: four counts of what is waiting on whom, then the top three of the queue in the same risk
 * order and the same row the queue itself uses, each carrying its largest factor in words.
 *
 * It deliberately carries no portfolio totals and no rand figures. Those are the executive's, on
 * the executive's home, and repeating them here is how every DSAC screen came to look the same.
 */
function ReviewerToday() {
  const { me } = useAuth();
  const { t } = useI18n();
  const portfolio = useAsync(() => api.portfolio(), []);
  const periods = useAsync(() => api.periods(), []);
  const subs = useAsync(() => api.submissions(), []);
  const tasks = useAsync(() => api.myTasks(), []);
  const [explain, setExplain] = useState<PortfolioRow | null>(null);

  const period = useMemo(() => reviewPeriod(periods.data), [periods.data]);

  const byEntity = useMemo(() => {
    const map = new Map<string, SubmissionRow>();
    for (const s of subs.data ?? []) {
      if (period && s.periodId !== period.periodId) continue;
      map.set(s.entityId, s);
    }
    return map;
  }, [subs.data, period]);

  const counts = useMemo(() => {
    let awaiting = 0;
    let returned = 0;
    let approved = 0;
    let notFiled = 0;
    for (const e of portfolio.data ?? []) {
      const status = byEntity.get(e.entityId)?.status;
      if (status === 'SUBMITTED' || status === 'UNDER_REVIEW') awaiting++;
      else if (status === 'RETURNED') returned++;
      else if (status === 'APPROVED') approved++;
      else notFiled++;
    }
    return { total: (portfolio.data ?? []).length, awaiting, returned, approved, notFiled };
  }, [portfolio.data, byEntity]);

  // The API returns the portfolio in risk order, which is the queue's default order.
  const topThree = (portfolio.data ?? []).slice(0, 3);
  const openTasks = (tasks.data ?? []).filter((t) => t.status !== 'DONE');
  const ready = !portfolio.loading && !subs.loading;

  return (
    <div className="with-aside">
      <div>
        <PageHead
          icon={<IconHome size={26} />}
          title={greeting(me?.name ?? null, t)}
          subtitle={period ? t('dash.subTodayPeriod', period.label) : t('dash.subToday')}
        />

        {!ready ? (
          <Loading what={t('dash.whatQueue')} />
        ) : portfolio.error ? (
          <ErrorState message={portfolio.error} onRetry={portfolio.reload} />
        ) : (
          <>
            <div className="tiles">
              <Tile icon={<IconCitation size={22} />} tone="purple" value={num(counts.awaiting)} label={t('dash.awaiting')} sub={t('dash.awaitingSub')} />
              <Tile icon={<IconReturn size={22} />} tone="warn" value={num(counts.returned)} label={t('dash.returned')} sub={t('dash.returnedSub')} />
              <Tile icon={<IconClock size={22} />} tone="critical" value={num(counts.notFiled)} label={t('dash.nothingFiledTile')} sub={t('dash.nothingFiledSub')} />
              <Tile icon={<IconCheckCircle size={22} />} tone="ok" value={t('dash.reportedOf', num(counts.approved) ?? '', num(counts.total) ?? '')} label={t('dash.approved')} sub={t('dash.approvedSub')} />
            </div>

            <section className="dash-block">
              <div className="section-head">
                <h2>{t('dash.startThree')}</h2>
                <span className="spacer" />
                <Link to="/review" className="row" style={{ gap: 4, fontSize: '0.875rem', fontWeight: 600 }}>
                  {t('dash.wholeQueue')} <IconChevronRight size={15} />
                </Link>
              </div>
              <p className="small muted" style={{ marginTop: 0 }}>
                {t('dash.rankedNote')}
              </p>

              {topThree.length === 0 ? (
                <EmptyState>
                  {t('dash.noEntities')}
                </EmptyState>
              ) : (
                <ol className="queue">
                  {topThree.map((e) => (
                    <QueueRow key={e.entityId} entity={e} sub={byEntity.get(e.entityId) ?? null} onExplain={() => setExplain(e)} />
                  ))}
                </ol>
              )}

              {subs.error ? (
                <ErrorState
                  message={t('dash.rankingShown', subs.error)}
                  onRetry={subs.reload}
                />
              ) : null}
            </section>
          </>
        )}
      </div>

      <aside className="aside">
        <section className="card">
          <h2 style={{ marginBottom: 'var(--space-3)' }}>{t('dash.quickActions')}</h2>
          <div className="quick">
            <QuickLink to="/review" icon={<IconList size={18} />} tone="purple" title={t('dash.workQueue')} note={t('dash.workQueueNote')} />
            <QuickLink to="/risk" icon={<IconAlert size={18} />} tone="danger" title={t('nav.risk')} note={t('dash.riskNote')} />
            <QuickLink to="/documents" icon={<IconFolder size={18} />} tone="teal" title={t('dash.decideDocs')} note={t('dash.decideDocsNote')} />
          </div>
        </section>

        <TaskCard tasks={tasks} openTasks={openTasks} />
        <PeriodCard period={period} />
      </aside>

      {explain ? (
        <RiskPanel risk={explain} entityName={explain.name} onClose={() => setExplain(null)} />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail pieces.                                                  */
/* ------------------------------------------------------------------ */

const QUICK_TONES = {
  brand: { background: 'var(--brand-wash)', color: 'var(--brand)' },
  purple: { background: 'var(--purple-wash)', color: 'var(--purple)' },
  teal: { background: 'var(--teal-wash)', color: 'var(--teal)' },
  danger: { background: 'var(--danger-wash)', color: 'var(--band-critical)' },
} as const;

function QuickLink({
  to,
  icon,
  tone,
  title,
  note,
}: {
  to: string;
  icon: ReactNode;
  tone: keyof typeof QUICK_TONES;
  title: string;
  note: string;
}) {
  return (
    <Link to={to} className="quick-item">
      <span className="quick-icon" style={QUICK_TONES[tone]}>
        {icon}
      </span>
      <span>
        <strong>{title}</strong>
        <em>{note}</em>
      </span>
      <IconChevronRight size={16} className="muted" />
    </Link>
  );
}

function TaskCard({
  tasks,
  openTasks,
}: {
  tasks: { loading: boolean; error: string | null; reload: () => void };
  openTasks: { id: string; title: string | null; dueDate: string | null }[];
}) {
  const { t } = useI18n();
  return (
    <section className="card">
      <div className="section-head">
        <h2>{t('dash.myTasks')}</h2>
        <span className="spacer" />
        <Link to="/tasks" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
          {t('common.viewAll')}
        </Link>
      </div>
      {tasks.loading ? (
        <Loading what={t('dash.whatTasks')} />
      ) : tasks.error ? (
        <ErrorState message={tasks.error} onRetry={tasks.reload} />
      ) : openTasks.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          {t('dash.nothingAssigned')}
        </p>
      ) : (
        <ul className="tasklist">
          {openTasks.slice(0, 5).map((task) => (
            <li key={task.id}>
              <IconTasks size={16} className="muted" />
              <span>
                <strong>{task.title ?? t('tasks.untitled')}</strong>
                {task.dueDate ? <em>{t('dash.dueOn', date(task.dueDate) ?? '')}</em> : <em>{t('dash.noDueDate')}</em>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PeriodCard({
  period,
}: {
  period: { label: string; dueDate: string | null; daysRemaining: number | null; statutory: boolean } | null;
}) {
  const { t } = useI18n();
  const L = useLabels();
  if (!period) return null;
  return (
    <section className="card card-sunk">
      <h4 style={{ marginBottom: 6 }}>{period.label}</h4>
      <p className="row small" style={{ margin: 0, gap: 6 }}>
        <IconClock size={15} />
        <span>
          {t('dash.dueOn', date(period.dueDate) ?? t('dash.dueNotSet'))}
          {period.daysRemaining !== null ? ', ' + L.daysRemaining(period.daysRemaining) : null}
        </span>
      </p>
      <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>
        {/* statutory against departmental, which is law against an instruction. */}
        {period.statutory ? t('dash.statutoryPfma') : t('dash.notStatutoryPfma')}
      </p>
    </section>
  );
}

function greeting(name: string | null, t: I18n['t']): string {
  const h = new Date().getHours();
  const part = h < 12 ? t('dash.morning') : h < 17 ? t('dash.afternoon') : t('dash.evening');
  if (!name) return part;
  // "N. Mabaso" greeted as "N" read as a glitch. Where the first word is only an initial, use
  // the whole name as it was given.
  const first = name.trim().split(/\s+/)[0];
  return t('dash.greetingNamed', part, /^[A-Za-z]\.?$/.test(first) ? name.trim() : first);
}
