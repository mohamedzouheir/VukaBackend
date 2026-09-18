/*
 * Sign in.
 *
 * One email field, one password field. No social login: section 3 of the frontend design
 * records that a popup flow is the failure mode for a user on a phone whose browser
 * blocks it, and a reporting system that cannot be opened produces no data at all.
 *
 * There is no entity field, and there never will be. The entity comes off the signed
 * token. A dropdown would be a way for a client to ask for another entity's data, so the
 * absence of the control is part of the access control story rather than a simplification.
 */
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/types';
import { IconAlert, IconLock, IconSpinner } from '../icons';
import './SignIn.css';

export function SignIn() {
  const { signIn, signInAsDev, devAuth, error: authError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch {
      // Firebase distinguishes a wrong password from an unknown account. Repeating that
      // distinction back tells an attacker which addresses are registered.
      setError('That email address and password do not match an account.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="signin-page">
      <div className="signin">
        <p className="signin-mark">VUKA</p>
        <h1>Performance reporting for the bodies funded by Sport, Arts and Culture</h1>
        <p className="muted signin-blurb">
          Every reported figure carries the cell it came from, the document it was drawn out of and
          the named person who confirmed it.
        </p>

        {authError ? (
          <p className="signin-error" role="alert">
            <IconAlert size={16} />
            <span>{authError}</span>
          </p>
        ) : null}

        {devAuth ? (
          <DevSignIn onPick={signInAsDev} />
        ) : (
          <form onSubmit={submit} className="stack">
            <div>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={error ? 'signin-err' : undefined}
                aria-invalid={error ? true : undefined}
              />
              {error ? (
                <p className="field-error" id="signin-err">
                  {error}
                </p>
              ) : null}
            </div>
            <button type="submit" className="primary" disabled={pending}>
              {pending ? <IconSpinner size={16} className="spin" /> : <IconLock size={16} />}
              Sign in
            </button>
          </form>
        )}

        <p className="small muted signin-foot">
          Reporting on a phone? The low bandwidth surface is at <a href="/m">/m</a> and needs no
          JavaScript. The citizen view at <a href="/public">/public</a> needs no account at all.
        </p>
      </div>
    </div>
  );
}

/**
 * Development sign in.
 *
 * The backend has to be demonstrable on a laptop with no Firebase project attached, and
 * the alternative to this is a presenter discovering at 3am that nobody can log in.
 * Enabled only when both VITE_DEV_AUTH and the backend's own dev auth flag are set, and
 * the whole application carries a banner while it is on.
 */
function DevSignIn({
  onPick,
}: {
  onPick: (role: Role, entityId: string | null, name: string) => Promise<void>;
}) {
  const [entityId, setEntityId] = useState('');
  const [pending, setPending] = useState<Role | null>(null);

  async function pick(role: Role, name: string, needsEntity: boolean) {
    setPending(role);
    try {
      await onPick(role, needsEntity ? entityId.trim() || null : null, name);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="dev-signin stack">
      <p className="signin-error" role="status">
        <IconLock size={16} />
        <span>
          Development sign in. Tokens are not verified. Pick a role to see where it lands.
        </span>
      </p>

      <div>
        <label htmlFor="dev-entity">Entity id for the reporter role</label>
        <input
          id="dev-entity"
          type="text"
          className="mono"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          placeholder="blank for the demo reporter"
          aria-describedby="dev-entity-help"
        />
        <p className="small muted" id="dev-entity-help">
          Leave it blank to sign in as the demo reporter at Iziko, the entity whose Q1 submission
          the reviewer returns in the demonstration. Or paste the uuid of another seeded entity;
          the Administration screen prints one under each name.
        </p>
      </div>

      <div className="dev-roles">
        <button
          type="button"
          disabled={pending !== null || entityId.trim() === ''}
          onClick={() => void pick('ENTITY_REPORTER', 'N. Mabaso', true)}
        >
          Entity reporter
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => void pick('DSAC_REVIEWER', 'L. Dlamini', false)}
        >
          DSAC reviewer
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => void pick('DSAC_EXECUTIVE', 'Director-General', false)}
        >
          DSAC executive
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => void pick('ADMIN', 'System administrator', false)}
        >
          Administrator
        </button>
      </div>
    </div>
  );
}
