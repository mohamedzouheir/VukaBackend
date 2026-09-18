/*
 * The frame every office screen sits in, plus the small pieces that are not one of the
 * nine components: the modal, the states a screen shows when a request fails, and the
 * sector chip.
 *
 * The navigation is built from the role rather than filtered by it. A reporter has no
 * route into the portfolio in the first place, which is a weaker claim than the backend's
 * but it means the interface never shows a control that will be refused.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth, can, isDsac } from '../lib/auth';
import { sectorLabel } from '../lib/format';
import {
  IconAlert, IconChart, IconGauge, IconInfo, IconLandmark, IconList, IconLock,
  IconSignOut, IconSpinner, IconX,
} from '../icons';
import './Shell.css';

export function Shell({ children }: { children: ReactNode }) {
  const { me, devAuth, signOut } = useAuth();
  const role = me?.role;

  return (
    <div className="app">
      {devAuth ? (
        <p className="dev-banner">
          <IconLock size={15} />
          <span>
            Development sign in is enabled. Tokens are not verified and any role can be assumed.
            Never run a deployed environment this way.
          </span>
        </p>
      ) : null}

      <header className="topbar">
        <Link to="/" className="wordmark">
          VUKA
        </Link>

        {me ? (
          <span className="context">
            {me.entityName ?? (isDsac(role) ? 'Department of Sport, Arts and Culture' : null)}
          </span>
        ) : null}

        <span className="spacer" />

        {me ? (
          <>
            <nav className="nav" aria-label="Main">
              {can(me, 'SUBMIT_REPORTING') ? (
                <NavLink to="/entity">
                  <IconLandmark size={16} /> My entity
                </NavLink>
              ) : null}
              {can(me, 'REVIEW_SUBMISSIONS') ? (
                <NavLink to="/review">
                  <IconList size={16} /> Review queue
                </NavLink>
              ) : null}
              {can(me, 'VIEW_PORTFOLIO') ? (
                <NavLink to="/portfolio">
                  <IconChart size={16} /> Portfolio
                </NavLink>
              ) : null}
              {can(me, 'ADMINISTER') ? (
                <NavLink to="/admin/entities">
                  <IconGauge size={16} /> Administration
                </NavLink>
              ) : null}
            </nav>

            <span className="context nowrap">
              {me.name ?? me.email}
              {role === 'DSAC_EXECUTIVE' ? ', read only' : null}
            </span>

            <button type="button" className="signout" onClick={() => void signOut()}>
              <IconSignOut size={16} />
              <span className="visually-hidden">Sign out</span>
            </button>
          </>
        ) : null}
      </header>

      <main>{children}</main>

      <footer className="footer">
        <p className="small muted">
          Vuka. Performance reporting and audit readiness for the bodies funded by the Department of
          Sport, Arts and Culture. Risk weights are fixed and published, and every score is
          arithmetic rather than a prediction.
        </p>
        <p className="small muted">
          {/* A plain link: /public is server rendered, so a router Link lands on the not found route. */}
          <a href="/public">The citizen view</a> is open to anyone and shows only the entities
          the Department has chosen to publish.
        </p>
      </footer>
    </div>
  );
}

/* ---------- the states a screen shows when a request does not succeed ---------- */

export function Loading({ what }: { what: string }) {
  return (
    <p className="screen-state" role="status">
      <IconSpinner size={18} className="spin" />
      <span>Loading {what}.</span>
    </p>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="screen-state screen-state-error" role="alert">
      <IconAlert size={18} />
      <span>{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * Denied is never an error and never a forbidden. A reporter who somehow reaches another
 * entity's submission gets a not found, because telling a caller that a record exists but
 * is not theirs is itself a disclosure about another entity. The backend already behaves
 * this way in ExportController and this is the frontend matching it.
 */
export function NotFoundState({ what = 'record' }: { what?: string }) {
  return (
    <div className="screen-state" role="status">
      <IconInfo size={18} />
      <span>
        No such {what}. If you followed a link, it may have been for a different entity or a
        different period.
      </span>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="screen-state" role="status">
      <IconInfo size={18} />
      <span>{children}</span>
    </div>
  );
}

/* ---------- modal ---------- */

/**
 * Used only for the two irreversible actions and the evidence drawer.
 *
 * Nothing irreversible happens without a sentence saying so, in the same click.
 * Confirming a figure and submitting a period are the two, and both carry a plain
 * statement of what becomes permanent and whose name goes on it, in the modal rather
 * than in a tooltip, before the button rather than after it. Everything else is a single
 * click with no ceremony, which is what buys the attention for these two.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="panel-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={'panel' + (wide ? ' panel-wide' : ' panel-narrow')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="panel-head">
          <h2 id="modal-title">{title}</h2>
          <span className="spacer" />
          <button type="button" className="panel-close" onClick={onClose} ref={close}>
            <IconX size={18} />
            <span className="visually-hidden">Close</span>
          </button>
        </div>
        <div className="panel-body modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------- small pieces ---------- */

export function SectorChip({ sector }: { sector: string }) {
  return <span className="chip">{sectorLabel(sector)}</span>;
}

export function Tile({
  value,
  label,
  sub,
  tone,
}: {
  value: string | null;
  label: string;
  sub?: string;
  tone?: 'critical';
}) {
  return (
    <div className={'tile' + (tone === 'critical' ? ' tile-critical' : '')}>
      <p className="tile-value">{value ?? '—'}</p>
      <p className="tile-label">{label}</p>
      {sub ? <p className="tile-sub">{sub}</p> : null}
    </div>
  );
}
