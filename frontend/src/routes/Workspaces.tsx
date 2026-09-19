/*
 * Workspaces.
 *
 * The design opens on four template cards and a grid of "My Workspaces" with member counts and
 * last-accessed times. None of that is stored: EntityWorkspace binds an entity to a Microsoft
 * drive and folder path, and there is no membership list, no template and no access timestamp.
 *
 * So this shows what a workspace actually is in this system, which is the join between an entity
 * and where its documents live, with the Microsoft binding state beside it. That is less
 * decorative and more useful: the question a reviewer has is whether the mirror is working, and
 * this answers it.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth, isDsac } from '../lib/auth';
import { num } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import { PageHead } from '../components/AppShell';
import { EmptyState, ErrorState, Loading } from '../components/Shell';
import { SearchField } from '../components/SearchField';
import {
  IconChevronRight, IconExternal, IconFolder, IconInfo, IconLandmark, IconTasks, IconWorkspaces,
} from '../icons';
import './Workspaces.css';

export function Workspaces() {
  const { t } = useI18n();
  const L = useLabels();
  const { me } = useAuth();
  const dsac = isDsac(me?.role);

  const portfolio = useAsync(() => api.portfolio(), [], dsac);
  /* The Microsoft binding is the Department's to manage, and the API refuses a reporter the
     status. Asking anyway made every reporter's screen say the build "does not report" it, which
     was the refusal showing through. A reporter is not asked and not shown the card. */
  const ms = useAsync(() => api.microsoftStatus(), [], dsac);
  const [query, setQuery] = useState('');

  /* A reporter has exactly one workspace, their own. There is no selector, for the same reason
     there is no entity dropdown anywhere else: the entity comes off the signed token. */
  const entities = useMemo(() => {
    if (!dsac) {
      return me?.entityId
        ? [{ entityId: me.entityId, name: me.entityName ?? t('ws.yourEntity'), sector: '', shortName: null }]
        : [];
    }
    const q = query.trim().toLowerCase();
    return (portfolio.data ?? [])
      .filter((r) => (q === '' ? true : r.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dsac, portfolio.data, query, me]);

  const msConfigured = useMemo(() => {
    const d = ms.data as Record<string, unknown> | null;
    if (!d) return null;
    const v = d.configured ?? d.enabled ?? d.bound;
    return typeof v === 'boolean' ? v : null;
  }, [ms.data]);

  return (
    <div>
      <PageHead
        icon={<IconWorkspaces size={26} />}
        title={t('ws.title')}
        subtitle={t('ws.sub')}
      >
        {dsac ? (
          <div style={{ minWidth: '16rem' }}>
            <SearchField
              label={t('ws.searchLabel')}
              placeholder={t('ws.searchPlaceholder')}
              value={query}
              onChange={setQuery}
            />
          </div>
        ) : null}
      </PageHead>

      {/* The Microsoft binding, stated rather than assumed. Department only; see above. */}
      {dsac ? (
      <div className="card card-sunk ws-status">
        <IconInfo size={18} />
        <div>
          <strong>
            {ms.loading
              ? t('ws.msChecking')
              : msConfigured === true
                ? t('ws.msConfigured')
                : msConfigured === false
                  ? t('ws.msNotConfigured')
                  : t('ws.msNotReported')}
          </strong>
          <p className="small muted" style={{ margin: '2px 0 0' }}>
            {t('ws.bindingNote')}
          </p>
        </div>
      </div>
      ) : null}

      {dsac && portfolio.loading ? (
        <Loading what={t('ws.what')} />
      ) : dsac && portfolio.error ? (
        <ErrorState message={portfolio.error} onRetry={portfolio.reload} />
      ) : entities.length === 0 ? (
        <EmptyState>
          {dsac
            ? t('ws.noMatch')
            : t('ws.noEntityId')}
        </EmptyState>
      ) : (
        <div className="ws-grid">
          {entities.map((e) => (
            <article className="card ws-card" key={e.entityId}>
              <div className="ws-card-head">
                <span className="ws-icon">
                  <IconLandmark size={20} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <h3>{e.name}</h3>
                  {e.sector ? (
                    <span className="chip chip-muted">{L.sector(String(e.sector))}</span>
                  ) : null}
                </div>
              </div>

              <div className="ws-links">
                <Link to={'/documents?entity=' + e.entityId} className="ws-link">
                  <IconFolder size={16} />
                  <span>{t('nav.documents')}</span>
                  <IconChevronRight size={15} className="muted" />
                </Link>
                <Link to={'/tasks'} className="ws-link">
                  <IconTasks size={16} />
                  <span>{t('nav.tasks')}</span>
                  <IconChevronRight size={15} className="muted" />
                </Link>
                {/* The Department's entity page is refused to a reporter; their own entity's
                    page is their reporting home. */}
                <Link to={dsac ? '/portfolio/entity/' + e.entityId : '/'} className="ws-link">
                  <IconExternal size={16} />
                  <span>{t('ws.entityProfile')}</span>
                  <IconChevronRight size={15} className="muted" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="small muted" style={{ marginTop: 'var(--space-5)' }}>
        {t(
          'ws.designNote',
          entities.length === 1
            ? t('ws.oneWorkspace')
            : t('ws.nWorkspaces', num(entities.length) ?? String(entities.length)),
        )}
      </p>
    </div>
  );
}
