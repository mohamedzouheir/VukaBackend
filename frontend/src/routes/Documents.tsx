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
import { api, openFile } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth, isDsac } from '../lib/auth';
import { dateTime, fileSize, num } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { PageHead } from '../components/AppShell';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import {
  IconCheckCircle, IconExternal, IconFolder, IconPaperclip, IconShield,
} from '../icons';

export function Documents() {
  const { t } = useI18n();
  const L = useLabels();
  const { me } = useAuth();
  const dsac = isDsac(me?.role);

  const portfolio = useAsync(() => api.portfolio(), [], dsac);
  const [entityId, setEntityId] = useState<string | null>(me?.entityId ?? null);

  const chosen = entityId ?? me?.entityId ?? null;
  const docs = useAsync(() => api.workspaceDocuments(chosen!), [chosen], Boolean(chosen));

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

  return (
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

          <div className="card" style={{ marginTop: 'var(--space-4)' }}>
            <div className="section-head">
              <h2>{t('docs.files')}</h2>
            </div>

            {rows.length === 0 ? (
              <EmptyState>
                No documents held for this entity. That is an empty shelf rather than a filing with
                nothing outstanding.
              </EmptyState>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('docs.colFile')}</th>
                      <th className="num">{t('docs.colVersion')}</th>
                      <th>{t('docs.colReceipt')}</th>
                      <th>{t('docs.colDecision')}</th>
                      <th>{t('docs.colSatisfies')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <strong style={{ display: 'block', color: 'var(--navy-ink)' }}>
                            {d.fileName ?? t('common.unnamedFile')}
                          </strong>
                          <span className="small muted">
                            {fileSize(d.sizeBytes)}
                            {d.uploadedBy ? ', ' + d.uploadedBy : null}
                            {d.uploadedAt ? ', ' + dateTime(d.uploadedAt) : null}
                          </span>
                        </td>
                        <td className="num">
                          v{d.version}
                          {d.current ? (
                            <span className="chip chip-ok" style={{ marginLeft: 6 }}>
                              {t('docs.current')}
                            </span>
                          ) : null}
                        </td>
                        <td className="small">
                          {d.receiptNumber ? (
                            <>
                              <span className="mono">{d.receiptNumber}</span>
                              <br />
                              <span className="muted">{dateTime(d.receivedAt)}</span>
                            </>
                          ) : (
                            <span className="chip chip-warn">{t('docs.awaitingReceipt')}</span>
                          )}
                        </td>
                        <td className="small">
                          {d.approvalStatus === 'APPROVED' ? (
                            <span className="chip chip-ok">{t('docs.approved')}</span>
                          ) : d.approvalStatus === 'REJECTED' ? (
                            <span className="chip chip-danger">{t('docs.returned')}</span>
                          ) : (
                            <span className="chip chip-muted">{t('docs.pending')}</span>
                          )}
                          {d.decidedBy ? (
                            <span className="muted"> {t('docs.by', d.decidedBy)}</span>
                          ) : null}
                        </td>
                        <td className="small muted">
                          {d.agsaCriterion ? L.criterion(d.agsaCriterion) : t('docs.notStated')}
                        </td>
                        <td>
                          <a
                            href={api.documentContentUrl(d.id)}
                            onClick={(e) => openFile(e, api.documentContentUrl(d.id), d.fileName ?? 'document')}
                          >
                            {t('common.open')} <IconExternal size={13} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="small muted" style={{ marginTop: 'var(--space-4)' }}>
            {t('docs.criterionNote')}
          </p>
        </>
      )}
    </div>
  );
}
