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
 * Time" line from January to December and a "Performance by Sector" bar row, and nothing in the
 * schema records a figure per month or a sector rate. Drawing either would mean inventing the
 * numbers, in a product whose entire argument is that a figure carries the cell it came from.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../lib/auth';
import type { PortfolioRow, SubmissionRow } from '../lib/types';
import { num, date, daysRemainingText, reviewPeriod } from '../lib/format';
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
          title={greeting(me?.name ?? null)}
          subtitle={
            'Which three entities to look at first' +
            (period ? ' for ' + period.label : '') +
            ', and what is waiting on your decision.'
          }
        />

        {!ready ? (
          <Loading what="the queue" />
        ) : portfolio.error ? (
          <ErrorState message={portfolio.error} onRetry={portfolio.reload} />
        ) : (
          <>
            <div className="tiles">
              <Tile icon={<IconCitation size={22} />} tone="purple" value={num(counts.awaiting)} label="Awaiting your decision" sub="Submitted, not yet approved or returned" />
              <Tile icon={<IconReturn size={22} />} tone="warn" value={num(counts.returned)} label="Returned" sub="With the entity, disputed figures reopened" />
              <Tile icon={<IconClock size={22} />} tone="critical" value={num(counts.notFiled)} label="Nothing filed" sub="Ranked in the queue all the same" />
              <Tile icon={<IconCheckCircle size={22} />} tone="ok" value={num(counts.approved) + ' of ' + num(counts.total)} label="Approved" sub="Each in a reviewer's name" />
            </div>

            <section className="dash-block">
              <div className="section-head">
                <h2>Start with these three</h2>
                <span className="spacer" />
                <Link to="/review" className="row" style={{ gap: 4, fontSize: '0.875rem', fontWeight: 600 }}>
                  The whole queue, ranked <IconChevronRight size={15} />
                </Link>
              </div>
              <p className="small muted" style={{ marginTop: 0 }}>
                Ranked by risk, not by date received. Click a score for the five signals behind it.
              </p>

              {topThree.length === 0 ? (
                <EmptyState>
                  No entities are registered. This is an empty register rather than a clean portfolio.
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
                  message={'The ranking is shown, but submission states could not be read. ' + subs.error}
                  onRetry={subs.reload}
                />
              ) : null}
            </section>
          </>
        )}
      </div>

      <aside className="aside">
        <section className="card">
          <h2 style={{ marginBottom: 'var(--space-3)' }}>Quick actions</h2>
          <div className="quick">
            <QuickLink to="/review" icon={<IconList size={18} />} tone="purple" title="Work the review queue" note="Every entity, including those that filed nothing" />
            <QuickLink to="/risk" icon={<IconAlert size={18} />} tone="danger" title="Risk & Alerts" note="Recompute scores after a submission lands" />
            <QuickLink to="/documents" icon={<IconFolder size={18} />} tone="teal" title="Decide on documents" note="Receipts and approvals, per entity" />
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
  return (
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
  );
}

function PeriodCard({
  period,
}: {
  period: { label: string; dueDate: string | null; daysRemaining: number | null; statutory: boolean } | null;
}) {
  if (!period) return null;
  return (
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
  );
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
