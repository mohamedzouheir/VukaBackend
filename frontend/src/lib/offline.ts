/*
 * The office dashboard's offline layer, for DSAC staff and entity reporters alike.
 *
 * Reading: every GET the API answers is kept on the device, in a cache named for the person who
 * is signed in, and handed back when the network is not there. The screen then says it is
 * showing a copy and when the copy was made. It never shows a copy when the network answered.
 *
 * Writing: a change made with no connection is kept in an outbox and sent, in order, when the
 * connection returns. Only changes that are safe to send late are kept, and each is sent under
 * the same person's session or not at all, because every decision and every figure in Vuka
 * carries the name of the person who made it:
 *
 *   kept      comments and replies, approving or returning a submission, confirming figures,
 *             submitting a period, moving a task, deciding on a document
 *   refused   uploads, opening a period, setting a task, publication, recompute. Each either
 *             needs the server's answer before the screen can go on, or is a decision that should
 *             not be made against a copy of the data.
 *
 * The server is still the judge. A change kept offline that is no longer valid when it arrives,
 * because the submission was returned or approved in the meantime, is refused by the same state
 * checks as any other request, and the refusal is shown against the kept change.
 *
 * Sign-out deletes this person's kept data and, after asking, their unsent changes. A shared
 * office machine must not show the next person the last person's review queue.
 *
 * This is a service-worker-free layer on purpose. The worker (public/sw.js) keeps the shell and
 * its bundle; only the page knows who is signed in, so only the page caches their data.
 */
import { useSyncExternalStore } from 'react';

/* ------------------------------------------------------------------ */
/* State, and a hook to read it                                       */
/* ------------------------------------------------------------------ */

export interface OutboxItem {
  id: string;
  identity: string;
  path: string;
  method: string;
  body: string | null;
  /** A sentence for the outbox list: what this change is, in the words of the screen. */
  description: string;
  savedAt: string;
  state: 'pending' | 'failed';
  note: string | null;
}

export interface OfflineState {
  online: boolean;
  /** When the oldest copy on screen was made, while copies are being shown. */
  copyFrom: string | null;
  outbox: OutboxItem[];
  sending: boolean;
  /** Changes are waiting and the session has run out. */
  signin: boolean;
}

let state: OfflineState = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  copyFrom: null,
  outbox: [],
  sending: false,
  signin: false,
};
const listeners = new Set<() => void>();

