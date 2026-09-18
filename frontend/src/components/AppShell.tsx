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
import type { MeView, Role } from '../lib/types';
import {
  IconAlert, IconArms, IconBell, IconChart, IconChevronDown, IconChevronRight, IconCitation,
  IconExternal,
  IconFolder, IconGauge, IconHome, IconLandmark, IconList, IconMenu, IconSettings, IconSignOut,
  IconTasks, IconWorkspaces,
} from '../icons';
import { SearchField } from './SearchField';
import './AppShell.css';

interface NavItem {
  to: string;
  label: string;
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
  const citizen: NavItem = { to: '/public', label: 'Citizen View', icon: <IconExternal size={19} />, external: true };
  const workspaces: NavItem = { to: '/workspaces', label: 'Workspaces', icon: <IconWorkspaces size={19} /> };
  const documents: NavItem = { to: '/documents', label: 'Documents', icon: <IconFolder size={19} /> };
  const analytics: NavItem = { to: '/analytics', label: 'Analytics', icon: <IconChart size={19} /> };
  const tasks: NavItem = { to: '/tasks', label: 'Tasks', icon: <IconTasks size={19} />, badge: openTaskCount ?? null };

  switch (role) {
    case 'ENTITY_REPORTER':
      return [
        { to: '/', label: 'My reporting', icon: <IconCitation size={19} /> },
        documents,
        workspaces,
        tasks,
        citizen,
      ];
    case 'DSAC_REVIEWER':
      return [
        { to: '/', label: 'Today', icon: <IconHome size={19} /> },
        { to: '/review', label: 'Review queue', icon: <IconList size={19} /> },
        { to: '/risk', label: 'Risk & Alerts', icon: <IconAlert size={19} />, badge: criticalCount ?? null },
        analytics,
        documents,
        workspaces,
        tasks,
      ];
    case 'DSAC_EXECUTIVE':
      return [
        { to: '/', label: 'Portfolio', icon: <IconGauge size={19} /> },
        { to: '/entities', label: 'Entities', icon: <IconLandmark size={19} /> },
        analytics,
        citizen,
      ];
    case 'ADMIN':
      return [
        { to: '/', label: 'Administration', icon: <IconSettings size={19} /> },
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

      <nav className="rail" aria-label="Main">
        <div className="rail-brand">
          <Link to="/" className="rail-brand-link">
            <span className="rail-wordmark">
              <span style={{ color: '#3B9BF5' }}>V</span>
              <span className="rail-label">uka</span>
            </span>
            <p className="rail-tagline rail-label">Transparent. Accountable. Impactful.</p>
          </Link>
          <button
            type="button"
            className="rail-collapse"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand the navigation' : 'Collapse the navigation'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <IconChevronRight size={16} />
          </button>
        </div>

        <div className="rail-nav">
          {items.map((i) =>
              i.external ? (
                <a key={i.to} href={i.to} target="_blank" rel="noreferrer" title={i.label}>
                  {i.icon}
                  <span className="rail-label">{i.label}</span>
                  <span className="spacer rail-label" />
                  <IconExternal size={14} className="rail-label" />
                </a>
              ) : (
                <NavLink key={i.to} to={i.to} end={i.to === '/'} title={i.label}>
                  {i.icon}
                  <span className="rail-label">{i.label}</span>
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
              <IconArms size={30} />
            </span>
            <span className="rail-dept-text">
              <strong>sport, arts &amp; culture</strong>
              Department:
              <br />
              Sport, Arts and Culture
              <br />
              REPUBLIC OF SOUTH AFRICA
            </span>
          </div>
          <p className="rail-motto">
            Better reporting.
            <br />
            Stronger institutions.
            <br />
            A brighter South Africa.
          </p>
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
            aria-label="Open the navigation"
            aria-expanded={railOpen}
          >
            <IconMenu size={20} />
          </button>

          {/* Present because every screen in the designs has it. It is not wired to a search
              endpoint, because there is not one: it routes to the entity register, which is the
              only list the API can actually search over today. */}
          {/* Present because every screen in the designs has it. It is not wired to a search
              endpoint, because there is not one: it routes to the entity register, which is the
              only list the API can actually search over today. */}
          <div className="topbar-search">
            <SearchField
              pill
              label="Search entities, reports and documents"
              placeholder="Search entities, reports, documents..."
              onSubmit={(q) => navigate('/entities?q=' + encodeURIComponent(q))}
            />
          </div>

          <div className="topbar-right">
            <button type="button" className="topbar-bell" aria-label="Alerts">
              <IconBell size={20} />
              {typeof criticalCount === 'number' && criticalCount > 0 ? (
                <span className="rail-badge">{criticalCount}</span>
              ) : null}
            </button>

            <div className="topbar-user">
              <span className="topbar-avatar">{initials(me)}</span>
              <span className="topbar-who">
                <strong>{me.name ?? me.email ?? 'Signed in'}</strong>
                <span>{roleLabel(me.role)}</span>
              </span>
              <button
                type="button"
                className="topbar-bell"
                onClick={() => void signOut()}
                aria-label="Sign out"
                title="Sign out"
              >
                <IconSignOut size={18} />
              </button>
              <IconChevronDown size={16} className="muted" />
            </div>
          </div>
        </header>

        {devAuth ? (
          <p className="dev-banner">
            Development sign in is enabled. Tokens are not verified and any role can be assumed.
            Never run a deployed environment this way.
          </p>
        ) : null}

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

function roleLabel(role: Role): string {
  switch (role) {
    case 'ENTITY_REPORTER':
      return 'Entity reporter';
    case 'DSAC_REVIEWER':
      return 'DSAC reviewer';
    case 'DSAC_EXECUTIVE':
      return 'DSAC executive, read only';
    case 'ADMIN':
      return 'DSAC admin';
    default:
      return String(role);
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
