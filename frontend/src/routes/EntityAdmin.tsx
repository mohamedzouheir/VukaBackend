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
import { date, num } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { Key } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import type { AdminEntityRow, IssuedReporter, PeriodView, WorkspaceDocument } from '../lib/types';
import { PageHead } from '../components/AppShell';
import { EmptyState, ErrorState, Loading, Modal, Tile } from '../components/Shell';
import {
  IconAlert, IconCalendar, IconCheck, IconCloud, IconExternal, IconEye, IconEyeOff, IconLock,
  IconPlus, IconRefresh, IconSettings, IconSpinner, IconUser,
} from '../icons';

const SECTORS = ['ARTS', 'HERITAGE', 'LIBRARIES', 'SPORT', 'LANGUAGE', 'OTHER'];
/* PFMA schedule designations are a legal classification and read the same in every
   language, exactly as the province names and the published citations do. */
const SCHEDULES: [string, string][] = [
  ['SCHEDULE_3A', 'Schedule 3A (national public entity)'],
  ['SCHEDULE_1', 'Schedule 1 (constitutional institution)'],
  ['SCHEDULE_2', 'Schedule 2'],
  ['SCHEDULE_3B', 'Schedule 3B'],
];

export function EntityAdmin() {
  const { t } = useI18n();
  const L = useLabels();
  const entities = useAsync(() => api.adminEntities(), []);
  const periods = useAsync(() => api.adminPeriods(), []);
  const msStatus = useAsync(() => api.microsoftStatus(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [issuingFor, setIssuingFor] = useState<AdminEntityRow | null>(null);
  const [microsoftFor, setMicrosoftFor] = useState<AdminEntityRow | null>(null);

  async function toggle(entityId: string, next: boolean) {
    setBusy(entityId);
    setError(null);
    try {
      await api.setPublished(entityId, next);
      entities.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.publishFailed'));
    } finally {
      setBusy(null);
    }
  }

  if (entities.loading) return <Loading what={t('admin.what')} />;
  if (entities.error) return <ErrorState message={entities.error} onRetry={entities.reload} />;

  const rows = entities.data ?? [];
  const published = rows.filter((r) => r.publiclyVisible).length;
  const noTargets = rows.filter((r) => r.targetCount === 0).length;
  const noReporter = rows.filter((r) => r.reporters.length === 0).length;

  return (
    <div className="stack">
      <PageHead
        icon={<IconSettings size={26} />}
        title={t('nav.administration')}
        subtitle={t('admin.subtitle')}
      >
        <a className="btn" href="/public" target="_blank" rel="noreferrer">
          <IconExternal size={16} /> {t('nav.citizenView')}
        </a>
        <button type="button" className="primary" onClick={() => setRegistering(true)}>
          <IconPlus size={16} /> {t('admin.registerEntity')}
        </button>
      </PageHead>

      {/* The admin's own counts. No risk band and no submission state: approving figures is the
          reviewer's job and reading the portfolio is the executive's, each on their own home. */}
      <div className="tiles">
        <Tile icon={<IconEye size={22} />} tone="ok" value={t('an.ofCount', num(published) ?? '', num(rows.length) ?? '')} label={t('admin.publishedTile')} sub={t('admin.publishedSub')} />
        <Tile icon={<IconUser size={22} />} tone="purple" value={num(noReporter)} label={t('admin.noReporter')} sub={t('admin.noReporterSub')} />
        <Tile icon={<IconAlert size={22} />} tone="warn" value={num(noTargets)} label={t('admin.noTargets')} sub={t('admin.noTargetsSub')} />
      </div>

      <DeadlinesCard periods={periods} />

      {error ? <ErrorState message={error} /> : null}

      <section className="card">
        <div className="section-head">
          <h2>{t('admin.entitiesAndReporters')}</h2>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          {t('admin.noSignUpNote')}
        </p>

        {rows.length === 0 ? (
          <EmptyState>{t('admin.noEntities')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('an.colEntity')}</th>
                  <th>{t('an.colSector')}</th>
                  <th className="num">{t('admin.colTargets')}</th>
                  <th>{t('admin.colReporters')}</th>
                  <th>{t('nav.citizenView')}</th>
                  <th>{t('ms.column')}</th>
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
                    <td>{L.sector(r.sector)}</td>
                    <td className="num">
                      {r.targetCount === 0 ? <em className="muted">{t('admin.noneRegistered')}</em> : num(r.targetCount)}
                    </td>
                    <td>
                      {r.reporters.length === 0 ? (
                        <em className="muted small">{t('admin.noneIssued')}</em>
                      ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                          {r.reporters.map((p) => (
                            <li key={p.email ?? p.name ?? ''} className="small">
                              {p.name ?? p.email}
                              {p.credentialIssued ? null : (
                                <span className="muted" title={t('admin.noCredentialWhy')}>
                                  {' '}{t('admin.noCredential')}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      <button type="button" className="link small" onClick={() => setIssuingFor(r)}>
                        {t('admin.issueAccount')}
                      </button>
                    </td>
                    <td>
                      {r.publiclyVisible ? (
                        <span className="row" style={{ gap: 6, color: 'var(--band-low)' }}>
                          <IconEye size={15} /> {t('admin.published')}
                        </span>
                      ) : (
                        <span className="row muted" style={{ gap: 6 }}>
                          <IconEyeOff size={15} /> {t('admin.notPublished')}
                        </span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="link small" onClick={() => setMicrosoftFor(r)}>
                        <IconCloud size={14} /> {t('admin.msConfigure')}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={busy === r.entityId}
                        onClick={() => void toggle(r.entityId, !r.publiclyVisible)}
                      >
                        {busy === r.entityId ? <IconSpinner size={16} className="spin" /> : null}
                        {r.publiclyVisible ? t('admin.unpublish') : t('admin.publish')}
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

      {microsoftFor ? (
        <MicrosoftModal
          entity={microsoftFor}
          tenantStatus={(msStatus.data as Record<string, unknown> | null) ?? null}
          onClose={() => setMicrosoftFor(null)}
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
  const { t } = useI18n();
  return (
    <section className="card">
      <div className="section-head">
        <h2 className="row" style={{ gap: 8 }}>
          <IconCalendar size={18} /> {t('admin.deadlines')}
        </h2>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        {/* Treasury Regulation 30.2.1 is a citation and keeps its published form. */}
        {t('admin.deadlinesNote', 'Treasury Regulation 30.2.1')}
      </p>

      {periods.loading ? (
        <Loading what={t('admin.whatPeriods')} />
      ) : periods.error ? (
        <ErrorState message={periods.error} onRetry={periods.reload} />
      ) : (periods.data ?? []).length === 0 ? (
        <EmptyState>{t('admin.noPeriods')}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('an.colQuarter')}</th>
                <th>{t('admin.colPeriod')}</th>
                <th>{t('an.colDue')}</th>
                <th>{t('admin.colBasis')}</th>
                <th>{t('an.colChange')}</th>
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
  const { t } = useI18n();
  const L = useLabels();
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
      setFailure(e instanceof Error ? e.message : t('admin.deadlineFailed'));
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
        {t('admin.periodRange', date(period.periodStart) ?? '', date(period.periodEnd) ?? '')}
      </td>
      <td className="nowrap">
        {date(period.dueDate) ?? t('dash.dueNotSet')}
        <br />
        <span className={'small' + (passed ? ' muted' : '')}>
          {period.daysRemaining === null ? '' : L.daysRemaining(period.daysRemaining)}
        </span>
      </td>
      <td className="small">
        {/* statutory against departmental: law against an instruction. */}
        {period.statutory ? t('admin.basisStatutory') : t('admin.basisDepartmental')}
      </td>
      <td>
        {passed ? (
          <span className="row muted small" style={{ gap: 6 }} title={t('admin.passedWhy')}>
            <IconLock size={15} /> {t('admin.passedFixed')}
          </span>
        ) : (
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <label className="visually-hidden" htmlFor={'due-' + period.periodId}>
              {t('admin.newDueFor', period.label)}
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
              {t('admin.set')}
            </button>
            {saved ? (
              <span className="row small" role="status" style={{ gap: 4, color: 'var(--ok)' }}>
                <IconCheck size={14} /> {t('admin.setDone')}
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
  const { t } = useI18n();
  const L = useLabels();
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
      setFailure(err instanceof Error ? err.message : t('admin.registerFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t('admin.registerEntity')} onClose={onClose}>
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <p className="small muted" style={{ margin: 0 }}>
          {t('admin.registerNote')}
        </p>
        <div>
          <label htmlFor="ent-name">{t('admin.fieldName')}</label>
          <input id="ent-name" type="text" value={name} maxLength={500} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ent-short">{t('admin.fieldShortName')}</label>
          <input id="ent-short" type="text" value={shortName} maxLength={100} onChange={(e) => setShortName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ent-sector">{t('an.colSector')}</label>
          <select id="ent-sector" value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">{t('admin.chooseSector')}</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {L.sector(s)}
              </option>
            ))}
          </select>
          <p className="small muted">{t('admin.sectorNote')}</p>
        </div>
        <div>
          <label htmlFor="ent-schedule">{t('admin.fieldSchedule')}</label>
          <select id="ent-schedule" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
            {SCHEDULES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ent-contact">{t('admin.fieldContact')}</label>
          <input id="ent-contact" type="text" value={contactName} maxLength={200} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ent-email">{t('admin.fieldContactEmail')}</label>
          <input id="ent-email" type="email" value={contactEmail} maxLength={200} onChange={(e) => setContactEmail(e.target.value)} />
          <p className="small muted">{t('admin.contactEmailNote')}</p>
        </div>
        {failure ? <p className="field-error" role="alert">{failure}</p> : null}
        <div className="row">
          <button type="submit" className="primary" disabled={!ready || saving}>
            {saving ? <IconSpinner size={16} className="spin" /> : null} {t('admin.register')}
          </button>
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
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
  const { t } = useI18n();
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
      setFailure(err instanceof Error ? err.message : t('admin.issueFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t('admin.reporterAccountFor', entity.shortName ?? entity.name)} onClose={onClose}>
      {issued ? (
        <div className="stack">
          <p className="row" style={{ gap: 8, margin: 0 }}>
            <IconCheck size={18} />
            <strong>{issued.credentialIssued ? t('admin.accountIssued') : t('admin.recordedNoCredential')}</strong>
          </p>
          <p style={{ margin: 0 }}>{issued.note}</p>
          {issued.setPasswordLink ? (
            <div>
              <label htmlFor="issued-link">{t('admin.setPasswordLinkFor', issued.email)}</label>
              <input id="issued-link" type="text" readOnly value={issued.setPasswordLink} onFocus={(e) => e.target.select()} />
            </div>
          ) : (
            <div>
              <label htmlFor="issued-entity">{t('admin.entityIdForDev')}</label>
              <input id="issued-entity" type="text" className="mono" readOnly value={entity.entityId} onFocus={(e) => e.target.select()} />
            </div>
          )}
          <div className="row">
            <button type="button" className="primary" onClick={onClose}>
              {t('common.done')}
            </button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={(e) => void submit(e)}>
          <p className="small muted" style={{ margin: 0 }}>
            {t('admin.accountScope', entity.name)}
          </p>
          <div>
            <label htmlFor="rep-name">{t('admin.fieldFullName')}</label>
            <input id="rep-name" type="text" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rep-email">{t('admin.fieldWorkEmail')}</label>
            <input id="rep-email" type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {failure ? <p className="field-error" role="alert">{failure}</p> : null}
          <div className="row">
            <button type="submit" className="primary" disabled={name.trim() === '' || email.trim() === '' || saving}>
              {saving ? <IconSpinner size={16} className="spin" /> : null} {t('admin.issueAccount')}
            </button>
            <button type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Microsoft 365                                                       */
/*                                                                     */
/* Binding, the Teams webhook and an on-demand sync, per entity. There */
/* is no GET for the binding itself or for the webhook (the backend    */
/* deliberately never reads a saved webhook URL back), so both are     */
/* shown as what this session actually knows: the binding as read off  */
/* the entity's own documents, the webhook only after this session has */
/* set or cleared it.                                                  */
/* ------------------------------------------------------------------ */

function bindingSummary(docs: WorkspaceDocument[]) {
  const mirrored = docs.filter((d) => d.microsoftState && d.microsoftState !== 'NOT_CONFIGURED');
  return {
    checked: docs.length > 0,
    bound: docs.length > 0 && mirrored.length > 0,
    synced: mirrored.filter((d) => d.microsoftState === 'SYNCED').length,
    pending: mirrored.filter((d) => d.microsoftState === 'PENDING').length,
    failed: mirrored.filter((d) => d.microsoftState === 'FAILED').length,
    source: mirrored.filter((d) => d.microsoftState === 'SOURCE').length,
  };
}

function pickedMessage(t: (key: Key, ...args: (string | number)[]) => string, picked: number) {
  if (picked === 0) return t('ms.pickedNone');
  if (picked === 1) return t('ms.pickedOne');
  return t('ms.pickedMany', picked);
}

function MicrosoftModal({
  entity,
  tenantStatus,
  onClose,
}: {
  entity: AdminEntityRow;
  tenantStatus: Record<string, unknown> | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const docs = useAsync(() => api.workspaceDocuments(entity.entityId), [entity.entityId]);
  const summary = bindingSummary(docs.data ?? []);
  const configured = tenantStatus?.configured;

  const [advanced, setAdvanced] = useState(false);
  const [siteHostname, setSiteHostname] = useState('');
  const [sitePath, setSitePath] = useState('');
  const [driveId, setDriveId] = useState('');
  const [folderPath, setFolderPath] = useState('Vuka');
  const [binding, setBinding] = useState(false);
  const [bindFailure, setBindFailure] = useState<string | null>(null);
  const [bound, setBound] = useState<{ driveId: string; folderPath: string } | null>(null);

  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookFailure, setWebhookFailure] = useState<string | null>(null);
  const [webhookState, setWebhookState] = useState<'set' | 'cleared' | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncFailure, setSyncFailure] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ picked: number; note?: string } | null>(null);

  const bindReady = advanced ? driveId.trim() !== '' : siteHostname.trim() !== '' && sitePath.trim() !== '';

  async function bind(e: FormEvent) {
    e.preventDefault();
    setBinding(true);
    setBindFailure(null);
    setBound(null);
    try {
      const res = await api.bindMicrosoft(entity.entityId, {
        driveId: advanced ? driveId.trim() : null,
        siteHostname: advanced ? null : siteHostname.trim(),
        sitePath: advanced ? null : sitePath.trim(),
        folderPath: folderPath.trim() || 'Vuka',
      });
      setBound(res);
      docs.reload();
    } catch (err) {
      setBindFailure(err instanceof Error ? err.message : t('admin.msBindFailed'));
    } finally {
      setBinding(false);
    }
  }

  async function saveWebhook(url: string | null) {
    setWebhookBusy(true);
    setWebhookFailure(null);
    try {
      const res = await api.setMicrosoftWebhook(entity.entityId, url);
      setWebhookState(res.status);
      setWebhookUrl('');
    } catch (err) {
      setWebhookFailure(err instanceof Error ? err.message : t('admin.msWebhookFailed'));
    } finally {
      setWebhookBusy(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setSyncFailure(null);
    setSyncResult(null);
    try {
      setSyncResult(await api.syncMicrosoftNow(entity.entityId));
      docs.reload();
    } catch (err) {
      setSyncFailure(err instanceof Error ? err.message : t('ms.syncFailed'));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Modal title={t('admin.msTitleFor', entity.shortName ?? entity.name)} onClose={onClose} wide>
      <div className="stack">
        {configured === false ? (
          <p className="small muted row" style={{ gap: 6, margin: 0 }}>
            <IconAlert size={15} /> {t('admin.msNotConfiguredWarning')}
          </p>
        ) : null}

        <div className="card card-sunk" style={{ margin: 0 }}>
          {docs.loading ? (
            <span className="small muted row" style={{ gap: 6 }}>
              <IconSpinner size={14} className="spin" /> {t('admin.msCheckingDocs')}
            </span>
          ) : !summary.checked ? (
            <span className="small muted">{t('admin.msNoDocsYet')}</span>
          ) : summary.bound ? (
            <span className="small row" style={{ gap: 6, color: 'var(--ok)' }}>
              <IconCloud size={15} />{' '}
              {t('admin.msBoundLine', num(summary.synced) ?? 0, num(summary.pending) ?? 0, num(summary.failed) ?? 0, num(summary.source) ?? 0)}
            </span>
          ) : (
            <span className="small muted row" style={{ gap: 6 }}>
              <IconCloud size={15} /> {t('admin.msNotBoundLine')}
            </span>
          )}
        </div>

        <form className="stack" onSubmit={(e) => void bind(e)}>
          <h3 style={{ margin: 0 }}>{t('admin.msBindHeading')}</h3>
          {!advanced ? (
            <>
              <div>
                <label htmlFor="ms-host">{t('admin.msFieldHostname')}</label>
                <input
                  id="ms-host"
                  type="text"
                  placeholder="contoso.sharepoint.com"
                  value={siteHostname}
                  onChange={(e) => setSiteHostname(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="ms-path">{t('admin.msFieldPath')}</label>
                <input
                  id="ms-path"
                  type="text"
                  placeholder="/sites/DSAC-Iziko"
                  value={sitePath}
                  onChange={(e) => setSitePath(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="ms-drive">{t('admin.msFieldDriveId')}</label>
              <input id="ms-drive" type="text" className="mono" value={driveId} onChange={(e) => setDriveId(e.target.value)} />
            </div>
          )}
          <div>
            <label htmlFor="ms-folder">{t('admin.msFieldFolder')}</label>
            <input id="ms-folder" type="text" value={folderPath} onChange={(e) => setFolderPath(e.target.value)} />
          </div>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
            {t('admin.msUseDriveId')}
          </label>
          {bindFailure ? <p className="field-error" role="alert">{bindFailure}</p> : null}
          {bound ? (
            <p className="small row" style={{ gap: 6, color: 'var(--ok)', margin: 0 }}>
              <IconCheck size={14} /> {t('admin.msBoundTo', bound.driveId, bound.folderPath)}
            </p>
          ) : null}
          <div className="row">
            <button type="submit" className="primary" disabled={!bindReady || binding}>
              {binding ? <IconSpinner size={16} className="spin" /> : null} {t('admin.msBind')}
            </button>
          </div>
        </form>

        <div className="stack">
          <h3 style={{ margin: 0 }}>{t('admin.msWebhookHeading')}</h3>
          <p className="small muted" style={{ margin: 0 }}>
            {t('admin.msWebhookNote')}
          </p>
          <p className="small" style={{ margin: 0 }}>
            {t('admin.msWebhookCurrentLabel')}{' '}
            {webhookState === null ? (
              <em className="muted">{t('admin.msWebhookUnknown')}</em>
            ) : (
              <strong>{webhookState === 'set' ? t('admin.setDone') : t('common.notSet')}</strong>
            )}
          </p>
          <div>
            <label htmlFor="ms-webhook">{t('admin.msFieldWebhookUrl')}</label>
            <input
              id="ms-webhook"
              type="url"
              placeholder="https://..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </div>
          {webhookFailure ? <p className="field-error" role="alert">{webhookFailure}</p> : null}
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={webhookUrl.trim() === '' || webhookBusy}
              onClick={() => void saveWebhook(webhookUrl.trim())}
            >
              {webhookBusy ? <IconSpinner size={16} className="spin" /> : null} {t('common.save')}
            </button>
            <button type="button" disabled={webhookBusy} onClick={() => void saveWebhook(null)}>
              {t('admin.msClear')}
            </button>
          </div>
        </div>

        <div className="stack">
          <h3 style={{ margin: 0 }}>{t('admin.msSyncHeading')}</h3>
          <div className="row" style={{ alignItems: 'center' }}>
            <button type="button" disabled={syncing} onClick={() => void syncNow()}>
              {syncing ? <IconSpinner size={16} className="spin" /> : <IconRefresh size={16} />} {t('ms.syncNow')}
            </button>
            {syncResult ? (
              <span className="small muted">{syncResult.note ?? pickedMessage(t, syncResult.picked)}</span>
            ) : null}
          </div>
          {syncFailure ? <p className="field-error" role="alert">{syncFailure}</p> : null}
        </div>

        <div className="row">
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
