/*
 * The application frame from docs/Front End designs/: navy rail, search bar, content column,
 * and an optional right rail for quick actions and recent activity.
 *
 * <h2>What the rail shows, and what it refuses to show</h2>
 *
 * The designs put a count badge on Risk & Alerts and on Tasks. Both are rendered here only from
 * figures the API actually returns: the critical band count from the portfolio, and the caller's
 * own open tasks. A badge with nothing behind it is a number on a screen that cannot be defended,
 * which is the one thing this product exists not to do, so an unknown count renders as no badge
 * rather than as a zero or a guess.
 *
 * The designs also carry Analytics & Insights in the rail. It is present and it says plainly that
 * it is not built, because the trends it shows have no source: nothing in the schema records a
 * figure per month, and inventing one to fill a chart would undo the argument the rest of the
 * product makes.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, canReview, isDsac } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import type { Key } from '../lib/i18n';
import type { MeView, Role } from '../lib/types';
import {
  IconAlert, IconBell, IconChart, IconChevronDown, IconChevronRight, IconCitation,
  IconExternal,
  IconFolder, IconHome, IconLandmark, IconList, IconMenu, IconSettings, IconSignOut,
  IconTasks, IconWorkspaces,
} from '../icons';
import { SearchField } from './SearchField';
import { LanguagePicker } from './LanguagePicker';
import { Arms } from './Arms';
import './AppShell.css';

interface NavItem {
  to: string;
  /* The key rather than the word, so the rail is rebuilt in the chosen language on every render
     instead of being frozen in whatever language the array was written in. */
  label: Key;
  icon: ReactNode;
  /** Absent means no badge. Never rendered as zero. */
  badge?: number | null;
  /** External to the single page application. */
  external?: boolean;
  visible: (role: Role) => boolean;
}