function set(patch: Partial<OfflineState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useOffline(): OfflineState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/* ------------------------------------------------------------------ */
/* Who is signed in                                                   */
/* ------------------------------------------------------------------ */

let identity: string | null = null;

/**
 * Set by the auth provider as soon as it knows who is signed in, which with Firebase is before
 * any network call: the SDK keeps the user on the device. A digest, so the cache names on disk
 * do not carry an account identifier.
 */
export async function setIdentity(raw: string | null) {
  identity = raw ? await digest(raw) : null;
  await refreshOutbox();
  if (identity && state.online) void replay();
}

async function digest(raw: string): Promise<string> {
  try {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(bytes).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // No SubtleCrypto outside a secure context. A plain, stable hash is enough to name a cache.
    let h = 0;
    for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(16);
  }
}

function cacheName() {
  return identity ? 'vuka-api-' + identity : null;
}

/* ------------------------------------------------------------------ */
/* Reading                                                            */
/* ------------------------------------------------------------------ */

const SAVED_AT = 'X-Vuka-Saved-At';

/** Keeps a JSON answer for this person. Quietly does nothing where the browser has no Cache API. */
export async function keep(path: string, json: unknown) {
  const name = cacheName();
  if (!name || typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(name);
    await cache.put(
      path,
      new Response(JSON.stringify(json), {
        headers: { 'Content-Type': 'application/json', [SAVED_AT]: new Date().toISOString() },
      }),
    );
  } catch {
    // Storage full or refused. The screen still works online.
  }
}

/** This person's kept copy of a GET, or null. Records that a copy is on screen. */
export async function copyOf<T>(path: string): Promise<T | null> {
  const name = cacheName();
  if (!name || typeof caches === 'undefined') return null;
  try {
    const hit = await (await caches.open(name)).match(path);
    if (!hit) return null;
    const at = hit.headers.get(SAVED_AT);
    if (at && (!state.copyFrom || at < state.copyFrom)) set({ copyFrom: at });
    return (await hit.json()) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Connection                                                         */
/* ------------------------------------------------------------------ */

let probe: number | null = null;

/** Called by the API client on every answer and every failure, so the bar follows reality. */
export function reachable(ok: boolean) {
  if (ok && !state.online) {
    set({ online: true, copyFrom: null });
    stopProbe();
    // Everything on screen may be a copy. Ask every mounted screen to load again.
    window.dispatchEvent(new Event('vuka:synced'));
    void replay();
  } else if (!ok && state.online) {
    set({ online: false });
    startProbe();
  } else if (ok && state.outbox.some((i) => i.state === 'pending') && !state.sending) {
    void replay();
  }
}

function startProbe() {
  if (probe !== null) return;
  // navigator.onLine says there is a network, not that the server is on the other end of it.
  // A HEAD request for the shell every twenty seconds is what actually notices the connection
  // coming back: any answer at all means the server is there. The shell rather than a health
  // endpoint because it is public and costs headers only.
  probe = window.setInterval(async () => {
    try {
      await fetch('/index.html', { method: 'HEAD', cache: 'no-store' });
      reachable(true);
    } catch {
      // Still offline.
    }
  }, 20000);
}

function stopProbe() {
  if (probe !== null) window.clearInterval(probe);
  probe = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => reachable(true));
  window.addEventListener('offline', () => reachable(false));
  if (!navigator.onLine) startProbe();
}

/* ------------------------------------------------------------------ */
/* Writing: the outbox                                                */
/* ------------------------------------------------------------------ */

export interface Queued {
  queued: true;
  id: string;
}

export function isQueued(value: unknown): value is Queued {
  return typeof value === 'object' && value !== null && (value as Queued).queued === true;
}

/** Keeps a change for later. Throws where there is nobody signed in to keep it for. */
export async function enqueue(path: string, method: string, body: string | null, description: string): Promise<Queued> {
  if (!identity) throw new Error('Not signed in, so the change could not be kept on this device.');
  const item: OutboxItem = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
    identity,
    path,
    method,
    body,
    description,
    savedAt: new Date().toISOString(),
    state: 'pending',
    note: null,
  };
  await idb.put(item);
  await refreshOutbox();
  return { queued: true, id: item.id };
}

/** Kept changes against one path prefix, for a screen that shows them in place. */
export function pendingFor(prefix: string): OutboxItem[] {
  return state.outbox.filter((i) => i.path.startsWith(prefix));
}

export async function discard(id: string) {
  await idb.remove(id);
  await refreshOutbox();
  void replay();
}

async function refreshOutbox() {
  const mine = identity ? (await idb.all()).filter((i) => i.identity === identity) : [];
  mine.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  set({ outbox: mine, signin: mine.length === 0 ? false : state.signin });
}

/** The API client's own request function, handed over at startup so replay uses the same rules. */
type Sender = (path: string, method: string, body: string | null) => Promise<unknown>;
export interface SendFailure {
  status: number;
  message: string;
}
let sender: Sender | null = null;
let classify: ((e: unknown) => SendFailure) | null = null;

export function registerSender(fn: Sender, toFailure: (e: unknown) => SendFailure) {
  sender = fn;
  classify = toFailure;
}

let replaying: Promise<void> | null = null;

/**
 * Sends kept changes oldest first, and stops at the first one that is not accepted, so that a
 * period's figures always arrive before its submission and a refusal is seen before anything
 * that depended on it is sent.
 */
export function replay(): Promise<void> {
  if (!replaying) replaying = doReplay().finally(() => (replaying = null));
  return replaying;
}

async function doReplay() {
  if (!sender || !classify || !identity) return;
  const queue = state.outbox.filter((i) => i.identity === identity);
  if (!queue.some((i) => i.state === 'pending')) return;
  set({ sending: true });
  let sent = 0;
  try {
    for (const item of queue) {
      // A refused change holds back everything kept after it until it is discarded.
      if (item.state === 'failed') break;
      try {
        await sender(item.path, item.method, item.body);
        await idb.remove(item.id);
        sent++;
      } catch (e) {
        const f = classify(e);
        if (f.status === 0) break; // Still no connection.
        if (f.status === 401) {
          set({ signin: true });
          break;
        }
        await idb.put({ ...item, state: 'failed', note: f.message });
        break;
      }
    }
  } finally {
    await refreshOutbox();
    set({ sending: false });
    if (sent > 0) window.dispatchEvent(new Event('vuka:synced'));
  }
}

/* ------------------------------------------------------------------ */
/* Sign-out                                                           */
/* ------------------------------------------------------------------ */

/**
 * Deletes everything kept for the person signing out. Asks first where changes are unsent,
 * and returns false if they would rather stay signed in and send them.
 */
export async function forget(): Promise<boolean> {
  const unsent = state.outbox.length;
  if (
    unsent > 0 &&
    !window.confirm(
      unsent +
        (unsent === 1 ? ' change has' : ' changes have') +
        ' not been sent yet. Signing out deletes ' +
        (unsent === 1 ? 'it' : 'them') +
        ' from this device. Sign out anyway?',
    )
  ) {
    return false;
  }
  const name = cacheName();
  if (name && typeof caches !== 'undefined') await caches.delete(name).catch(() => false);
  for (const item of state.outbox) await idb.remove(item.id);
  identity = null;
  set({ outbox: [], copyFrom: null, signin: false });
  return true;
}

/* ------------------------------------------------------------------ */
/* IndexedDB. The same database the service worker's phone outbox uses. */
/* ------------------------------------------------------------------ */

const DB_NAME = 'vuka-offline';
const DB_VERSION = 1;
const STORE = 'web-outbox';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ['m-outbox', 'web-outbox']) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

const idb = {
  all: () => (typeof indexedDB === 'undefined' ? Promise.resolve([]) : run<OutboxItem[]>('readonly', (s) => s.getAll())).catch(() => [] as OutboxItem[]),
  put: (item: OutboxItem) => run<unknown>('readwrite', (s) => s.put(item)),
  remove: (id: string) => run<unknown>('readwrite', (s) => s.delete(id)).catch(() => undefined),
};
