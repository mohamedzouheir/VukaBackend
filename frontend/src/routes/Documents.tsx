/*
 * Documents.
 *
 * Reads /api/workspace/entity/{id}/documents, which the accessibility-and-languages branch added
 * along with version history, receipts and a DSAC decision per document.
 *
 * The column this screen exists for is the receipt. A document with a receipt number and a
 * received timestamp is one the Department has acknowledged holding, which is a different and
 * stronger claim than "somebody uploaded a file". A document without one is shown as awaiting
 * receipt rather than as fine.
 *
 * The design's "1,248 views" and "856 downloads" are not here. Nothing counts either.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, openFile } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth, isDsac, can } from '../lib/auth';
import { date, dateTime, fileSize, num } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { Key } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { PageHead } from '../components/AppShell';
import { SearchField } from '../components/SearchField';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import type { WorkspaceDocument } from '../lib/types';
import {
  IconCalendar, IconCheckCircle, IconDownload, IconExternal, IconFolder, IconHelp, IconPaperclip,
  IconRefresh, IconShield, IconSpinner,
} from '../icons';
import './Documents.css';

export function Documents() {
  const { t } = useI18n();
  const { me } = useAuth();
  const dsac = isDsac(me?.role);

  const portfolio = useAsync(() => api.portfolio(), [], dsac);
  /* A workspace card links here as /documents?entity=<id>, so the entity it names is the one that
     opens. Without this the link landed on the bare picker and the click appeared to do nothing.
     A reporter's entity still comes off their token: the parameter can only choose among the
     entities the picker already offers, and the API refuses any other. */
  const [params] = useSearchParams();
  const [entityId, setEntityId] = useState<string | null>(
    (dsac ? params.get('entity') : null) ?? me?.entityId ?? null,
  );

  const chosen = entityId ?? me?.entityId ?? null;
  const docs = useAsync(() => api.workspaceDocuments(chosen!), [chosen], Boolean(chosen));

  // Open to a reviewer as well as an administrator: pulling versions decides nothing, and the
  // backend's @PreAuthorize on /microsoft/sync allows REVIEW_SUBMISSIONS for exactly that reason.
  const canSync = can(me, 'ADMINISTER') || can(me, 'REVIEW_SUBMISSIONS');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncFailure, setSyncFailure] = useState<string | null>(null);

  async function syncNow() {
    if (!chosen) return;
    setSyncing(true);
    setSyncFailure(null);
    setSyncMessage(null);
    try {
      const res = await api.syncMicrosoftNow(chosen);
      setSyncMessage(res.note ?? pickedMessage(t, res.picked));
      docs.reload();
    } catch (err) {
      setSyncFailure(err instanceof Error ? err.message : t('ms.syncFailed'));
    } finally {
      setSyncing(false);
    }
  }

  const rows = docs.data ?? [];
  const counts = useMemo(
    () => ({
      total: rows.length,
      current: rows.filter((d) => d.current).length,
      receipted: rows.filter((d) => d.receiptNumber !== null).length,
      approved: rows.filter((d) => d.approvalStatus === 'APPROVED').length,
    }),
    [rows],
  );

  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [decision, setDecision] = useState('');
  const [year, setYear] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'name'>('newest');
  const filtered = query !== '' || type !== '' || decision !== '' || year !== '';

  // Offer only the types and years actually on record, so no option leads to an empty list.
  const types = useMemo(
    () => [...new Set(rows.map((d) => d.documentType).filter((v): v is string => Boolean(v)))].sort(),
    [rows],
  );
  const years = useMemo(
    () => [...new Set(rows.map((d) => d.uploadedAt?.slice(0, 4)).filter((v): v is string => Boolean(v)))].sort().reverse(),
    [rows],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((d) =>
        q === ''
          ? true
          : (d.fileName ?? '').toLowerCase().includes(q) || (d.uploadedBy ?? '').toLowerCase().includes(q),
      )
      .filter((d) => (type === '' ? true : d.documentType === type))
      .filter((d) => (decision === '' ? true : (d.approvalStatus ?? 'PENDING') === decision))
      .filter((d) => (year === '' ? true : d.uploadedAt?.startsWith(year)))
      .slice()
      .sort((a, b) =>
        sort === 'name'
          ? (a.fileName ?? '').localeCompare(b.fileName ?? '')
          : sort === 'oldest'
            ? (a.uploadedAt ?? '').localeCompare(b.uploadedAt ?? '')
            : (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''),
      );
  }, [rows, query, type, decision, year, sort]);

  // The mockup's "Recent downloads" is not counted anywhere. What is recorded is receipt, so the
  // rail lists the files the Department most recently acknowledged holding.
  const recent = useMemo(
    () =>
      rows
        .filter((d) => d.receivedAt)
        .slice()
        .sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? ''))
        .slice(0, 5),
    [rows],
  );

  function clearFilters() {
    setQuery('');
    setType('');
    setDecision('');
    setYear('');
  }

  return (
    <div className="with-aside">
      <div>
        <PageHead
          icon={<IconFolder size={26} />}
          title={t('docs.title')}
          subtitle={t('docs.sub')}
        >
          {dsac ? (
            <select
              aria-label={t('entities.colEntity')}
              style={{ minWidth: '18rem' }}
              value={chosen ?? ''}
              onChange={(e) => setEntityId(e.target.value || null)}
            >
              <option value="">{t('docs.chooseEntity')}</option>
              {(portfolio.data ?? [])
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((r) => (
                  <option key={r.entityId} value={r.entityId}>
                    {r.name}
                  </option>
                ))}
            </select>
          ) : null}
        </PageHead>

        {!chosen ? (
          <EmptyState>
            {t('docs.chooseNote')}
          </EmptyState>
        ) : docs.loading ? (
          <Loading what={t('docs.what')} />
        ) : docs.notFound ? (
          <EmptyState>{t('docs.notYours')}</EmptyState>
        ) : docs.error ? (
          <ErrorState message={docs.error} onRetry={docs.reload} />
        ) : (
          <>
            <div className="tiles">
              <Tile icon={<IconFolder size={22} />} value={num(counts.total)} label={t('docs.title')} sub={t('docs.allVersions')} />
              <Tile icon={<IconPaperclip size={22} />} tone="purple" value={num(counts.current)} label={t('docs.currentVersions')} sub={t('docs.supersededStay')} />
              <Tile icon={<IconShield size={22} />} tone="ok" value={num(counts.receipted)} label={t('docs.receipted')} sub={t('docs.receiptedSub')} />
              <Tile icon={<IconCheckCircle size={22} />} tone="ok" value={num(counts.approved)} label={t('docs.approved')} sub={t('docs.decidedBy')} />
            </div>

            <div className="card doc-filters">
              <div className="doc-search">
                <SearchField
                  label={t('docs.searchLabel')}
                  placeholder={t('docs.searchPlaceholder')}
                  value={query}
                  onChange={setQuery}
                />
              </div>
              <select aria-label={t('docs.filterType')} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">{t('docs.allTypes')}</option>
                {types.map((ty) => (
                  <option key={ty} value={ty}>
                    {typeLabel(t, ty)}
                  </option>
                ))}
              </select>
              <select aria-label={t('docs.colDecision')} value={decision} onChange={(e) => setDecision(e.target.value)}>
                <option value="">{t('docs.allDecisions')}</option>
                <option value="APPROVED">{t('docs.approved')}</option>
                <option value="PENDING">{t('docs.pending')}</option>
                <option value="REJECTED">{t('docs.returned')}</option>
              </select>
              <select aria-label={t('docs.filterYear')} value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">{t('docs.allYears')}</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button type="button" className="link small" disabled={!filtered} onClick={clearFilters}>
                {t('docs.clearFilters')}
              </button>
            </div>

            <div className="card doc-list-card">
              <div className="section-head">
                <h2>{t('docs.filesCount', num(shown.length) ?? '')}</h2>
                <span className="spacer" />
                {canSync ? (
                  <>
                    {syncMessage ? <span className="small muted">{syncMessage}</span> : null}
                    <button type="button" disabled={syncing} onClick={() => void syncNow()}>
                      {syncing ? <IconSpinner size={16} className="spin" /> : <IconRefresh size={16} />} {t('ms.syncNow')}
                    </button>
                  </>
                ) : null}
                <label className="doc-sort">
                  {t('docs.sortBy')}
                  <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                    <option value="newest">{t('docs.sortNewest')}</option>
                    <option value="oldest">{t('docs.sortOldest')}</option>
                    <option value="name">{t('docs.sortName')}</option>
                  </select>
                </label>
              </div>
              {syncFailure ? (
                <p className="field-error" role="alert" style={{ padding: '0 var(--space-5)' }}>{syncFailure}</p>
              ) : null}

              {rows.length === 0 ? (
                <div style={{ padding: 'var(--space-5)' }}>
                  <EmptyState>
                    No documents held for this entity. That is an empty shelf rather than a filing with
                    nothing outstanding.
                  </EmptyState>
                </div>
              ) : shown.length === 0 ? (
                <div style={{ padding: 'var(--space-5)' }}>
                  <EmptyState>{t('docs.noMatch')}</EmptyState>
                </div>
              ) : (
                <ul className="doc-list">
                  {shown.map((d) => (
                    <DocumentRow key={d.id} doc={d} />
                  ))}
                </ul>
              )}
            </div>

            <p className="small muted" style={{ marginTop: 'var(--space-4)' }}>
              {t('docs.criterionNote')}
            </p>
          </>
        )}
      </div>

      <aside className="aside">
        <section className="card doc-help">
          <span className="tile-icon" aria-hidden="true"><IconHelp size={20} /></span>
          <div>
            <h2>{t('docs.helpHead')}</h2>
            <p>{t('docs.helpBody')}</p>
          </div>
        </section>

        {chosen && !docs.loading && !docs.error ? (
          <section className="card">
            <h2>{t('docs.recentHead')}</h2>
            {recent.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>{t('docs.recentEmpty')}</p>
            ) : (
              <ul className="doc-recent">
                {recent.map((d) => (
                  <li key={d.id}>
                    <FileBadge name={d.fileName} />
                    <div>
                      <strong>{d.fileName ?? t('common.unnamedFile')}</strong>
                      <span>{d.receiptNumber}, {date(d.receivedAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section className="card card-sunk">
          <p className="small" style={{ margin: 0 }}>{t('ws.bindingNote')}</p>
        </section>
      </aside>
    </div>
  );
}

/** The seven filings the challenge lists, in words. An unknown value falls back to itself. */
function typeLabel(t: (key: Key, ...args: (string | number)[]) => string, type: string | null): string {
  switch (type) {
    case 'STRATEGIC_PLAN': return t('docs.typeStrategicPlan');
    case 'ANNUAL_PERFORMANCE_PLAN': return t('docs.typeApp');
    case 'OPERATIONAL_PLAN': return t('docs.typeOperationalPlan');
    case 'ANNUAL_REPORT': return t('docs.typeAnnualReport');
    case 'QUARTERLY_REPORT': return t('docs.typeQuarterlyReport');
    case 'FINANCIALS': return t('docs.typeFinancials');
    case 'REPORTING_TEMPLATE': return t('docs.typeTemplate');
    case null: return t('docs.typeUnstated');
    default: return type;
  }
}

/** A coloured badge from the file extension: PDF red, spreadsheet green, document blue. */
function FileBadge({ name }: { name: string | null }) {
  const ext = (name?.split('.').pop() ?? '').toLowerCase();
  const kind =
    ext === 'pdf' ? 'pdf'
    : ['xls', 'xlsx', 'xlsm', 'csv'].includes(ext) ? 'xls'
    : ['doc', 'docx', 'odt', 'rtf'].includes(ext) ? 'doc'
    : ['ppt', 'pptx'].includes(ext) ? 'ppt'
    : 'other';
  const text = kind === 'other' ? (ext && ext.length <= 4 ? ext : 'file') : kind;
  return (
    <span className={'doc-badge doc-badge-' + kind} aria-hidden="true">
      {text.toUpperCase()}
    </span>
  );
}

/** "No changes to pick up.", "1 change picked up.", "{0} changes picked up.", never a bare "{0}s". */
function pickedMessage(t: (key: Key, ...args: (string | number)[]) => string, picked: number) {
  if (picked === 0) return t('ms.pickedNone');
  if (picked === 1) return t('ms.pickedOne');
  return t('ms.pickedMany', picked);
}

function DocumentRow({ doc: d }: { doc: WorkspaceDocument }) {
  const { t } = useI18n();
  const L = useLabels();
  const [showError, setShowError] = useState(false);

  return (
    <li className="doc-row">
      <FileBadge name={d.fileName} />

      <div>
        <span className="doc-name">{d.fileName ?? t('common.unnamedFile')}</span>
        <span className="doc-meta">
          {typeLabel(t, d.documentType)}, v{d.version}
          {d.current ? (
            <span className="chip chip-ok" style={{ marginLeft: 6 }}>
              {t('docs.current')}
            </span>
          ) : null}
        </span>
        <span className="doc-meta">
          {t('docs.colSatisfies')}: {d.agsaCriterion ? L.criterion(d.agsaCriterion) : t('docs.notStated')}
          {d.uploadedBy ? ', ' + d.uploadedBy : null}
        </span>
      </div>

      <div className="doc-cell">
        <div>
          {d.approvalStatus === 'APPROVED' ? (
            <span className="chip chip-ok">{t('docs.approved')}</span>
          ) : d.approvalStatus === 'REJECTED' ? (
            <span className="chip chip-danger">{t('docs.returned')}</span>
          ) : (
            <span className="chip chip-muted">{t('docs.pending')}</span>
          )}
          {d.decidedBy ? <span className="muted">{t('docs.by', d.decidedBy)}</span> : null}
        </div>
        <div>
          {d.receiptNumber ? (
            <>
              <span className="mono">{d.receiptNumber}</span>
              <span className="muted">{dateTime(d.receivedAt)}</span>
            </>
          ) : (
            <span className="chip chip-warn">{t('docs.awaitingReceipt')}</span>
          )}
        </div>
      </div>

      <div className="doc-cell">
        <MicrosoftStateChip state={d.microsoftState} />
        {d.microsoftWebUrl ? (
          <a href={d.microsoftWebUrl} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
            {t('ms.openInSharePoint')} <IconExternal size={12} />
          </a>
        ) : null}
        {d.microsoftState === 'FAILED' && d.microsoftError ? (
          <>
            <button type="button" className="link small" onClick={() => setShowError((v) => !v)}>
              {showError ? t('ms.hideError') : t('ms.showError')}
            </button>
            {showError ? (
              <p className="field-error" role="alert" style={{ margin: '4px 0 0' }}>
                {d.microsoftError}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="doc-when">
        <span><IconCalendar size={14} /> {date(d.uploadedAt) ?? '—'}</span>
        <span><IconPaperclip size={14} /> {fileSize(d.sizeBytes) ?? '—'}</span>
      </div>

      <a
        className="btn doc-open"
        href={api.documentContentUrl(d.id)}
        onClick={(e) => openFile(e, api.documentContentUrl(d.id), d.fileName ?? 'document')}
      >
        <IconDownload size={15} /> {t('common.download')}
      </a>
    </li>
  );
}

/** GraphSyncState, as a chip. FAILED gets the same treatment a returned decision gets: red and named. */
function MicrosoftStateChip({ state }: { state: string | null }) {
  const { t } = useI18n();
  const key: Key =
    state === 'SYNCED' ? 'ms.stateSynced'
    : state === 'FAILED' ? 'ms.stateFailed'
    : state === 'PENDING' ? 'ms.statePending'
    : state === 'SOURCE' ? 'ms.stateSource'
    : 'ms.stateNotConfigured';
  const tone =
    state === 'SYNCED' ? 'chip-ok'
    : state === 'FAILED' ? 'chip-danger'
    : state === 'PENDING' ? 'chip-warn'
    : 'chip-muted';
  return <span className={'chip ' + tone}>{t(key)}</span>;
}
