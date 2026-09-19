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
 * Analytics & Insights is in the reviewer's and the executive's rails. It shows the trends the
 * data can actually carry: allocation and audited results per year, the same entities across two
 * audited years, and the current year quarter by quarter and by sector. The monthly series and
 * document counts in the designs are not there, because nothing records them.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import type { Key } from '../lib/i18n';
import type { MeView, Role } from '../lib/types';
import {
  IconAlert, IconBell, IconChart, IconChevronDown, IconChevronRight, IconCitation,
  IconExternal,
  IconFolder, IconGauge, IconHome, IconLandmark, IconList, IconMenu, IconSettings, IconSignOut,
  IconTasks, IconWorkspaces,
} from '../icons';
import { SearchField } from './SearchField';
import { LanguagePicker } from './LanguagePicker';
import { Arms } from './Arms';
import { AskKarabo } from './AskKarabo';
import { ConnectionBar } from './ConnectionBar';
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
}

/**
 * The rail, one list per role.
 *
 * Written out whole rather than filtered from one shared list, because the shared list is how
 * three DSAC roles ended up with the same eight entries. Each role gets the screens its job is
 * made of and nothing else (frontend design section 2 and journeys J3 and J4):
 *
 *   reporter   reports for one entity, taken from the token. Their home is the reporting screen
 *              itself (J1: no generic landing page), with anything the Department returned at
 *              the top. Documents, workspace and tasks are their side of the conversation.
 *   reviewer   works the risk-ranked queue and decides. Today, queue, risk, analytics, documents
 *              to decide on, the workspaces and tasks where the conversation with an entity happens.
 *   executive  reads the portfolio and never changes anything. Portfolio, the register to find
 *              one entity by name, analytics for whether it is improving, and the citizen
 *              view. No tasks, no workspaces, no recompute,
 *              because nothing there is theirs to act on.
 *   admin      sets quarter deadlines, registers entities, issues reporter accounts (there is no
 *              sign up), decides what the public sees, and binds workspaces to Microsoft 365. No
 *              queue and no risk screen: the admin holds no review capability at all, so that
 *              publication and approval always take two people. Tasks stay, because the reviewer
 *              hands the publication decision over as one.
 *
 * A route left out of a rail is still reachable by address where the capability allows it, so a
 * link from inside a screen keeps working. The rail is what each person is for, not the fence.
 */
function railFor(
  role: Role,
  { criticalCount, openTaskCount }: { criticalCount?: number | null; openTaskCount?: number | null },
): NavItem[] {
  const citizen: NavItem = { to: '/public', label: 'nav.citizenView', icon: <IconExternal size={19} />, external: true };
  const workspaces: NavItem = { to: '/workspaces', label: 'nav.workspaces', icon: <IconWorkspaces size={19} /> };
  const documents: NavItem = { to: '/documents', label: 'nav.documents', icon: <IconFolder size={19} /> };
  const analytics: NavItem = { to: '/analytics', label: 'nav.analytics', icon: <IconChart size={19} /> };
  const tasks: NavItem = { to: '/tasks', label: 'nav.tasks', icon: <IconTasks size={19} />, badge: openTaskCount ?? null };

  switch (role) {
    case 'ENTITY_REPORTER':
      return [
        { to: '/', label: 'nav.myReporting', icon: <IconCitation size={19} /> },
        documents,
        workspaces,
        tasks,
        citizen,
      ];
    case 'DSAC_REVIEWER':
      return [
        { to: '/', label: 'nav.today', icon: <IconHome size={19} /> },
        { to: '/review', label: 'nav.reviewQueue', icon: <IconList size={19} /> },
        { to: '/risk', label: 'nav.risk', icon: <IconAlert size={19} />, badge: criticalCount ?? null },
        analytics,
        documents,
        workspaces,
        tasks,
      ];
    case 'DSAC_EXECUTIVE':
      return [
        { to: '/', label: 'nav.portfolio', icon: <IconGauge size={19} /> },
        { to: '/entities', label: 'nav.entities', icon: <IconLandmark size={19} /> },
        analytics,
        citizen,
      ];
    case 'ADMIN':
      return [
        { to: '/', label: 'nav.administration', icon: <IconSettings size={19} /> },
        workspaces,
        tasks,
        citizen,
      ];
    default:
      return [];
  }
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

  const items = railFor(role, { criticalCount, openTaskCount });

  return (
    <div className={'shell' + (railOpen ? ' rail-open' : '') + (collapsed ? ' shell-collapsed' : '')}>
      {railOpen ? <div className="rail-scrim" onClick={() => setRailOpen(false)} /> : null}

      <nav className="rail" aria-label={t('nav.main')}>
        <div className="rail-brand">
          <Link to="/" className="rail-brand-link">
            <span className="rail-wordmark">
              {/* Decorative: the name sits beside it, so a screen reader hears "Vuka" once. When
                  the rail collapses the name goes and the mark stays, which is what the drawn
                  gold V used to stand in for. */}
              <img
                src="/img/vuka-logo.png"
                alt=""
                aria-hidden="true"
                className="rail-logo"
                width={34}
                height={28}
                draggable={false}
              />
              <span className="rail-label">Vuka</span>
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
          {items.map((i) =>
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

        <main className="shell-content">
          {/* Offline, copies on screen, and changes kept on this device. Absent when none apply. */}
          <ConnectionBar />
          {children}
        </main>
      </div>

      {/* Signed in, Karabo answers with this person's own access, which is what makes the
          staff questions answerable at all. On the landing page it sees published data only. */}
      <AskKarabo />
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
