/*
 * One bar under the top bar that says what the offline layer is doing, and nothing when it is
 * doing nothing.
 *
 * A change kept on the device looks exactly like a change that was made unless something says
 * otherwise, and a reviewer who believes an approval went through when it did not is worse off
 * than one who was told it failed. So every kept change is listed here by name, with the time it
 * was kept, until it is sent or discarded, and a refused one says why in the server's words.
 */
import { useState } from 'react';
import { discard, replay, useOffline } from '../lib/offline';
import './components.css';

function time(iso: string) {
  return new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

export function ConnectionBar() {
  const { online, copyFrom, outbox, sending, signin } = useOffline();
  const [open, setOpen] = useState(false);

  const failed = outbox.find((i) => i.state === 'failed') ?? null;
  const waiting = outbox.length;

  if (online && waiting === 0 && !copyFrom) return null;

  let line: string;
  if (failed) {
    line = 'A change kept on this device was not accepted: ' + (failed.note ?? 'refused by the server.') +
      ' Nothing after it has been sent. Discard it to send the rest.';
  } else if (signin) {
    line = waiting + (waiting === 1 ? ' change is' : ' changes are') + ' kept on this device. Your session has run out: sign out and in again to send them.';
  } else if (!online) {
    line = 'You are offline. ' +
      (copyFrom ? 'Screens show the copy saved on this device at ' + time(copyFrom) + '. ' : '') +
      (waiting > 0
        ? waiting + (waiting === 1 ? ' change is' : ' changes are') + ' kept here and will be sent when the connection returns.'
        : 'Comments, reviews, confirmed figures and task updates you make are kept here and sent when the connection returns.');
  } else if (sending) {
    line = 'Sending ' + waiting + (waiting === 1 ? ' kept change.' : ' kept changes.');
  } else if (waiting > 0) {
    line = waiting + (waiting === 1 ? ' change is' : ' changes are') + ' kept on this device and not sent yet.';
  } else {
    line = 'Some figures on screen are the copy saved at ' + time(copyFrom!) + '. They refresh as the connection allows.';
  }

  return (
    <div className={'conn-bar' + (failed ? ' conn-failed' : online ? '' : ' conn-offline')} role="status" aria-live="polite">
      <p>{line}</p>
      {waiting > 0 ? (
        <div className="conn-actions">
          <button type="button" className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Hide' : 'Show'} kept changes
          </button>
          {online && !sending && !failed ? (
            <button type="button" className="btn btn-primary" onClick={() => void replay()}>Send now</button>
          ) : null}
        </div>
      ) : null}
      {open && waiting > 0 ? (
        <ul className="conn-list">
          {outbox.map((i) => (
            <li key={i.id}>
              <span>
                <strong>{i.description}</strong>
                <span className="small muted"> kept {time(i.savedAt)}</span>
                {i.state === 'failed' ? <span className="small conn-note"> Not accepted: {i.note}</span> : null}
              </span>
              <button type="button" className="btn" onClick={() => void discard(i.id)}>Discard</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
