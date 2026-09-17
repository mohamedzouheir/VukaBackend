/*
 * Surface C. Entity administration.
 *
 * UC-21 is the only part of this screen that is not a cut candidate, because nothing
 * reaches the citizen view without it and every seeded entity ships with publiclyVisible
 * false. The Department turns the public surface on rather than discovering it is already
 * on, and this is the switch.
 *
 * The screen deliberately does not create entities or register targets. Targets are loaded
 * from a tabled Annual Performance Plan and are versioned rather than mutable, so a form
 * that edits one in place would be a control the law does not permit. Section 12 cuts the
 * target registration screen for exactly that reason: it is a data loading task, not a
 * story.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { num, sectorLabel } from '../lib/format';
import { EmptyState, ErrorState, Loading } from '../components/Shell';
import { IconAlert, IconExternal, IconEye, IconEyeOff, IconSpinner } from '../icons';

export function EntityAdmin() {
  const entities = useAsync(() => api.adminEntities(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h1>Entities</h1>
          <p className="muted">
            {num(published)} of {num(rows.length)} published to the citizen view
          </p>
        </div>
        <span className="spacer" />
        <a className="btn" href="/public" target="_blank" rel="noreferrer">
          <IconExternal size={16} /> Open the citizen view
        </a>
      </div>

      <p className="ind-note ind-note-plain">
        <IconAlert size={16} />
        <span>
          Publication is a departmental decision and this system does not make it. Nothing reaches
          the citizen view unless it is switched on here, every seeded entity ships with it off, and
          every change is written to the audit log with the actor on it.
        </span>
      </p>

      {error ? <ErrorState message={error} /> : null}

      {rows.length === 0 ? (
        <EmptyState>
          No entities are registered. Seeding loads the funded bodies from published Estimates of
          National Expenditure figures on first start.
        </EmptyState>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Entity</th>
                <th>Sector</th>
                <th className="num">Targets</th>
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
                    {r.targetCount === 0 ? (
                      <em className="muted">none registered</em>
                    ) : (
                      num(r.targetCount)
                    )}
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

      <p className="small muted">
        Reporter accounts are issued by setting the role and entityId custom claims on a Firebase
        user through the Admin SDK. There is no form for it here on purpose: the claims can be set
        from a script, and an administrative screen nobody watches is the first thing section 12
        cuts.
      </p>
    </div>
  );
}