export function AppShell({
  children,
  criticalCount,
  openTaskCount,
}: {
  children: ReactNode;
  criticalCount?: number | null;
  openTaskCount?: number | null;
}) {
  const { me, devAuth, signOut } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [railOpen, setRailOpen] = useState(false);

  /* Collapsed to icons only. Remembered per browser, because it is a working preference rather
     than application state: somebody who wants the width back for a wide table wants it back
     tomorrow too. Wrapped because storage throws in a private window. */
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('vuka.rail.collapsed') === 'true';
    } catch {
      return false;
    }
  });

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem('vuka.rail.collapsed', String(next));
      } catch {
        // A browser that refuses storage still gets the toggle, it just forgets it.
      }
      return next;
    });
  }

  // A route change closes the rail on a phone, otherwise it stays over the page you just opened.
  useEffect(() => setRailOpen(false), [location.pathname]);

  if (!me) return <>{children}</>;
  const role = me.role;

  const items: NavItem[] = [
    { to: '/', label: 'nav.dashboard', icon: <IconHome size={19} />, visible: () => true },
    { to: '/entities', label: 'nav.entities', icon: <IconLandmark size={19} />, visible: isDsac },
    { to: '/review', label: 'nav.reports', icon: <IconCitation size={19} />, visible: (r) => canReview(r) },
    { to: '/entity', label: 'nav.myReporting', icon: <IconCitation size={19} />, visible: (r) => r === 'ENTITY_REPORTER' },
    { to: '/documents', label: 'nav.documents', icon: <IconFolder size={19} />, visible: () => true },
    { to: '/analytics', label: 'nav.analytics', icon: <IconChart size={19} />, visible: isDsac },
    {
      to: '/risk',
      label: 'nav.risk',
      icon: <IconAlert size={19} />,
      badge: criticalCount ?? null,
      visible: isDsac,
    },
    { to: '/workspaces', label: 'nav.workspaces', icon: <IconWorkspaces size={19} />, visible: () => true },
    {
      to: '/tasks',
      label: 'nav.tasks',
      icon: <IconTasks size={19} />,
      badge: openTaskCount ?? null,
      visible: () => true,
    },
    { to: '/logs', label: 'nav.audit', icon: <IconList size={19} />, visible: () => true },
    { to: '/public', label: 'nav.citizenView', icon: <IconExternal size={19} />, external: true, visible: () => true },
    { to: '/admin/entities', label: 'nav.settings', icon: <IconSettings size={19} />, visible: (r) => r === 'ADMIN' },
  ];

  return (
    <div className={'shell' + (railOpen ? ' rail-open' : '') + (collapsed ? ' shell-collapsed' : '')}>
      {railOpen ? <div className="rail-scrim" onClick={() => setRailOpen(false)} /> : null}

      <nav className="rail" aria-label="Main">
        <div className="rail-brand">
          <Link to="/" className="rail-brand-link">
            <span className="rail-wordmark">
              <span className="rail-wordmark-v">V</span>
              <span className="rail-label">uka</span>
            </span>
            <p className="rail-tagline rail-label">{t('nav.tagline')}</p>
          </Link>
          <button
            type="button"
            className="rail-collapse"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
          >
            <IconChevronRight size={16} />
          </button>
        </div>

        <div className="rail-nav">
          {items
            .filter((i) => i.visible(role))
            .map((i) =>
              i.external ? (
                <a key={i.to} href={i.to} target="_blank" rel="noreferrer" title={t(i.label)}>
                  {i.icon}
                  <span className="rail-label">{t(i.label)}</span>
                  <span className="spacer rail-label" />
                  <IconExternal size={14} className="rail-label" />
                </a>
              ) : (
                <NavLink key={i.to} to={i.to} end={i.to === '/'} title={t(i.label)}>
                  {i.icon}
                  <span className="rail-label">{t(i.label)}</span>
                  <span className="spacer rail-label" />
                  {/* Only a count the API actually returned. Absent stays absent. */}
                  {typeof i.badge === 'number' && i.badge > 0 ? (
                    <span className="rail-badge">{i.badge}</span>
                  ) : null}
                </NavLink>
              ),
            )}
        </div>

        <div className="rail-foot rail-label">
          <div className="rail-dept">
            <span className="rail-dept-arms">
              <Arms size={34} />
            </span>
            <span className="rail-dept-text">
              <strong>{t('dept.name')}</strong>
              {t('dept.line1')}
              <br />
              {t('dept.line2')}
              <br />
              {t('dept.line3')}
            </span>
          </div>
          <p className="rail-motto">{t('dept.motto')}</p>
          <div className="rail-flag" aria-hidden="true">
            <span style={{ background: '#007A4D' }} />
            <span style={{ background: '#FFB612' }} />
            <span style={{ background: '#DE3831' }} />
            <span style={{ background: '#002395' }} />
            <span style={{ background: '#000' }} />
          </div>
        </div>
      </nav>

      <div className="shell-main">
        <header className="topbar">
          <button
            type="button"
            className="rail-toggle"
            onClick={() => setRailOpen((o) => !o)}
            aria-label={t('nav.openNav')}
            aria-expanded={railOpen}
          >
            <IconMenu size={20} />
          </button>

          {/* Present because every screen in the designs has it. It is not wired to a search
              endpoint, because there is not one: it routes to the entity register, which is the
              only list the API can actually search over today. */}
          <div className="topbar-search">
            <SearchField
              pill
              label={t('nav.searchLabel')}
              placeholder={t('nav.search')}
              onSubmit={(q) => navigate('/entities?q=' + encodeURIComponent(q))}
            />
          </div>

          <div className="topbar-right">
            {/* The same control as the front door. A reporting officer who chose isiZulu on the
                way in should not have to go back out to the landing page to change their mind. */}
            <LanguagePicker compact />

            <button type="button" className="topbar-bell" aria-label={t('nav.alerts')}>
              <IconBell size={20} />
              {typeof criticalCount === 'number' && criticalCount > 0 ? (
                <span className="rail-badge">{criticalCount}</span>
              ) : null}
            </button>

            <div className="topbar-user">
              <span className="topbar-avatar">{initials(me)}</span>
              <span className="topbar-who">
                <strong>{me.name ?? me.email ?? t('signin.submit')}</strong>
                <span>{t(roleKey(me.role))}</span>
              </span>
              <button
                type="button"
                className="topbar-bell"
                onClick={() => void signOut()}
                aria-label={t('nav.signOut')}
                title={t('nav.signOut')}
              >
                <IconSignOut size={18} />
              </button>
              <IconChevronDown size={16} className="muted" />
            </div>
          </div>
        </header>

        {devAuth ? <p className="dev-banner">{t('nav.devBanner')}</p> : null}

        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}

function initials(me: MeView): string {
  const source = me.name ?? me.email ?? '?';
  const parts = source.split(/[\s.@]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function roleKey(role: Role): Key {
  switch (role) {
    case 'ENTITY_REPORTER':
      return 'role.reporter';
    case 'DSAC_REVIEWER':
      return 'role.reviewer';
    case 'DSAC_EXECUTIVE':
      return 'role.executive';
    default:
      return 'role.admin';
  }
}

/* ------------------------------------------------------------------ */
/* The page header pattern: icon tile, title, subtitle, actions.       */
/* ------------------------------------------------------------------ */

export function PageHead({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <span className="page-icon">{icon}</span>
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <span className="spacer" />
      {children ? <div className="row">{children}</div> : null}
    </div>
  );
}
