/*
 * Tasks.
 *
 * In the rail of docs/Front End designs/ this carries a count badge, and until the
 * accessibility-and-languages branch landed there was nothing behind it: TaskItem existed in the
 * schema and no endpoint read it. There is one now, /api/workspace/tasks/mine, so this screen and
 * the badge are both real.
 *
 * Status is the enum the backend stores, OPEN, IN_PROGRESS and DONE, rather than a friendlier
 * set invented here. A screen that shows a state the database cannot hold is a screen that will
 * disagree with the database.
 */
import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import type { WorkspaceTask } from '../lib/types';
import { date, num, statusLabel } from '../lib/format';
import { PageHead } from '../components/AppShell';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import { IconAlert, IconCheck, IconCheckCircle, IconClock, IconSpinner, IconTasks } from '../icons';

type Filter = 'OPEN' | 'DONE' | 'ALL';

export function Tasks() {
  const tasks = useAsync(() => api.myTasks(), []);
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = tasks.data ?? [];
  const rows = useMemo(() => {
    if (filter === 'ALL') return all;
    if (filter === 'DONE') return all.filter((t) => t.status === 'DONE');
    return all.filter((t) => t.status !== 'DONE');
  }, [all, filter]);

  const counts = useMemo(() => {
    const open = all.filter((t) => t.status !== 'DONE');
    const today = new Date().toISOString().slice(0, 10);
    return {
      open: open.length,
      overdue: open.filter((t) => t.dueDate !== null && t.dueDate < today).length,
      done: all.filter((t) => t.status === 'DONE').length,
    };
  }, [all]);

  async function setStatus(task: WorkspaceTask, status: string) {
    setBusy(task.id);
    setError(null);
    try {
      await api.setTaskStatus(task.id, status);
      tasks.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The task was not updated.');
    } finally {
      setBusy(null);
    }
  }

  if (tasks.loading) return <Loading what="your tasks" />;
  if (tasks.error) return <ErrorState message={tasks.error} onRetry={tasks.reload} />;

  return (
    <div>
      <PageHead
        icon={<IconTasks size={26} />}
        title="Tasks"
        subtitle="What is assigned to you, and what is waiting on somebody else."
      />

      <div className="tiles">
        <Tile icon={<IconTasks size={22} />} value={num(counts.open)} label="Open" sub="Assigned to you" />
        <Tile icon={<IconAlert size={22} />} tone="critical" value={num(counts.overdue)} label="Overdue" sub="Past the due date" />
        <Tile icon={<IconCheckCircle size={22} />} tone="ok" value={num(counts.done)} label="Done" sub="Closed by you" />
      </div>

      {error ? <ErrorState message={error} /> : null}

      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <div className="section-head">
          <h2>My tasks</h2>
          <span className="spacer" />
          <div className="row" style={{ gap: 6 }}>
            {(['OPEN', 'DONE', 'ALL'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={'filter-pill' + (filter === f ? ' filter-on' : '')}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === 'OPEN' ? 'Open' : f === 'DONE' ? 'Done' : 'All'}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState>
            {filter === 'OPEN'
              ? 'Nothing is assigned to you. That is an empty queue rather than nothing to do.'
              : 'No tasks in this view.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Assigned by</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const overdue =
                    t.status !== 'DONE' && t.dueDate !== null && t.dueDate < new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={t.id}>
                      <td>
                        <strong style={{ display: 'block', color: 'var(--navy-ink)' }}>
                          {t.title ?? 'Untitled task'}
                        </strong>
                        {t.description ? (
                          <span className="small muted">{t.description}</span>
                        ) : null}
                        {t.external ? (
                          <span className="chip chip-muted" style={{ marginLeft: 6 }}>
                            external
                          </span>
                        ) : null}
                      </td>
                      <td className="small muted">{t.createdByName ?? 'not recorded'}</td>
                      <td className="small">
                        {t.dueDate ? (
                          <span className={overdue ? 'row' : 'row muted'} style={{ gap: 5 }}>
                            <IconClock size={14} />
                            {date(t.dueDate)}
                          </span>
                        ) : (
                          <em className="muted">no due date</em>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            'chip ' +
                            (t.status === 'DONE'
                              ? 'chip-ok'
                              : overdue
                                ? 'chip-danger'
                                : 'chip-muted')
                          }
                        >
                          {statusLabel(t.status)}
                        </span>
                      </td>
                      <td>
                        {t.status !== 'DONE' ? (
                          <button
                            type="button"
                            disabled={busy === t.id}
                            onClick={() => void setStatus(t, 'DONE')}
                          >
                            {busy === t.id ? <IconSpinner size={15} className="spin" /> : <IconCheck size={15} />}
                            Mark done
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="link"
                            disabled={busy === t.id}
                            onClick={() => void setStatus(t, 'OPEN')}
                          >
                            Reopen
                          </button>
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
    </div>
  );
}
