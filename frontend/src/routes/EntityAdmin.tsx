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
import { num } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { EmptyState, ErrorState, Loading } from '../components/Shell';
import { IconAlert, IconExternal, IconEye, IconEyeOff, IconSpinner } from '../icons';

export function EntityAdmin() {
  const { t } = useI18n();
  const L = useLabels();
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
      setError(e instanceof Error ? e.message : t('admin.flagNotChanged'));
    } finally {
      setBusy(null);
    }
  }

  if (entities.loading) return <Loading what={t('admin.what')} />;
  if (entities.error) return <ErrorState message={entities.error} onRetry={entities.reload} />;

  const rows = entities.data ?? [];
  const published = rows.filter((r) => r.publiclyVisible).length;

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h1>{t('admin.title')}</h1>
          <p className="muted">
            {t('admin.publishedCount', num(published) ?? '', num(rows.length) ?? '')}
          </p>
        </div>
        <span className="spacer" />
        <a className="btn" href="/public" target="_blank" rel="noreferrer">
          <IconExternal size={16} /> {t('admin.openCitizenView')}
        </a>
      </div>

      <p className="ind-note ind-note-plain">
        <IconAlert size={16} />
        <span>
          {t('admin.publicationNoteLong')}
        </span>
      </p>

      {error ? <ErrorState message={error} /> : null}

      {rows.length === 0 ? (
        <EmptyState>
          {t('admin.noEntities')}
        </EmptyState>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('entities.colEntity')}</th>
                <th>{t('entities.colSector')}</th>
                <th className="num">{t('admin.colTargets')}</th>
                <th>{t('admin.citizenView')}</th>
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
                    {r.targetCount === 0 ? (
                      <em className="muted">{t('admin.noneRegistered')}</em>
                    ) : (
                      num(r.targetCount)
                    )}
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

      <p className="small muted">
        Reporter accounts are issued by setting the role and entityId custom claims on a Firebase
        user through the Admin SDK. There is no form for it here on purpose: the claims can be set
        from a script, and an administrative screen nobody watches is the first thing section 12
        cuts.
      </p>
    </div>
  );
}
