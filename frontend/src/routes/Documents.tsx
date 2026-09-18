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
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth, isDsac } from '../lib/auth';
import { criterionLabel, dateTime, fileSize, num } from '../lib/format';
import { PageHead } from '../components/AppShell';
import { EmptyState, ErrorState, Loading, Tile } from '../components/Shell';
import {
  IconCheckCircle, IconExternal, IconFolder, IconPaperclip, IconShield,
} from '../icons';

export function Documents() {
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
        title="Documents"
        subtitle="Evidence and supporting files, with their version history and proof of receipt."
      >
        {dsac ? (
          <select
            aria-label="Entity"
            style={{ minWidth: '18rem' }}
            value={chosen ?? ''}
            onChange={(e) => setEntityId(e.target.value || null)}
          >
            <option value="">Choose an entity...</option>
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
          Choose an entity to see the documents held for it. A reporter sees their own entity
          automatically, because the entity comes off the signed token rather than from a dropdown.
        </EmptyState>
      ) : docs.loading ? (
        <Loading what="documents" />
      ) : docs.notFound ? (
        <EmptyState>No such entity, or it is not yours to read.</EmptyState>
      ) : docs.error ? (
        <ErrorState message={docs.error} onRetry={docs.reload} />
      ) : (
        <>
          <div className="tiles">
            <Tile icon={<IconFolder size={22} />} value={num(counts.total)} label="Documents" sub="All versions on record" />
            <Tile icon={<IconPaperclip size={22} />} tone="purple" value={num(counts.current)} label="Current versions" sub="Superseded ones stay on record" />
            <Tile icon={<IconShield size={22} />} tone="ok" value={num(counts.receipted)} label="Receipted" sub="The Department acknowledges holding these" />
            <Tile icon={<IconCheckCircle size={22} />} tone="ok" value={num(counts.approved)} label="Approved" sub="Decided by a named official" />
          </div>

          <div className="card" style={{ marginTop: 'var(--space-4)' }}>
            <div className="section-head">
              <h2>Files</h2>
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
                      <th>File</th>
                      <th className="num">Version</th>
                      <th>Receipt</th>
                      <th>Decision</th>
                      <th>Satisfies</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <strong style={{ display: 'block', color: 'var(--navy-ink)' }}>
                            {d.fileName ?? 'Unnamed file'}
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
                              current
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
                            <span className="chip chip-warn">awaiting receipt</span>
                          )}
                        </td>
                        <td className="small">
                          {d.approvalStatus === 'APPROVED' ? (
                            <span className="chip chip-ok">approved</span>
                          ) : d.approvalStatus === 'REJECTED' ? (
                            <span className="chip chip-danger">returned</span>
                          ) : (
                            <span className="chip chip-muted">pending</span>
                          )}
                          {d.decidedBy ? (
                            <span className="muted"> by {d.decidedBy}</span>
                          ) : null}
                        </td>
                        <td className="small muted">
                          {d.agsaCriterion ? criterionLabel(d.agsaCriterion) : 'not stated'}
                        </td>
                        <td>
                          <a href={api.documentContentUrl(d.id)} target="_blank" rel="noreferrer">
                            Open <IconExternal size={13} />
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
            A document is offered against one of the Auditor-General's tests, which is what makes
            this a readiness tool rather than a folder. Where the criterion reads "not stated" the
            uploader did not say, and that is itself worth a reviewer's attention.
          </p>
        </>
      )}
    </div>
  );
}
