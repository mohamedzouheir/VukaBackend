/*
 * Vuka's service worker. One worker for every surface, with a rule per surface, because the
 * three audiences need three different things from a dropped connection.
 *
 *   Citizen, /public      Anyone's data, already published. Every page and every JSON answer read
 *                         with signal is kept, and served with its date when there is none.
 *
 *   Reporter, /m          One person's pages, kept in a cache of their own and deleted on sign
 *                         out. An answer typed with no signal is kept on the phone and sent when
 *                         the signal returns, under the same person's session or not at all.
 *
 *   Office dashboard      The shell and its bundle only. Its data is cached by the page itself,
 *                         per signed-in person, because the page knows who is signed in and
 *                         this worker does not. See frontend/src/lib/offline.ts.
 *
 * What it never does: cache anything under /api, answer a request with a copy when the network
 * answered, or send a saved answer without first fetching the form again to prove the same
 * person is still signed in.
 *
 * Plain JavaScript rather than part of the Vite build, so it has a fixed address and no hashed
 * name. It finds the bundle's hashed files by reading the two HTML pages that reference them.
 */
const SHELL = 'vuka-shell-v1';
const PUBLIC = 'vuka-public-v1';
const MOBILE_PREFIX = 'vuka-m-';
const SHELL_PAGES = ['/index.html', '/citizen.html'];
const DB_NAME = 'vuka-offline';
const DB_VERSION = 1;
const M_OUTBOX = 'm-outbox';
const SAVED_AT = 'X-Vuka-Saved-At';

/* ------------------------------------------------------------------ */
/* Lifecycle                                                          */
/* ------------------------------------------------------------------ */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      for (const page of SHELL_PAGES) {
        try {
          const res = await fetch(page, { cache: 'no-cache' });
          if (res.ok) await keepShell(page, res);
        } catch {
          // Installed without signal. The pages are kept the first time they are read instead.
        }
      }
      try {
        const cache = await caches.open(SHELL);
        await cache.add('/offline/mobile.js');
      } catch {
        // As above.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => (n.startsWith('vuka-shell-') && n !== SHELL) || (n.startsWith('vuka-public-') && n !== PUBLIC))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/* ------------------------------------------------------------------ */
/* Routing                                                            */
/* ------------------------------------------------------------------ */

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  // The API is never touched here. The page caches it, per person, and knows when to stop.
  if (path.startsWith('/api/') || path.startsWith('/actuator/')) return;

  if (path.startsWith('/m/') || path === '/m') {
    if (req.method === 'POST') {
      event.respondWith(mobilePost(event));
      return;
    }
    if (req.method === 'GET' && req.mode === 'navigate') {
      event.respondWith(mobilePage(event));
    }
    return;
  }

  if (req.method !== 'GET') return;

  if (path.startsWith('/public/api/')) {
    event.respondWith(publicData(req));
    return;
  }
  if ((path === '/public' || path.startsWith('/public/')) && req.mode === 'navigate') {
    event.respondWith(publicPage(req, url));
    return;
  }
  if (path.startsWith('/assets/')) {
    // Hashed names: a file at one of these addresses never changes.
    event.respondWith(cacheFirst(req));
    return;
  }
  if (path.startsWith('/offline/') || path === '/favicon.svg') {
    // Fixed names: served from the copy, and the copy refreshed behind it.
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(dashboardPage(req));
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'vuka-outbox') event.waitUntil(flushMobile());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'status') event.waitUntil(broadcast());
  if (data.type === 'flush') event.waitUntil(flushMobile());
  if (data.type === 'discard' && data.id) event.waitUntil(discard(data.id));
  if (data.type === 'warm' && Array.isArray(data.urls)) event.waitUntil(warm(data.urls));
});

/* ------------------------------------------------------------------ */
/* The dashboard and the shells                                       */
/* ------------------------------------------------------------------ */

async function dashboardPage(req) {
  try {
    const res = await fetch(req);
    if (res.ok && isHtml(res)) keepShell('/index.html', res.clone()).catch(() => {});
    return res;
  } catch {
    const cached = await caches.match('/index.html', { cacheName: SHELL });
    return cached || offlinePage('Vuka is offline', 'This page has not been opened on this device yet, so there is no copy of it here. Open it again when you have a connection.');
  }
}

