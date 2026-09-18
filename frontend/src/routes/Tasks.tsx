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
import { date, num, statusLabel } from '../lib/format';
import { PageHead } from '../components/AppShell';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import { IconAlert, IconCheck, IconCheckCircle, IconClock, IconSpinner, IconTasks } from '../icons';

type Filter = 'OPEN' | 'DONE' | 'ALL';

export function Tasks() {
  const { me } = useAuth();
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

      {can(me, 'PARTICIPATE') ? <NewTaskForm onCreated={tasks.reload} /> : null}

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
