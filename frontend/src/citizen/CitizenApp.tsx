/*
 * The full citizen view: the same published figures as the light view, with a search, sector
 * filters and a picture of how each entity's targets stand.
 *
 * Two screens, so no router. The addresses are the light view's own, /public and
 * /public/entity/{id}, and the lang and view parameters are carried through every link, so a
 * link copied from here opens the same page in the same language in either view.
 *
 * Every chart here repeats its numbers in words beside it. A bar of colours is a summary for
 * the sighted reader, and the table next to it is the record.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import {
  NotFound, dateTime, fmt, load, longDate, rand,
  type CitizenEntity, type Loaded, type Strings,
} from './data';

type Route = { kind: 'index' } | { kind: 'entity'; id: string } | { kind: 'unknown' };

function routeOf(pathname: string): Route {
  const p = pathname.replace(/\/+$/, '');
  if (p === '/public') return { kind: 'index' };
  const m = /^\/public\/entity\/([^/]+)$/.exec(p);
  return m ? { kind: 'entity', id: decodeURIComponent(m[1]) } : { kind: 'unknown' };
}

/** The same address with some query parameters changed, everything else kept. */
function href(pathname: string, change: Record<string, string | null>): string {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(change)) {
    if (v === null) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return pathname + (s ? '?' + s : '');
}

type State<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'notfound' }
  | { status: 'ready'; value: Loaded<T> };

/** keep: hold the last answer on screen while the next one loads, rather than blanking. */
function useLoad<T>(fn: () => Promise<Loaded<T>>, key: string, keep = false): [State<T>, () => void] {
  const [state, setState] = useState<State<T>>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    setState((prev) => (keep && prev.status === 'ready' ? prev : { status: 'loading' }));
    fn().then(
      (value) => live && setState({ status: 'ready', value }),
      (e: unknown) => live && setState({ status: e instanceof NotFound ? 'notfound' : 'error' }),
    );
    return () => {
      live = false;
    };
    // fn is recreated on every render; key is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  return [state, useCallback(() => setNonce((n) => n + 1), [])];
}

