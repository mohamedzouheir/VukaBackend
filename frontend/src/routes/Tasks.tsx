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
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { can, useAuth } from '../lib/auth';
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
  const { me } = useAuth();
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

      {can(me, 'PARTICIPATE') ? <NewTaskForm onCreated={tasks.reload} /> : null}

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

/**
 * Setting a task. The challenge asks for tasks set "internally and externally (up or down in the
 * operations process)", and whether a task is external is not asked here: the server derives it
 * from who set it and who has to do it, so it cannot be ticked wrongly.
 *
 * A reporter can only set tasks on their own entity, so there is nothing to choose. The Department
 * picks the entity first, and the people list is then the Department plus that entity's reporters.
 */
function NewTaskForm({ onCreated }: { onCreated: () => void }) {
  const { me } = useAuth();
  const ownEntity = me?.entityId ?? null;
  const portfolio = useAsync(() => api.portfolio(), [], ownEntity === null);

  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState<string>(ownEntity ?? '');
  const [assignee, setAssignee] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const people = useAsync(() => api.taskPeople(entityId), [entityId], open && entityId !== '');
  useEffect(() => setAssignee(''), [entityId]);

  const choices = (people.data ?? []).filter((p) => p.uid !== me?.uid);
  const ready = entityId !== '' && assignee !== '' && title.trim() !== '';

  async function save() {
    const person = choices.find((p) => p.uid === assignee);
    setSaving(true);
    setFailure(null);
    setMessage(null);
    try {
      await api.createTask(entityId, {
        title: title.trim(),
        description: description.trim() || null,
        assignedToUid: assignee,
        assignedToName: person?.name ?? null,
        dueDate: due || null,
        documentId: null,
        submissionId: null,
      });
      setMessage('Set for ' + (person?.name ?? 'them') + '. It is on their task list now.');
      setTitle('');
      setDescription('');
      setDue('');
      onCreated();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'The task was not set.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="row" style={{ marginTop: 'var(--space-4)', gap: 10 }}>
        <button type="button" onClick={() => setOpen(true)}>
          <IconTasks size={15} /> Set a task
        </button>
        {message ? <span className="small muted" role="status">{message}</span> : null}
      </div>
    );
  }

  return (
    <form
      className="card stack"
      style={{ marginTop: 'var(--space-4)' }}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !saving) void save();
      }}
    >
      <div className="section-head">
        <h2>Set a task</h2>
        <span className="spacer" />
        <button type="button" className="link" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      {ownEntity === null ? (
        <div>
          <label htmlFor="task-entity">Entity</label>
          <select id="task-entity" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            <option value="">Choose the entity this is about</option>
            {(portfolio.data ?? [])
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((r) => (
                <option key={r.entityId} value={r.entityId}>
                  {r.name}
                </option>
              ))}
          </select>
        </div>
      ) : null}

      <div>
        <label htmlFor="task-assignee">Assign to</label>
        <select
          id="task-assignee"
          value={assignee}
          disabled={entityId === '' || people.loading}
          onChange={(e) => setAssignee(e.target.value)}
        >
          <option value="">{people.loading ? 'Loading people' : 'Choose a person'}</option>
          {choices.map((p) => (
            <option key={p.uid} value={p.uid}>
              {p.name} ({p.dsac ? 'Department' : 'entity'})
            </option>
          ))}
        </select>
        {entityId !== '' && !people.loading && choices.length === 0 ? (
          <p className="small muted">
            Nobody else has signed in for this entity yet, so there is nobody to assign to.
          </p>
        ) : null}
        {people.error ? <p className="field-error">{people.error}</p> : null}
      </div>

      <div>
        <label htmlFor="task-title">What needs doing</label>
        <input id="task-title" type="text" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <label htmlFor="task-description">Detail (optional)</label>
        <textarea id="task-description" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div>
        <label htmlFor="task-due">Due (optional)</label>
        <input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>

      {failure ? <p className="field-error" role="alert">{failure}</p> : null}
      {message ? <p className="small muted" role="status">{message}</p> : null}

      <div className="row" style={{ gap: 10 }}>
        <button type="submit" disabled={!ready || saving}>
          {saving ? <IconSpinner size={15} className="spin" /> : <IconCheck size={15} />}
          Set task
        </button>
        <span className="small muted">
          Marked external automatically when it crosses between the Department and an entity.
        </span>
      </div>
    </form>
  );
}
