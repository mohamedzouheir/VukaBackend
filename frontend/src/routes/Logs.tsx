/*
 * The audit trail.
 *
 * Who did what, to which figure, and when, read out of the records themselves rather than from a
 * separate event table. Filterable by date, entity and kind, and exportable as a CSV that carries
 * its own filter in the header, because the reason somebody draws this is usually to hand it to
 * an auditor or a committee and a spreadsheet with no statement of its range invites a challenge.
 *
 * <h2>Two things this screen is careful about</h2>
 *
 * The actor is shown exactly as it was recorded at the time, never resolved fresh. If a person's
 * display name changes, a figure they confirmed last quarter still says who confirmed it under
 * the name they used. Resolving names at read time would quietly rewrite history.
 *
 * Where no name was stored the cell reads "Not recorded" rather than being left blank or filled
 * with a uid. Blank looks like a rendering fault, a uid is noise, and the honest statement is
 * that the name is not on the record.
 */
import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth, isDsac } from '../lib/auth';
import { num } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { Key } from '../lib/i18n';
import { PageHead } from '../components/AppShell';
import { SearchField } from '../components/SearchField';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import {
  IconCheckCircle, IconCitation, IconComment, IconDownload, IconFolder, IconInfo, IconList,
  IconPaperclip, IconReturn, IconSpinner, IconUser,
} from '../icons';
import './Logs.css';

/** The kinds, in the words the rest of the interface uses. */
const TYPE_KEYS: Record<string, Key> = {
  FIGURE_CONFIRMED: 'audit.kindFigureConfirmed',
  SUBMISSION_OPENED: 'audit.kindPeriodOpened',
  SUBMISSION_SUBMITTED: 'audit.kindSubmitted',
  SUBMISSION_REVIEWED: 'audit.kindReviewed',
  DOCUMENT_UPLOADED: 'audit.kindDocUploaded',
  DOCUMENT_RECEIPTED: 'audit.kindReceipt',
  DOCUMENT_DECIDED: 'audit.kindDocDecided',
  COMMENT: 'audit.kindComment',
  COMMENT_RESOLVED: 'audit.kindCommentResolved',
};

function typeIcon(type: string) {
  switch (type) {
    case 'FIGURE_CONFIRMED':
      return <IconCheckCircle size={15} />;
    case 'SUBMISSION_SUBMITTED':
    case 'SUBMISSION_OPENED':
      return <IconCitation size={15} />;
    case 'SUBMISSION_REVIEWED':
      return <IconReturn size={15} />;
    case 'DOCUMENT_UPLOADED':
      return <IconFolder size={15} />;
    case 'DOCUMENT_RECEIPTED':
      return <IconPaperclip size={15} />;
    case 'DOCUMENT_DECIDED':
      return <IconCheckCircle size={15} />;
    default:
      return <IconComment size={15} />;
  }
}