/**
 * Keeps one of the two HTML pages and the hashed files it references. When the page has changed,
 * the files only the old version referenced are dropped. That is the whole of the versioning: a
 * new build is a new set of file names, and the old set goes the first time the new page is kept.
 *
 * Only the files the old page named are dropped, not everything the new page does not name,
 * because a chunk loaded by import() is referenced from JavaScript rather than from the page.
 */
async function keepShell(key, res) {
  const cache = await caches.open(SHELL);
  const html = await res.clone().text();
  const previous = await cache.match(key);
  const before = previous ? assetsIn(await previous.text()) : [];
  await cache.put(key, res);
  const wanted = new Set(assetsIn(html));
  for (const other of SHELL_PAGES) {
    if (other === key) continue;
    const kept = await cache.match(other);
    if (kept) for (const a of assetsIn(await kept.text())) wanted.add(a);
  }
  for (const a of wanted) {
    if (!(await cache.match(a))) {
      try {
        await cache.add(a);
      } catch {
        // Kept on first use instead.
      }
    }
  }
  for (const a of before) {
    if (!wanted.has(a)) await cache.delete(a);
  }
}

function assetsIn(html) {
  const out = [];
  const re = /(?:src|href)="(\/assets\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  if (hit) {
    fresh.catch(() => {});
    return hit;
  }
  return fresh;
}

