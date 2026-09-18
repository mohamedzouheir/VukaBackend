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
import { num, date } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { PageHead } from '../components/AppShell';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import { IconAlert, IconCheck, IconCheckCircle, IconClock, IconSpinner, IconTasks } from '../icons';

type Filter = 'OPEN' | 'DONE' | 'ALL';

export function Tasks() {
  const tasks = useAsync(() => api.myTasks(), []);
  const { t } = useI18n();
  const L = useLabels();
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
      setError(e instanceof Error ? e.message : t('tasks.notUpdated'));
    } finally {
      setBusy(null);
    }
  }

  if (tasks.loading) return <Loading what={t('tasks.what')} />;
  if (tasks.error) return <ErrorState message={tasks.error} onRetry={tasks.reload} />;

  return (
    <div>
      <PageHead
        icon={<IconTasks size={26} />}
        title={t('tasks.title')}
        subtitle={t('tasks.sub')}
      />

      <div className="tiles">
        <Tile icon={<IconTasks size={22} />} value={num(counts.open)} label={t('tasks.open')} sub={t('tasks.openSub')} />
        <Tile icon={<IconAlert size={22} />} tone="critical" value={num(counts.overdue)} label={t('tasks.overdue')} sub={t('tasks.overdueSub')} />
        <Tile icon={<IconCheckCircle size={22} />} tone="ok" value={num(counts.done)} label={t('tasks.done')} sub={t('tasks.doneSub')} />
      </div>

      {error ? <ErrorState message={error} /> : null}

      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <div className="section-head">
          <h2>{t('dash.myTasks')}</h2>
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
                {f === 'OPEN' ? t('tasks.open') : f === 'DONE' ? t('tasks.done') : t('common.all')}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState>
            {filter === 'OPEN' ? t('tasks.empty') : t('tasks.noneInView')}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('tasks.colTask')}</th>
                  <th>{t('tasks.colAssignedBy')}</th>
                  <th>{t('tasks.colDue')}</th>
                  <th>{t('tasks.colStatus')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const overdue =
                    row.status !== 'DONE' && row.dueDate !== null && row.dueDate < new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={row.id}>
                      <td>
                        <strong style={{ display: 'block', color: 'var(--navy-ink)' }}>
                          {row.title ?? t('tasks.untitled')}
                        </strong>
                        {row.description ? (
                          <span className="small muted">{row.description}</span>
                        ) : null}
                        {row.external ? (
                          <span className="chip chip-muted" style={{ marginLeft: 6 }}>
                            {t('tasks.external')}
                          </span>
                        ) : null}
                      </td>
                      <td className="small muted">{row.createdByName ?? t('common.notRecorded')}</td>
                      <td className="small">
                        {row.dueDate ? (
                          <span className={overdue ? 'row' : 'row muted'} style={{ gap: 5 }}>
                            <IconClock size={14} />
                            {date(row.dueDate)}
                          </span>
                        ) : (
                          <em className="muted">{t('tasks.noDueDate')}</em>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            'chip ' +
                            (row.status === 'DONE'
                              ? 'chip-ok'
                              : overdue
                                ? 'chip-danger'
                                : 'chip-muted')
                          }
                        >
                          {L.status(row.status)}
                        </span>
                      </td>
                      <td>
                        {row.status !== 'DONE' ? (
                          <button
                            type="button"
                            disabled={busy === row.id}
                            onClick={() => void setStatus(row, 'DONE')}
                          >
                            {busy === row.id ? <IconSpinner size={15} className="spin" /> : <IconCheck size={15} />}
                            {t('tasks.markDone')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="link"
                            disabled={busy === row.id}
                            onClick={() => void setStatus(row, 'OPEN')}
                          >
                            {t('tasks.reopen')}
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