/** Defaults to the last thirty days, which is the range somebody almost always wants. */
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function Logs() {
  const { t } = useI18n();

  /** The stored code in the chosen language, falling through to the code where it is unknown. */
  function kindLabel(type: string): string {
    const key = TYPE_KEYS[type];
    return key ? t(key) : type;
  }
  const { me } = useAuth();
  const dsac = isDsac(me?.role);

  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [query, setQuery] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const rangeValid = from !== '' && to !== '' && from <= to;

  const trail = useAsync(
    () => api.auditTrail({ from, to, type: type || undefined, entityId: entityId || undefined }),
    [from, to, type, entityId],
    rangeValid,
  );
  const portfolio = useAsync(() => api.portfolio(), [], dsac);

  const events = trail.data?.events ?? [];

  /* Search is client side over the rows already fetched. Anything wider than the fetched range
     is a question for the range, not for the search box, and a server side text search over four
     joined tables is a great deal of machinery for a list this size. */
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return events;
    return events.filter((e) =>
      [e.actor, e.entity, e.summary, e.detail, kindLabel(e.type)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [events, query]);

  const counts = useMemo(() => {
    const byType = new Map<string, number>();
    for (const e of events) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    return {
      total: events.length,
      confirmations: byType.get('FIGURE_CONFIRMED') ?? 0,
      submissions: (byType.get('SUBMISSION_SUBMITTED') ?? 0) + (byType.get('SUBMISSION_REVIEWED') ?? 0),
      documents:
        (byType.get('DOCUMENT_UPLOADED') ?? 0) +
        (byType.get('DOCUMENT_DECIDED') ?? 0) +
        (byType.get('DOCUMENT_RECEIPTED') ?? 0),
    };
  }, [events]);

  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await api.download(
        api.auditExportUrl({ from, to, type: type || undefined, entityId: entityId || undefined }),
        'vuka-audit_' + from + '_to_' + to + '.csv',
      );
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : t('audit.exportFailed'));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <PageHead
        icon={<IconList size={26} />}
        title={t('audit.title')}
        subtitle={t('audit.sub')}
      >
        <button
          type="button"
          className="primary"
          onClick={() => void download()}
          disabled={downloading || !rangeValid}
        >
          {downloading ? <IconSpinner size={16} className="spin" /> : <IconDownload size={16} />}
          Export CSV
        </button>
      </PageHead>

      <div className="tiles">
        <Tile icon={<IconList size={22} />} value={num(counts.total)} label={t('audit.eventsInRange')} sub={t('audit.rangeSub', from, to)} />
        <Tile icon={<IconCheckCircle size={22} />} tone="ok" value={num(counts.confirmations)} label={t('audit.figuresConfirmed')} sub={t('audit.figuresConfirmedSub')} />
        <Tile icon={<IconCitation size={22} />} tone="purple" value={num(counts.submissions)} label={t('audit.filings')} sub={t('audit.filingsSub')} />
        <Tile icon={<IconFolder size={22} />} tone="warn" value={num(counts.documents)} label={t('audit.documentEvents')} sub={t('audit.documentEventsSub')} />
      </div>

      {/* ---------------- filters ---------------- */}
      <div className="card log-filters">
        <div className="log-filter">
          <label htmlFor="log-from">{t('audit.from')}</label>
          <input
            id="log-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            aria-invalid={!rangeValid || undefined}
          />
        </div>

        <div className="log-filter">
          <label htmlFor="log-to">{t('audit.to')}</label>
          <input
            id="log-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            aria-invalid={!rangeValid || undefined}
          />
        </div>

        <div className="log-filter">
          <label htmlFor="log-type">{t('audit.kind')}</label>
          <select id="log-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t('audit.allKinds')}</option>
            {(trail.data?.types ?? Object.keys(TYPE_KEYS)).map((kind) => (
              <option key={kind} value={kind}>
                {kindLabel(kind)}
              </option>
            ))}
          </select>
        </div>

        {dsac ? (
          <div className="log-filter">
            <label htmlFor="log-entity">{t('entities.colEntity')}</label>
            <select id="log-entity" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              <option value="">{t('audit.everyEntity')}</option>
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

        <div className="log-filter log-filter-grow">
          <label htmlFor="log-search">{t('common.search')}</label>
          <SearchField
            label={t('audit.searchLabel')}
            placeholder={t('audit.searchPlaceholder')}
            value={query}
            onChange={setQuery}
          />
        </div>

        <div className="log-filter">
          <label aria-hidden="true">&nbsp;</label>
          <button
            type="button"
            onClick={() => {
              setFrom(isoDaysAgo(30));
              setTo(new Date().toISOString().slice(0, 10));
              setType('');
              setEntityId('');
              setQuery('');
            }}
          >
            {t('common.reset')}
          </button>
        </div>
      </div>

      {!rangeValid ? (
        <p className="ind-note ind-note-warn">
          <IconInfo size={16} />
          <span>{t('audit.rangeInvalid')}</span>
        </p>
      ) : null}

      {downloadError ? <ErrorState message={downloadError} /> : null}

      {trail.data?.scopedToOwnEntity ? (
        <p className="ind-note ind-note-plain">
          <IconUser size={16} />
          <span>{trail.data.note}</span>
        </p>
      ) : null}

      {/* ---------------- the trail ---------------- */}
      <div className="card card-table">
        <div className="section-head">
          <h2>{t('audit.events')}</h2>
          <span className="spacer" />
          <p className="small muted">
            {trail.loading
              ? null
              : rows.length === 1
                ? t('audit.oneEvent')
                : t('audit.eventCount', num(rows.length) ?? '')}
            {rows.length !== events.length ? t('audit.ofInRange', num(events.length) ?? '') : null}
          </p>
        </div>

        {!rangeValid ? null : trail.loading ? (
          <div style={{ padding: 'var(--space-5)' }}>
            <Loading what={t('audit.what')} />
          </div>
        ) : trail.error ? (
          <div style={{ padding: 'var(--space-5)' }}>
            <ErrorState message={trail.error} onRetry={trail.reload} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 'var(--space-5)' }}>
            <EmptyState>
              {events.length === 0 ? t('audit.empty') : t('audit.noSearchMatch')}
            </EmptyState>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('audit.colWhen')}</th>
                  <th>{t('audit.kind')}</th>
                  <th>{t('audit.colWho')}</th>
                  {dsac ? <th>{t('entities.colEntity')}</th> : null}
                  <th>{t('audit.colWhat')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => (
                  <tr key={e.recordId + '-' + e.type + '-' + i}>
                    <td className="log-when mono">{e.at}</td>
                    <td>
                      <span className="chip chip-muted log-kind">
                        {typeIcon(e.type)}
                        {kindLabel(e.type)}
                      </span>
                    </td>
                    {/* The backend writes the literal "Not recorded" where no actor is on the
                        record, so the comparison stays in English and only the display translates. */}
                    <td className={e.actor === 'Not recorded' ? 'muted' : undefined}>
                      {e.actor === 'Not recorded' ? <em>{t('audit.notRecorded')}</em> : e.actor}
                    </td>
                    {dsac ? <td className="small">{e.entity}</td> : null}
                    <td>
                      {e.summary}
                      {e.detail ? <span className="log-detail">{e.detail}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="small muted" style={{ marginTop: 'var(--space-4)' }}>
        {t('audit.footNote')}
      </p>
    </div>
  );
}
