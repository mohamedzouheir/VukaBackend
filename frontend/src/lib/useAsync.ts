/*
 * One hook, because section 10 of the frontend design asks every component to ship five
 * states and a demo that only has the happy path breaks live. The failure is always the
 * same shape: an empty database, a slow request, or a permission the presenter forgot to
 * set. So loading, error and denied are first class here rather than being an
 * afterthought in each screen.
 *
 * "denied" is separated from "error" deliberately, and then rendered as a not found.
 * Telling a caller that a record exists but is not theirs is a disclosure about another
 * entity, so the distinction lives in the data layer and never reaches the words on screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  /** A message safe to show. Null where the request succeeded. */
  error: string | null;
  /** The record does not exist, or is not this caller's. Same outcome by design. */
  notFound: boolean;
  reload: () => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], enabled = true): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Guards against a slow first request overwriting a fast second one.
  const generation = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const mine = ++generation.current;
    setLoading(true);
    setError(null);
    setNotFound(false);

    fn().then(
      (value) => {
        if (generation.current !== mine) return;
        setData(value);
        setLoading(false);
      },
      (e: unknown) => {
        if (generation.current !== mine) return;
        if (e instanceof ApiError && e.notFound) {
          setNotFound(true);
        } else {
          setError(e instanceof Error ? e.message : 'Something went wrong.');
        }
        setLoading(false);
      },
    );
    // fn is recreated on every render, so the caller's deps are the real dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // The connection came back, or kept changes were sent: what is on screen may be a copy or out of
  // date, so every mounted screen loads again. See offline.ts.
  useEffect(() => {
    window.addEventListener('vuka:synced', reload);
    return () => window.removeEventListener('vuka:synced', reload);
  }, [reload]);

  return { data, loading, error, notFound, reload };
}

/**
 * For the irreversible actions. Confirming a figure and submitting a period are the only
 * two, and both need a pending state so a slow network cannot produce a double submit.
 */
export function useAction<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: A) => {
      setPending(true);
      setError(null);
      try {
        await fn(...args);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The action did not complete.');
        return false;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );

  return { run, pending, error, clearError: () => setError(null) };
}