async function cacheFirst(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

/* ------------------------------------------------------------------ */
/* The citizen view                                                   */
/* ------------------------------------------------------------------ */

async function publicPage(req, url) {
  const cache = await caches.open(PUBLIC);
  try {
    const res = await withTimeout(fetch(req), await cache.match(req, { ignoreVary: true }) ? 8000 : 0);
    if (res.ok) {
      await cache.put(req, stamped(res.clone(), await res.clone().blob()));
      // The full view is the citizen shell. Keeping it as the shell too keeps its hashed files
      // from being pruned while a copy of the page that needs them is still here.
      if (isHtml(res) && (await res.clone().text()).includes('/assets/')) {
        await keepShell('/citizen.html', res.clone()).catch(() => {});
      }
    }
    return res;
  } catch {
    const lite = url.searchParams.get('view') === 'lite';
    const hit =
      (await cache.match(req, { ignoreVary: true })) ||
      (await cache.match(req, { ignoreVary: true, ignoreSearch: true })) ||
      (!lite && (await caches.match('/citizen.html', { cacheName: SHELL })));
    if (hit) return revealOfflineNote(hit, url);
    return offlinePage(
      'No signal',
      'This page has not been read on this device yet, so there is no copy of it here. The pages you have already opened are still available.',
      '/public',
      'All published entities',
    );
  }
}

async function publicData(req) {
  const cache = await caches.open(PUBLIC);
  const kept = await cache.match(req, { ignoreVary: true });
  try {
    const res = await withTimeout(fetch(req), kept ? 8000 : 0);
    if (res.ok) await cache.put(req, stamped(res.clone(), await res.clone().blob()));
    return res;
  } catch {
    if (kept) return kept;
    return new Response(JSON.stringify({ offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * The light view carries a hidden, translated notice for exactly this moment. Revealing it and
 * putting the date in is all the rewriting done here, so the page a reader sees offline is the
 * page they read online, with the date it was read on at the top.
 */
async function revealOfflineNote(res, url) {
  const saved = res.headers.get(SAVED_AT);
  if (!isHtml(res) || !saved) return res;
  const html = await res.text();
  const lang = url.searchParams.get('lang') || (/<html[^>]*\blang="([^"]+)"/.exec(html) || [])[1] || 'en';
  const when = formatDate(saved, lang);
  const out = html.replace(
    /(<p[^>]*data-offline-note)\s+hidden([^>]*>)([\s\S]*?)(<\/p>)/,
    // The text is already escaped by Thymeleaf; only the date is new.
    (_m, open, rest, text, close) => open + rest + text.replace('{0}', escapeHtml(when)) + close,
  );
  return new Response(out, { status: 200, headers: htmlHeaders(saved) });
}

/* ------------------------------------------------------------------ */
/* The reporter's phone surface                                       */
/* ------------------------------------------------------------------ */

/** Pages that must never be kept: the sign-in form, and the poller's fragment. */
function keepable(path) {
  return !path.startsWith('/m/signin') && !path.startsWith('/m/signout') && !path.endsWith('/live');
}

async function mobilePage(event) {
  const req = event.request;
  const path = new URL(req.url).pathname;
  try {
    const res = await fetch(req);
    const user = res.headers.get('X-Vuka-User');
    if (user) {
      await setUser(user);
      if (res.ok && keepable(path)) {
        const cache = await caches.open(MOBILE_PREFIX + user);
        await cache.put(req, stamped(res.clone(), await res.clone().blob()));
      }
      // Signal is back and somebody is signed in: a good moment to send what was kept.
      try {
        event.waitUntil(flushMobile());
      } catch {
        flushMobile();
      }
    }
    return res;
  } catch {
    const user = await getUser();
    const hit = user && keepable(path) ? await caches.match(req, { cacheName: MOBILE_PREFIX + user, ignoreVary: true }) : null;
    if (hit) return mobileOfflineCopy(hit);
    if (path.startsWith('/m/signin')) {
      return offlinePage('No signal', 'Signing in needs a connection. Anything you have already saved on this phone is still here and will be sent after you sign in.', null, null, true);
    }
    return offlinePage(
      'No signal',
      'This page has not been opened on this phone yet, so there is no copy of it here. Pages you have already opened, and every indicator of a report you have started, are still available.',
      '/m',
      'Back to my reports',
      true,
    );
  }
}

/** A kept reporter page, with a line at the top saying it is a copy and when it was made. */
async function mobileOfflineCopy(res) {
  const saved = res.headers.get(SAVED_AT);
  const html = await res.text();
  const note =
    '<p role="status" style="margin:0;padding:10px 16px;background:var(--panel,#f4f8f6);border-bottom:2px solid var(--green,#0f3d2e);font-size:14px">' +
    'No signal. This is the copy of this page kept on this phone' + (saved ? ' at ' + escapeHtml(formatDate(saved, 'en')) : '') +
    '. Answers you save now are kept here and sent when the signal returns.</p>';
  return new Response(html.replace(/<body([^>]*)>/, (m) => m + note), { status: 200, headers: htmlHeaders(saved) });
}

/**
 * A form posted from the phone.
 *
 * Tried against the network first, always. Only when that throws, which means the request never
 * got an answer, is the form kept for later. Sign in, sign out and starting a period are never
 * kept: the first two are about the session itself, and a started period's address is not known
 * until the server has made it. A file upload is not kept either, because the file can be large
 * and the phone's storage is not ours to fill.
 */
async function mobilePost(event) {
  const req = event.request;
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/m/signout') {
    // Everything this phone kept for the person signing out goes with them. Saved answers stay,
    // stamped with whose they are, so they can be sent when that person signs back in.
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(MOBILE_PREFIX)).map((n) => caches.delete(n)));
    await setUser(null);
    return fetch(req);
  }

  const type = req.headers.get('Content-Type') || '';
  const kept =
    type.startsWith('application/x-www-form-urlencoded') &&
    path !== '/m/signin' &&
    !/^\/m\/period\/[^/]+\/start$/.test(path);
  const body = kept ? await req.clone().text() : null;

  try {
    return await fetch(req);
  } catch {
    if (!kept) {
      return offlinePage(
        'No signal. Nothing was sent.',
        path === '/m/signin'
          ? 'Signing in needs a connection.'
          : 'This needs a connection and could not be kept on the phone. Try again when you have signal.',
        '/m',
        'Back to my reports',
        true,
      );
    }
    const user = await getUser();
    if (!user) {
      return offlinePage('No signal. Nothing was sent.', 'This phone does not know who is signed in, so the answer could not be kept under your name. Sign in again when you have signal.', '/m/signin', 'Sign in', true);
    }
    await put(M_OUTBOX, {
      id: crypto.randomUUID(),
      url: url.pathname + url.search,
      body,
      formPage: sameOriginPath(req.referrer) || url.pathname,
      user,
      savedAt: new Date().toISOString(),
      state: 'pending',
      note: null,
    });
    try {
      await self.registration.sync.register('vuka-outbox');
    } catch {
      // No background sync in this browser. The next page opened with signal sends it instead.
    }
    await broadcast();
    return savedPage(path);
  }
}

function savedPage(path) {
  const step = /^\/m\/submission\/([^/]+)\/step\/(\d+)$/.exec(path);
  let next = { href: '/m', label: 'Back to my reports' };
  let what = 'Your answer is kept on this phone.';
  if (step) {
    next = { href: '/m/submission/' + step[1] + '/step/' + (Number(step[2]) + 1), label: 'Next indicator' };
    what = 'Your answer to this indicator is kept on this phone.';
  } else if (/\/submit$/.test(path)) {
    what = 'Your request to submit this report is kept on this phone. The Department does not have the report yet.';
  } else if (path.startsWith('/m/comments/')) {
    what = 'Your reply is kept on this phone.';
  }
  return offlinePage('Saved on this phone, not sent yet', what + ' It will be sent when the signal comes back, and the bar at the bottom of the screen says how many are waiting.', next.href, next.label, true);
}

/**
 * Sends what was kept, oldest first, and stops at the first thing that does not go through.
 *
 * Order matters because a report's answers come before its submission. Each form is fetched
 * again before it is sent, which does two jobs: it gets a CSRF token that is valid now rather
 * than the one captured with no signal, and it proves by the X-Vuka-User header that the person
 * who typed the answer is the person signed in. An answer kept by somebody else is left alone.
 */
let flushing = null;
function flushMobile() {
  if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
  return flushing;
}

async function doFlush() {
  const items = (await all(M_OUTBOX)).filter((i) => i.state === 'pending').sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  if (items.length === 0) return broadcast();
  await broadcast({ sending: true });
  let signin = false;
  for (const item of items) {
    let form;
    try {
      form = await fetch(item.formPage, { credentials: 'same-origin' });
    } catch {
      break; // Still no signal.
    }
    if (form.redirected && new URL(form.url).pathname.startsWith('/m/signin')) {
      signin = true;
      break;
    }
    if (form.headers.get('X-Vuka-User') !== item.user) continue;

    const token = csrfIn(await form.text());
    const params = new URLSearchParams(item.body);
    if (token) params.set('_csrf', token);

    let res;
    try {
      res = await fetch(item.url, {
        method: 'POST',
        body: params.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'same-origin',
        redirect: 'follow',
      });
    } catch {
      break;
    }
    const landed = new URL(res.url).pathname;
    if (landed.startsWith('/m/signin')) {
      signin = true;
      break;
    }
    if (res.ok && res.redirected) {
      await remove(M_OUTBOX, item.id);
      continue;
    }
    // Answered, but refused: a missing reason, a report already submitted. The server's own
    // sentence goes on the bar, and nothing after this is sent until the reporter has seen it.
    item.state = 'failed';
    item.note = refusalIn(await res.text().catch(() => '')) || 'The server did not accept this answer.';
    await put(M_OUTBOX, item);
    break;
  }
  return broadcast({ signin });
}

async function discard(id) {
  await remove(M_OUTBOX, id);
  // Discarding the refused item unblocks the ones behind it.
  await flushMobile();
}

/** Fetches every indicator of a report once, so the reporter can move forward with no signal. */
async function warm(urls) {
  const user = await getUser();
  if (!user) return;
  const cache = await caches.open(MOBILE_PREFIX + user);
  for (const u of urls.slice(0, 200)) {
    const path = sameOriginPath(u);
    if (!path || !path.startsWith('/m/') || !keepable(path)) continue;
    if (await cache.match(path, { ignoreVary: true })) continue;
    try {
      const res = await fetch(path, { credentials: 'same-origin' });
      if (res.ok && !res.redirected && res.headers.get('X-Vuka-User') === user) {
        await cache.put(path, stamped(res.clone(), await res.clone().blob()));
      }
    } catch {
      return;
    }
  }
}

async function broadcast(extra = {}) {
  const user = await getUser();
  const items = await all(M_OUTBOX);
  const mine = items.filter((i) => i.user === user);
  const status = {
    type: 'vuka-outbox',
    pending: mine.filter((i) => i.state === 'pending').length,
    failed: mine.filter((i) => i.state === 'failed').map((i) => ({ id: i.id, formPage: i.formPage, note: i.note })),
    others: items.length - mine.length,
    signin: Boolean(extra.signin) || (!user && items.length > 0),
    sending: Boolean(extra.sending),
  };
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(status);
}

function csrfIn(html) {
  const m = /name="_csrf"[^>]*value="([^"]+)"/.exec(html) || /value="([^"]+)"[^>]*name="_csrf"/.exec(html);
  return m ? m[1] : null;
}

function refusalIn(html) {
  const m = /<p[^>]*class="error"[^>]*>([\s\S]*?)<\/p>/.exec(html) || /<p role="status"[^>]*>([\s\S]*?)<\/p>/.exec(html);
  return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : null;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                      */
/* ------------------------------------------------------------------ */

/** A copy of a response with the time it was kept, so what is shown offline can say how old it is. */
function stamped(res, body) {
  const headers = new Headers(res.headers);
  headers.set(SAVED_AT, new Date().toISOString());
  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}

function withTimeout(promise, ms) {
  if (!ms) return promise;
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

function isHtml(res) {
  return (res.headers.get('Content-Type') || '').includes('text/html');
}

function htmlHeaders(saved) {
  const h = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
  if (saved) h.set(SAVED_AT, saved);
  return h;
}

function sameOriginPath(href) {
  if (!href) return null;
  try {
    const u = new URL(href, self.location.origin);
    return u.origin === self.location.origin ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

function formatDate(iso, lang) {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function offlinePage(title, body, href, label, mobile = false) {
  const html =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + escapeHtml(title) + '</title>' +
    '<style>:root{--ink:#1a1a1a;--green:#0f3d2e;--on-green:#fff;--bg:#fff;--panel:#f4f8f6;--line:#dfe6e3}' +
    '@media (prefers-color-scheme:dark){:root{--ink:#e8edeb;--green:#7fd1b0;--on-green:#121714;--bg:#121714;--panel:#1a221e;--line:#2b3a34}}' +
    'body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
    '.wrap{max-width:520px;margin:0 auto;padding:24px 16px 96px}h1{font-size:20px;color:var(--green);margin:0 0 12px}' +
    'a.btn{display:flex;align-items:center;justify-content:center;min-height:52px;margin-top:20px;border-radius:8px;background:var(--green);color:var(--on-green);font-weight:600;text-decoration:none}' +
    'a.btn:focus-visible{outline:3px solid var(--ink);outline-offset:3px}</style>' +
    (mobile ? '<script src="/offline/mobile.js" defer></script>' : '') + '</head><body><div class="wrap"><main>' +
    '<h1 role="status">' + escapeHtml(title) + '</h1><p>' + escapeHtml(body) + '</p>' +
    (href ? '<a class="btn" href="' + escapeHtml(href) + '">' + escapeHtml(label) + '</a>' : '') +
    '</main></div></body></html>';
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/* ---------- IndexedDB, the same database the dashboard's outbox uses ---------- */

function db() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const d = open.result;
      for (const store of ['m-outbox', 'web-outbox']) {
        if (!d.objectStoreNames.contains(store)) d.createObjectStore(store, { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

const all = (store) => tx(store, 'readonly', (s) => s.getAll());
const put = (store, value) => tx(store, 'readwrite', (s) => s.put(value));
const remove = (store, id) => tx(store, 'readwrite', (s) => s.delete(id));

/**
 * Who the phone surface last said was signed in. Changing it drops the previous person's kept
 * pages, so a phone handed from one reporter to another does not show the second one the first
 * one's reports.
 */
async function getUser() {
  return (await tx('meta', 'readonly', (s) => s.get('mUser'))) || null;
}

async function setUser(user) {
  const before = await getUser();
  if (before === user) return;
  if (before) await caches.delete(MOBILE_PREFIX + before);
  await tx('meta', 'readwrite', (s) => (user ? s.put(user, 'mUser') : s.delete('mUser')));
}