export function CitizenApp() {
  const [path, setPath] = useState(location.pathname);
  const [lang, setLang] = useState<string | null>(new URLSearchParams(location.search).get('lang'));

  useEffect(() => {
    const onPop = () => {
      setPath(location.pathname);
      setLang(new URLSearchParams(location.search).get('lang'));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((to: string) => {
    history.pushState(null, '', to);
    setPath(location.pathname);
    setLang(new URLSearchParams(location.search).get('lang'));
    window.scrollTo(0, 0);
  }, []);

  const [strings, retryStrings] = useLoad(() => load.strings(lang), 'strings:' + (lang ?? ''), true);
  const route = routeOf(path);

  const s = strings.status === 'ready' ? strings.value.data : null;
  const t = useCallback((key: string, ...args: (string | number)[]) => fmt(s?.messages[key], ...args), [s]);
  const activeLang = s?.lang ?? lang ?? 'en';

  useEffect(() => {
    document.documentElement.lang = activeLang;
  }, [activeLang]);

  if (strings.status === 'loading') return <Boot />;
  if (strings.status !== 'ready' || !s) {
    // Nothing translated to say it with, so this one screen is in English, and it offers the
    // light view, which needs no script and may be saved on this device already.
    return (
      <Frame>
        <div className="c-state">
          <p>The records could not be loaded. Check your connection and try again.</p>
          <div className="c-row">
            <button type="button" className="c-btn" onClick={retryStrings}>Try again</button>
            <a className="c-btn ghost" href={href(path, { view: 'lite' })}>Light version, uses less data</a>
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame skip={t('common.skip')}>
      {route.kind === 'index' ? (
        <IndexScreen t={t} go={go} lang={activeLang} />
      ) : route.kind === 'entity' ? (
        <EntityScreen id={route.id} t={t} go={go} lang={activeLang} />
      ) : (
        <div className="c-state"><p>{t('citizen.notfound')}</p></div>
      )}
      <Footer strings={s} t={t} path={path} go={go} />
    </Frame>
  );
}

type T = (key: string, ...args: (string | number)[]) => string;

/* ------------------------------------------------------------------ */

function IndexScreen({ t, go, lang }: { t: T; go: (to: string) => void; lang: string }) {
  const [state, retry] = useLoad(() => load.entities(), 'entities');
  const [query, setQuery] = useState('');
  const [sector, setSector] = useState<string | null>(null);

  useEffect(() => {
    document.title = t('page.index.title');
  }, [t]);

  const all = state.status === 'ready' ? state.value.data : [];
  const sectors = useMemo(() => [...new Set(all.map((e) => e.sector))].filter(Boolean).sort(), [all]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((e) => (sector ? e.sector === sector : true))
      .filter((e) => (q ? e.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [all, query, sector]);

  const totals = useMemo(
    () => ({
      money: all.reduce((n, e) => n + (e.totalAllocation ?? 0), 0),
      committed: all.reduce((n, e) => n + e.targetsCommitted, 0),
      achieved: all.reduce((n, e) => n + e.targetsAchieved, 0),
    }),
    [all],
  );

  return (
    <main id="main">
      <header className="c-hero">
        <p className="c-kicker">{t('page.entity.kicker')}</p>
        <h1>{t('page.index.title')}</h1>
        <p className="c-lede">{t('page.index.lede')}</p>
      </header>

      {state.status === 'ready' && state.value.savedAt ? <SavedNote t={t} at={state.value.savedAt} lang={lang} /> : null}

      {state.status === 'loading' ? (
        <div className="c-grid" aria-busy="true" aria-label={t('citizen.loading')}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="c-card c-skeleton" />)}
        </div>
      ) : state.status !== 'ready' ? (
        <Failed t={t} onRetry={retry} />
      ) : all.length === 0 ? (
        <div className="c-state"><p>{t('page.index.empty')}</p></div>
      ) : (
        <>
          <section className="c-stats" aria-label={t('page.index.title')}>
            <Stat label={t('citizen.stat.entities')} value={String(all.length)} />
            <Stat label={t('page.entity.allocated')} value={rand(totals.money)} />
            <Stat
              label={t('citizen.stat.achieved')}
              value={t('citizen.stat.achievedOf', totals.achieved, totals.committed)}
              ring={totals.committed > 0 ? totals.achieved / totals.committed : null}
            />
          </section>

          <div className="c-controls">
            <label className="c-search">
              <span className="c-vh">{t('citizen.search')}</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={query}
                placeholder={t('citizen.search')}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {sectors.length > 1 ? (
              <div className="c-chips" role="group" aria-label={t('citizen.sector.all')}>
                <Chip on={sector === null} onClick={() => setSector(null)}>{t('citizen.sector.all')}</Chip>
                {sectors.map((s) => (
                  <Chip key={s} on={sector === s} onClick={() => setSector(sector === s ? null : s)}>{s}</Chip>
                ))}
              </div>
            ) : null}
          </div>

          {shown.length === 0 ? (
            <div className="c-state"><p>{t('citizen.noresults')}</p></div>
          ) : (
            <ul className="c-grid" role="list">
              {shown.map((e) => (
                <li key={e.entityId}>
                  <EntityCard e={e} t={t} go={go} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

function EntityCard({ e, t, go }: { e: CitizenEntity; t: T; go: (to: string) => void }) {
  const to = href('/public/entity/' + e.entityId, {});
  return (
    <a className="c-card c-link" href={to} onClick={intercept(go, to)}>
      <span className="c-sector">{e.sector}</span>
      <span className="c-name">{e.name}</span>
      <span className="c-money">
        {rand(e.totalAllocation ?? 0)} <span className="c-muted">{t('page.index.allocated')}</span>
      </span>
      <Outcomes e={e} t={t} compact />
      <span className="c-open">
        {t('citizen.open')} <span aria-hidden="true">&rarr;</span>
      </span>
    </a>
  );
}

/* ------------------------------------------------------------------ */

function EntityScreen({ id, t, go, lang }: { id: string; t: T; go: (to: string) => void; lang: string }) {
  const [state, retry] = useLoad(() => load.entity(id), 'entity:' + id);
  const e = state.status === 'ready' ? state.value.data : null;

  useEffect(() => {
    document.title = e ? t('page.entity.title', e.name) : t('page.index.title');
  }, [e, t]);

  const back = href('/public', {});
  const backLink = (
    <a className="c-back" href={back} onClick={intercept(go, back)}>
      <span aria-hidden="true">&larr;</span> {t('page.entity.all')}
    </a>
  );

  if (state.status === 'loading') {
    return (
      <main id="main">
        {backLink}
        <div className="c-card c-skeleton tall" aria-busy="true" aria-label={t('citizen.loading')} />
      </main>
    );
  }
  if (state.status === 'notfound') {
    return <main id="main">{backLink}<div className="c-state"><p>{t('citizen.notfound')}</p></div></main>;
  }
  if (state.status === 'error' || !e) {
    return <main id="main">{backLink}<Failed t={t} onRetry={retry} /></main>;
  }

  return (
    <main id="main">
      {backLink}
      {state.status === 'ready' && state.value.savedAt ? <SavedNote t={t} at={state.value.savedAt} lang={lang} /> : null}

      <header className="c-hero">
        <p className="c-kicker">{t('page.entity.kicker')}</p>
        <h1>{e.name}</h1>
        <p><span className="c-sector">{e.sector}</span></p>
        {e.mandate ? <p className="c-lede">{e.mandate}</p> : null}
      </header>

      <section className="c-money-panel">
        <p className="c-muted">{t('page.entity.allocated')}</p>
        <p className="c-big">{rand(e.totalAllocation ?? 0)}</p>
        <p className="c-muted">{t('page.entity.year', e.financialYearLabel)}</p>
      </section>

      <section className="c-card c-outcomes">
        <h2>{t('page.entity.promised')}</h2>
        {e.targetsCommitted === 0 ? (
          <p className="c-muted">{t('citizen.targets.none')}</p>
        ) : (
          <div className="c-outcomes-body">
            <Donut e={e} />
            <Outcomes e={e} t={t} />
          </div>
        )}
      </section>

      {/* The way out of this page. Vuka answers one question about a funded body and raises
          three it cannot: what is on, how to visit, who runs it. Without this the reader's next
          step was a search engine. Absent entirely where no address is on record, because a
          wrong link under a government masthead is worse than no link. */}
      {e.website ? (
        <section className="c-site">
          <a href={e.website} target="_blank" rel="noopener noreferrer external" className="c-btn">
            {t('page.entity.website', e.name)} <span aria-hidden="true">&#8599;</span>
          </a>
          <p className="c-muted small">{t('page.entity.website.note')}</p>
        </section>
      ) : null}

      <footer className="c-foot">
        <p>
          {e.lastReportedAt
            ? t('page.entity.lastreported', longDate(e.lastReportedAt, lang))
            : t('page.entity.neverreported')}
        </p>
        <p>{t('page.entity.disclaimer')}</p>
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ */

const PARTS = [
  { key: 'targetsAchieved', label: 'page.entity.achieved', cls: 'ok' },
  { key: 'targetsInProgress', label: 'page.entity.inprogress', cls: 'progress' },
  { key: 'targetsMissed', label: 'page.entity.missed', cls: 'missed' },
  { key: 'targetsNotStarted', label: 'page.entity.notstarted', cls: 'none' },
] as const;

/**
 * The four outcomes as a bar and as words with numbers. The bar is hidden from screen readers
 * because the table beside it says the same thing exactly, and a colour is never the only carrier.
 */
function Outcomes({ e, t, compact = false }: { e: CitizenEntity; t: T; compact?: boolean }) {
  const total = e.targetsCommitted;
  if (compact && total === 0) return <span className="c-muted small">{t('citizen.targets.none')}</span>;
  return (
    <span className={'c-outcomes-list' + (compact ? ' compact' : '')}>
      {total > 0 ? (
        <span className="c-bar" aria-hidden="true">
          {PARTS.map((p) =>
            e[p.key] > 0 ? <i key={p.key} className={p.cls} style={{ flexGrow: e[p.key] }} /> : null,
          )}
        </span>
      ) : null}
      {compact ? (
        <span className="c-muted small">{t('page.index.targets', e.targetsAchieved, total)}</span>
      ) : (
        <table className="c-table">
          <caption className="c-vh">{t('page.entity.summary')}</caption>
          <tbody>
            <tr>
              <th scope="row">{t('page.entity.committed')}</th>
              <td>{total}</td>
            </tr>
            {PARTS.map((p) => (
              <tr key={p.key}>
                <th scope="row">
                  <span className={'c-swatch ' + p.cls} aria-hidden="true" /> {t(p.label)}
                </th>
                <td>{e[p.key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </span>
  );
}

function Donut({ e }: { e: CitizenEntity }) {
  const total = e.targetsCommitted;
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const pct = total > 0 ? Math.round((e.targetsAchieved / total) * 100) : 0;
  return (
    <svg className="c-donut" viewBox="0 0 140 140" aria-hidden="true">
      <circle cx="70" cy="70" r={r} className="track" />
      {PARTS.map((p) => {
        const n = e[p.key];
        if (n === 0) return null;
        const len = (n / total) * c;
        const el = (
          <circle
            key={p.key}
            cx="70"
            cy="70"
            r={r}
            className={'seg ' + p.cls}
            strokeDasharray={len + ' ' + (c - len)}
            strokeDashoffset={-offset}
          />
        );
        offset += len;
        return el;
      })}
      <text x="70" y="68" className="pct">{pct}%</text>
      <text x="70" y="88" className="of">{e.targetsAchieved} / {total}</text>
    </svg>
  );
}

function Stat({ label, value, ring = null }: { label: string; value: string; ring?: number | null }) {
  return (
    <div className="c-stat">
      {ring !== null ? (
        <svg className="c-ring" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="15" className="track" />
          <circle cx="18" cy="18" r="15" className="fill" strokeDasharray={ring * 94.25 + ' 94.25'} />
        </svg>
      ) : null}
      <span>
        <span className="c-stat-value">{value}</span>
        <span className="c-stat-label">{label}</span>
      </span>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={'c-chip' + (on ? ' on' : '')} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

function SavedNote({ t, at, lang }: { t: T; at: string; lang: string }) {
  return <p className="c-saved" role="status">{t('common.offline.saved', dateTime(at, lang))}</p>;
}

function Failed({ t, onRetry }: { t: T; onRetry: () => void }) {
  return (
    <div className="c-state">
      <p>{t('citizen.error')}</p>
      <div className="c-row">
        <button type="button" className="c-btn" onClick={onRetry}>{t('citizen.retry')}</button>
        <a className="c-btn ghost" href={href(location.pathname, { view: 'lite' })}>{t('common.view.lite')}</a>
      </div>
    </div>
  );
}

function Footer({ strings, t, path, go }: { strings: Strings; t: T; path: string; go: (to: string) => void }) {
  return (
    <footer className="c-footer">
      <nav aria-label={t('common.language')}>
        <span className="c-muted small">{t('common.language')}</span>
        <div className="c-langs">
          {strings.languages.map((l) => {
            const to = href(path, { lang: l.tag });
            return (
              <a
                key={l.tag}
                href={to}
                lang={l.tag}
                aria-current={strings.lang === l.tag ? 'true' : undefined}
                onClick={intercept(go, to)}
              >
                {l.name}
              </a>
            );
          })}
        </div>
      </nav>
      {/* A full page load on purpose: the light view is a different page from the server. */}
      <a className="c-lite" href={href(path, { view: 'lite', lang: strings.lang })}>{t('common.view.lite')}</a>
    </footer>
  );
}

function Frame({ children, skip = 'Skip to the main content' }: { children: ReactNode; skip?: string }) {
  return (
    <div className="c-page">
      <a className="c-skip" href="#main">{skip}</a>
      <div className="c-top">
        <span className="c-flag" aria-hidden="true">
          <i style={{ background: '#007A4D' }} />
          <i style={{ background: '#FFB612' }} />
          <i style={{ background: '#DE3831' }} />
          <i style={{ background: '#002395' }} />
        </span>
        <img src="/img/vuka-logo.png" alt="" aria-hidden="true" className="c-logo" width={27} height={22} draggable={false} />
        <span className="c-brand">Vuka</span>
        <span className="c-muted small">Sport, Arts and Culture</span>
      </div>
      <div className="c-wrap">{children}</div>
    </div>
  );
}

function Boot() {
  return (
    <Frame>
      <div className="c-grid" aria-busy="true">
        {[0, 1, 2].map((i) => <div key={i} className="c-card c-skeleton" />)}
      </div>
    </Frame>
  );
}

/** A normal link that the page handles itself, unless the reader asked for a new tab. */
function intercept(go: (to: string) => void, to: string) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(to);
  };
}
