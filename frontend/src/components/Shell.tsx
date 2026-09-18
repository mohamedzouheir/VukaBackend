/*
 * The pieces every screen shares that are not one of the nine components: the five states a
 * screen shows while a request is in flight or after it fails, the modal used for the two
 * irreversible actions, and the stat tile.
 *
 * The frame itself moved to AppShell when the interface was rebuilt against the screens in
 * docs/Front End designs/.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { sectorLabel } from '../lib/format';
import { IconAlert, IconInfo, IconSpinner, IconX } from '../icons';
import './Shell.css';

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
  icon,
}: {
  /** Already formatted. Null renders as a dash, never as a zero. */
  value: string | null;
  label: string;
  sub?: string;
  tone?: 'ok' | 'warn' | 'critical' | 'purple';
  icon?: ReactNode;
}) {
  return (
    <div className={'tile' + (tone ? ' tile-' + tone : '')}>
      {icon ? <span className="tile-icon">{icon}</span> : null}
      <div className="tile-body">
        <p className="tile-value">{value ?? '—'}</p>
        <p className="tile-label">{label}</p>
        {sub ? <p className="tile-sub">{sub}</p> : null}
      </div>
    </div>
  );
}
