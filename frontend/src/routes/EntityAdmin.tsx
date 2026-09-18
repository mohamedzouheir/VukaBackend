/*
 * Surface C. Administration, the admin's home.
 *
 * Four jobs, each an action the rest of the product depends on and nobody else may take:
 *
 *   Deadlines. For a Schedule 3A entity TR 30.2.1 names no day count, so the submission date is
 *   the Department's instruction, and this is where it is given. The reporter's countdown and
 *   warning, the reminders and the lateness signal all read it. A date that has passed is shown
 *   locked, because lateness was measured against it and moving it would rewrite who was late.
 *
 *   Entities. Registered with a name, sector and schedule, unpublished and with no targets.
 *   Targets are loaded from a tabled plan and versioned, so there is no form that types one in.
 *
 *   Reporter accounts. There is no sign up anywhere in the product. A reporter's authority is the
 *   entity on their token, so an account is issued here for one named entity and the person can
 *   only sign in.
 *
 *   Publication (UC-21). Nothing reaches the citizen view unless it is switched on here.
 *
 * What is not here: review. Approving figures is the reviewer's job, and the admin role does not
 * hold that capability, so publication and approval always take two people.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { date, daysRemainingText, num, sectorLabel } from '../lib/format';
import type { AdminEntityRow, IssuedReporter, PeriodView } from '../lib/types';
import { PageHead } from '../components/AppShell';
import { EmptyState, ErrorState, Loading, Modal, Tile } from '../components/Shell';
import {
  IconAlert, IconCalendar, IconCheck, IconExternal, IconEye, IconEyeOff, IconLock, IconPlus,
  IconSettings, IconSpinner, IconUser,
} from '../icons';

const SECTORS = ['ARTS', 'HERITAGE', 'LIBRARIES', 'SPORT', 'LANGUAGE', 'OTHER'];
const SCHEDULES: [string, string][] = [
  ['SCHEDULE_3A', 'Schedule 3A (national public entity)'],
  ['SCHEDULE_1', 'Schedule 1 (constitutional institution)'],
  ['SCHEDULE_2', 'Schedule 2'],
  ['SCHEDULE_3B', 'Schedule 3B'],
];

export function EntityAdmin() {
  const entities = useAsync(() => api.adminEntities(), []);
  const periods = useAsync(() => api.adminPeriods(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [issuingFor, setIssuingFor] = useState<AdminEntityRow | null>(null);

  async function toggle(entityId: string, next: boolean) {
    setBusy(entityId);
    setError(null);
    try {
      await api.setPublished(entityId, next);
      entities.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The publication flag was not changed.');
    } finally {
      setBusy(null);
    }
  }

  if (entities.loading) return <Loading what="the entity register" />;
  if (entities.error) return <ErrorState message={entities.error} onRetry={entities.reload} />;

  const rows = entities.data ?? [];
  const published = rows.filter((r) => r.publiclyVisible).length;
  const noTargets = rows.filter((r) => r.targetCount === 0).length;
  const noReporter = rows.filter((r) => r.reporters.length === 0).length;

  return (
    <div className="stack">
      <PageHead
        icon={<IconSettings size={26} />}
        title="Administration"
        subtitle="Who reports, by when, and what the public sees. Nothing here touches a reported figure."
      >
        <a className="btn" href="/public" target="_blank" rel="noreferrer">
          <IconExternal size={16} /> Citizen view
        </a>
        <button type="button" className="primary" onClick={() => setRegistering(true)}>
          <IconPlus size={16} /> Register an entity
        </button>
      </PageHead>

      {/* The admin's own counts. No risk band and no submission state: approving figures is the
          reviewer's job and reading the portfolio is the executive's, each on their own home. */}
      <div className="tiles">
        <Tile icon={<IconEye size={22} />} tone="ok" value={num(published) + ' of ' + num(rows.length)} label="Published" sub="Visible on the citizen view" />
        <Tile icon={<IconUser size={22} />} tone="purple" value={num(noReporter)} label="No reporter account" sub="Nobody can report for these yet" />
        <Tile icon={<IconAlert size={22} />} tone="warn" value={num(noTargets)} label="No targets registered" sub="Nothing to report against yet" />
      </div>

      <DeadlinesCard periods={periods} />

      {error ? <ErrorState message={error} /> : null}

      <section className="card">
        <div className="section-head">
          <h2>Entities and their reporters</h2>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          Entities cannot sign up. Each reporter account is issued here for one named entity, and the
          person it is issued to can only sign in. Publication is a departmental decision: every
          entity starts unpublished, and every change is written to the audit log with your name.
        </p>

        {rows.length === 0 ? (
          <EmptyState>
            No entities are registered. Seeding loads the funded bodies from published Estimates of
            National Expenditure figures on first start.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Sector</th>
                  <th className="num">Targets</th>
                  <th>Reporters</th>
                  <th>Citizen view</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.entityId}>
                    <td>
                      <Link to={'/portfolio/entity/' + r.entityId}>{r.name}</Link>
                      <br />
                      <span className="mono small muted">{r.entityId}</span>
                    </td>
                    <td>{sectorLabel(r.sector)}</td>
                    <td className="num">
                      {r.targetCount === 0 ? <em className="muted">none registered</em> : num(r.targetCount)}
                    </td>
                    <td>
                      {r.reporters.length === 0 ? (
                        <em className="muted small">none issued</em>
                      ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                          {r.reporters.map((p) => (
                            <li key={p.email ?? p.name ?? ''} className="small">
                              {p.name ?? p.email}
                              {p.credentialIssued ? null : (
                                <span className="muted" title="Recorded in the directory. Firebase was not configured, so no sign-in credential exists yet.">
                                  {' '}(no credential)
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      <button type="button" className="link small" onClick={() => setIssuingFor(r)}>
                        Issue an account
                      </button>
                    </td>
                    <td>
                      {r.publiclyVisible ? (
                        <span className="row" style={{ gap: 6, color: 'var(--band-low)' }}>
                          <IconEye size={15} /> published
                        </span>
                      ) : (
                        <span className="row muted" style={{ gap: 6 }}>
                          <IconEyeOff size={15} /> not published
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={busy === r.entityId}
                        onClick={() => void toggle(r.entityId, !r.publiclyVisible)}
                      >
                        {busy === r.entityId ? <IconSpinner size={16} className="spin" /> : null}
                        {r.publiclyVisible ? 'Unpublish' : 'Publish'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {registering ? (
        <RegisterEntityModal
          onClose={() => setRegistering(false)}
          onCreated={() => {
            setRegistering(false);
            entities.reload();
          }}
        />
      ) : null}

      {issuingFor ? (
        <IssueReporterModal
          entity={issuingFor}
          onClose={() => setIssuingFor(null)}
          onIssued={() => entities.reload()}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Deadlines                                                           */
/* ------------------------------------------------------------------ */

function DeadlinesCard({
  periods,
}: {
  periods: { data: PeriodView[] | null; loading: boolean; error: string | null; reload: () => void };
}) {
  return (
    <section className="card">
      <div className="section-head">
        <h2 className="row" style={{ gap: 8 }}>
          <IconCalendar size={18} /> Submission deadlines
        </h2>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        For a Schedule 3A entity, Treasury Regulation 30.2.1 sets no day count for quarterly
        performance reporting, so the date is the Department's instruction and is set here, for every
        entity at once. Reporters are warned when they sign in within thirty days of it, and reminded
        at thirty days, fifteen days and on the last day.
      </p>

      {periods.loading ? (
        <Loading what="the reporting periods" />
      ) : periods.error ? (
        <ErrorState message={periods.error} onRetry={periods.reload} />
      ) : (periods.data ?? []).length === 0 ? (
        <EmptyState>No reporting periods exist for the current financial year.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quarter</th>
                <th>Period</th>
                <th>Due</th>
                <th>Basis</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {(periods.data ?? []).map((p) => (
                <DeadlineRow key={p.periodId} period={p} onSaved={periods.reload} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DeadlineRow({ period, onSaved }: { period: PeriodView; onSaved: () => void }) {
  const [value, setValue] = useState(period.dueDate ?? '');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const passed = period.daysRemaining !== null && period.daysRemaining < 0;
  const changed = value !== '' && value !== period.dueDate;

  async function save() {
    setSaving(true);
    setFailure(null);
    setSaved(false);
    try {
      await api.setDueDate(period.periodId, value);
      setSaved(true);
      onSaved();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'The deadline was not changed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td className="nowrap">
        <strong>{period.label}</strong>
      </td>
      <td className="muted small nowrap">
        {date(period.periodStart)} to {date(period.periodEnd)}
      </td>
      <td className="nowrap">
        {date(period.dueDate) ?? 'not set'}
        <br />
        <span className={'small' + (passed ? ' muted' : '')}>
          {period.daysRemaining === null ? '' : daysRemainingText(period.daysRemaining)}
        </span>
      </td>
      <td className="small">
        {period.statutory ? 'Statutory, PFMA' : 'Departmental instruction'}
      </td>
      <td>
        {passed ? (
          <span className="row muted small" style={{ gap: 6 }} title="Lateness was measured against this date, so it cannot be moved.">
            <IconLock size={15} /> Passed, fixed
          </span>
        ) : (
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <label className="visually-hidden" htmlFor={'due-' + period.periodId}>
              New due date for {period.label}
            </label>
            <input
              id={'due-' + period.periodId}
              type="date"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setSaved(false);
              }}
              style={{ width: 'auto' }}
            />
            <button type="button" disabled={!changed || saving} onClick={() => void save()}>
              {saving ? <IconSpinner size={16} className="spin" /> : null}
              Set
            </button>
            {saved ? (
              <span className="row small" role="status" style={{ gap: 4, color: 'var(--ok)' }}>
                <IconCheck size={14} /> set
              </span>
            ) : null}
          </div>
        )}
        {failure ? <p className="field-error" role="alert">{failure}</p> : null}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Register an entity                                                  */
/* ------------------------------------------------------------------ */

function RegisterEntityModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [sector, setSector] = useState('');
  const [schedule, setSchedule] = useState('SCHEDULE_3A');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const ready = name.trim() !== '' && shortName.trim() !== '' && sector !== '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFailure(null);
    try {
      await api.createEntity({ name, shortName, sector, pfmaSchedule: schedule, contactName, contactEmail });
      onCreated();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'The entity was not registered.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Register an entity" onClose={onClose}>
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <p className="small muted" style={{ margin: 0 }}>
          It starts unpublished, with no targets and no reporter. It appears in the review queue at
          once, ranked with nothing filed, which is the correct first state.
        </p>
        <div>
          <label htmlFor="ent-name">Name</label>
          <input id="ent-name" type="text" value={name} maxLength={500} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ent-short">Short name</label>
          <input id="ent-short" type="text" value={shortName} maxLength={100} onChange={(e) => setShortName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ent-sector">Sector</label>
          <select id="ent-sector" value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">Choose a sector</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {sectorLabel(s)}
              </option>
            ))}
          </select>
          <p className="small muted">Unit cost is only ever compared with peers in the same sector.</p>
        </div>
        <div>
          <label htmlFor="ent-schedule">PFMA schedule</label>
          <select id="ent-schedule" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
            {SCHEDULES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ent-contact">Contact person (optional)</label>
          <input id="ent-contact" type="text" value={contactName} maxLength={200} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ent-email">Contact email (optional)</label>
          <input id="ent-email" type="email" value={contactEmail} maxLength={200} onChange={(e) => setContactEmail(e.target.value)} />
          <p className="small muted">Deadline reminders go to this address as well as to the entity's reporters.</p>
        </div>
        {failure ? <p className="field-error" role="alert">{failure}</p> : null}
        <div className="row">
          <button type="submit" className="primary" disabled={!ready || saving}>
            {saving ? <IconSpinner size={16} className="spin" /> : null} Register
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Issue a reporter account                                            */
/* ------------------------------------------------------------------ */

function IssueReporterModal({
  entity,
  onClose,
  onIssued,
}: {
  entity: AdminEntityRow;
  onClose: () => void;
  onIssued: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedReporter | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFailure(null);
    try {
      const res = await api.issueReporter(entity.entityId, name, email);
      setIssued(res);
      onIssued();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'The account was not issued.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={'Reporter account for ' + (entity.shortName ?? entity.name)} onClose={onClose}>
      {issued ? (
        <div className="stack">
          <p className="row" style={{ gap: 8, margin: 0 }}>
            <IconCheck size={18} />
            <strong>{issued.credentialIssued ? 'Account issued.' : 'Recorded, no credential issued.'}</strong>
          </p>
          <p style={{ margin: 0 }}>{issued.note}</p>
          {issued.setPasswordLink ? (
            <div>
              <label htmlFor="issued-link">Set-password link for {issued.email}</label>
              <input id="issued-link" type="text" readOnly value={issued.setPasswordLink} onFocus={(e) => e.target.select()} />
            </div>
          ) : (
            <div>
              <label htmlFor="issued-entity">Entity id, for development sign in</label>
              <input id="issued-entity" type="text" className="mono" readOnly value={entity.entityId} onFocus={(e) => e.target.select()} />
            </div>
          )}
          <div className="row">
            <button type="button" className="primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={(e) => void submit(e)}>
          <p className="small muted" style={{ margin: 0 }}>
            The account can report for {entity.name} and nothing else. The person signs in; they
            cannot sign up, and they cannot choose a different entity.
          </p>
          <div>
            <label htmlFor="rep-name">Full name</label>
            <input id="rep-name" type="text" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rep-email">Work email</label>
            <input id="rep-email" type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {failure ? <p className="field-error" role="alert">{failure}</p> : null}
          <div className="row">
            <button type="submit" className="primary" disabled={name.trim() === '' || email.trim() === '' || saving}>
              {saving ? <IconSpinner size={16} className="spin" /> : null} Issue account
            </button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
