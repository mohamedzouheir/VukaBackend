/*
 * One bar under the top bar that says what the offline layer is doing, and nothing when it is
 * doing nothing.
 *
 * A change kept on the device looks exactly like a change that was made unless something says
 * otherwise, and a reviewer who believes an approval went through when it did not is worse off
 * than one who was told it failed. So every kept change is listed here by name, with the time it
 * was kept, until it is sent or discarded, and a refused one says why in the server's words.
 *
 * Counts read as one sentence or another rather than through a plural rule, because the five
 * languages do not agree on where the break falls and a rule that is right in English is wrong
 * somewhere else. Two keys per count is duller and correct.
 */
import { useState } from 'react';
import { discard, replay, useOffline } from '../lib/offline';
import { useI18n } from '../lib/i18n';
import './components.css';

function time(iso: string) {
  return new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

export function ConnectionBar() {
  const { online, copyFrom, outbox, sending, signin } = useOffline();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const failed = outbox.find((i) => i.state === 'failed') ?? null;
  const waiting = outbox.length;
  const one = waiting === 1;

  if (online && waiting === 0 && !copyFrom) return null;

  let line: string;
  if (failed) {
    /* The server's own words, which are not ours to translate. */
    line = t('conn.failed', failed.note ?? t('conn.refused'));
  } else if (signin) {
    line = t(one ? 'conn.sessionOne' : 'conn.sessionMany', waiting);
  } else if (!online) {
    line =
      t('conn.offline') +
      ' ' +
      (copyFrom ? t('conn.offlineCopy', time(copyFrom)) + ' ' : '') +
      (waiting > 0
        ? t(one ? 'conn.offlineWaitingOne' : 'conn.offlineWaitingMany', waiting)
        : t('conn.offlineNone'));
  } else if (sending) {
    line = t(one ? 'conn.sendingOne' : 'conn.sendingMany', waiting);
  } else if (waiting > 0) {
    line = t(one ? 'conn.waitingOne' : 'conn.waitingMany', waiting);
  } else {
    line = t('conn.stale', time(copyFrom!));
  }

  return (
    <div className={'conn-bar' + (failed ? ' conn-failed' : online ? '' : ' conn-offline')} role="status" aria-live="polite">
      <p>{line}</p>
      {waiting > 0 ? (
        <div className="conn-actions">
          <button type="button" className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? t('conn.hide') : t('conn.show')}
          </button>
          {online && !sending && !failed ? (
            <button type="button" className="btn btn-primary" onClick={() => void replay()}>{t('conn.sendNow')}</button>
          ) : null}
        </div>
      ) : null}
      {open && waiting > 0 ? (
        <ul className="conn-list">
          {outbox.map((i) => (
            <li key={i.id}>
              <span>
                {/* The description is written when the change is queued and kept as it was
                    written, so a change made in one language still reads the same after a
                    switch. Translating it would mean storing a key and its arguments. */}
                <strong>{i.description}</strong>
                <span className="small muted"> {t('conn.keptAt', time(i.savedAt))}</span>
                {i.state === 'failed' ? <span className="small conn-note"> {t('conn.notAccepted', i.note ?? '')}</span> : null}
              </span>
              <button type="button" className="btn" onClick={() => void discard(i.id)}>{t('conn.discard')}</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
