/*
 * Identity.
 *
 * Firebase is identity only. Everything the product knows lives in Postgres, which is
 * what makes "the department can take this in-house" a true statement rather than a
 * hedge. The two claims that matter are role and entityId, and entityId is read off the
 * signed token rather than being sent by the client. That is the whole tenancy model, and
 * it is the reason there is no entity selector anywhere in the interface.
 *
 * There is also a development sign in, which exists because the backend has to be
 * demonstrable on a laptop with no Firebase project attached. It is off unless both the
 * frontend and the backend are told to enable it, and it prints a warning on every page.
 * It must never be enabled in a deployed environment.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { api, setTokenSource } from './api';
import { forget, setIdentity } from './offline';
import type { MeView, Role, Capability } from './types';

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';
const DEV_TOKEN_KEY = 'vuka.dev.token';

interface AuthState {
  /** Undefined while the first token check is still in flight. */
  ready: boolean;
  me: MeView | null;
  error: string | null;
  devAuth: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInAsDev: (role: Role, entityId: string | null, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function firebase(): { app: FirebaseApp; auth: Auth } | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) return null;
  const app = initializeApp({
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  });
  return { app, auth: getAuth(app) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<MeView | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Held in a ref rather than in state so the token source closure never goes stale.
  const tokenRef = useRef<string | null>(null);
  const fb = useMemo(() => (DEV_AUTH ? null : firebase()), []);

  useEffect(() => {
    setTokenSource(async () => {
      if (DEV_AUTH) return tokenRef.current;
      const user = fb?.auth.currentUser;
      if (!user) return null;
      // Firebase refreshes the token when it is close to expiry, so this is cheap.
      return user.getIdToken();
    });
  }, [fb]);

  const load = useCallback(async () => {
    try {
      const view = await api.me();
      setMe(view);
      setError(null);
    } catch (e) {
      setMe(null);
      // A failed /api/me on a valid token means the role claim is missing, which is an
      // administration problem and not something the user can fix by trying again.
      setError(
        e instanceof Error && e.message.includes('reach the server')
          ? 'Could not reach the server. Check that the backend is running on port 8080.'
          : 'Signed in, but this account carries no role claim. An administrator has to set role and entityId on it.',
      );
    }
  }, []);

  /* Dev sign in restores from session storage so a page reload does not sign you out. */
  useEffect(() => {
    if (!DEV_AUTH) return;
    const stored = sessionStorage.getItem(DEV_TOKEN_KEY);
    if (!stored) {
      setReady(true);
      return;
    }
    tokenRef.current = stored;
    void setIdentity(stored)
      .then(load)
      .finally(() => setReady(true));
  }, [load]);

  /* Firebase keeps the session; this fires once on load and again on every refresh. */
  useEffect(() => {
    if (DEV_AUTH) return;
    if (!fb) {
      setError(
        'No Firebase configuration found. Copy .env.example to .env and fill it in, or set VITE_DEV_AUTH=true for a local demo.',
      );
      setReady(true);
      return;
    }
    const stop = onIdTokenChanged(fb.auth, (user: User | null) => {
      if (!user) {
        void setIdentity(null);
        setMe(null);
        setReady(true);
        return;
      }
      // Identity first, from the user Firebase keeps on the device, so that with no network the
      // profile below can come from this person's kept copy and the dashboard still opens.
      void setIdentity(user.uid)
        .then(load)
        .finally(() => setReady(true));
    });
    return stop;
  }, [fb, load]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!fb) throw new Error('Firebase is not configured.');
      const cred = await signInWithEmailAndPassword(fb.auth, email, password);
      await setIdentity(cred.user.uid);
      await load();
    },
    [fb, load],
  );

  const signInAsDev = useCallback(
    async (role: Role, entityId: string | null, name: string) => {
      // The shape the backend DevAuthFilter parses. It is deliberately not a JWT: nothing
      // about it should ever look like a credential that could be mistaken for valid.
      const token = ['dev', role, entityId ?? '', name].join('|');
      tokenRef.current = token;
      sessionStorage.setItem(DEV_TOKEN_KEY, token);
      await setIdentity(token);
      await load();
    },
    [load],
  );

  const signOut = useCallback(async () => {
    // Deletes this person's kept data and unsent changes, after asking about the changes. A
    // shared machine must not open on the last person's screens with no network to stop it.
    if (!(await forget())) return;
    tokenRef.current = null;
    sessionStorage.removeItem(DEV_TOKEN_KEY);
    setMe(null);
    setError(null);
    if (fb) await fbSignOut(fb.auth);
  }, [fb]);

  const value = useMemo<AuthState>(
    () => ({ ready, me, error, devAuth: DEV_AUTH, signIn, signInAsDev, signOut }),
    [ready, me, error, signIn, signInAsDev, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth used outside AuthProvider');
  return ctx;
}

/* ---------- what each role may reach ---------- */

/**
 * Whether the signed-in person may do something, as the server decided it.
 *
 * Read from /api/me rather than worked out from the role here, so the screen offers exactly
 * the actions the API will accept. A missing list fails closed: nothing is offered.
 */
export function can(me: MeView | null | undefined, capability: Capability): boolean {
  return !!me && Array.isArray(me.capabilities) && me.capabilities.includes(capability);
}

export function isDsac(role: Role | undefined | null): boolean {
  return role === 'DSAC_REVIEWER' || role === 'DSAC_EXECUTIVE' || role === 'ADMIN';
}
