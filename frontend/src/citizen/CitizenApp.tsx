/*
 * The full citizen view: the same published figures as the light view, laid out as a public
 * accountability portal. A search, the three sector groups, and for each entity the chain from
 * what it received to what the Department reviewed.
 *
 * Two screens, so no router. The addresses are the light view's own, /public and
 * /public/entity/{id}, and the lang and view parameters are carried through every link, so a
 * link copied from here opens the same page in the same language in either view.
 *
 * Every chart here repeats its numbers in words beside it. A bar of colours is a summary for
 * the sighted reader, and the table next to it is the record.
 *
 * What the design shows and this page does not: a story in the entity's own words, people reached,
 * and people and jobs. None of them is in the published projection, and workforce figures are kept
 * off the public surface on purpose (see PublicationService).
 *
 * Photographs are the design's own, and only three belong to a body: Freedom Park, the National
 * Heritage Council's mark and Boxing South Africa. Every other card takes a picture of its sector,
 * which is decoration and carries empty alt text, so nothing reads it out as the body's own venue.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, MouseEvent, ReactNode } from 'react';
import {
  NotFound, dateTime, fmt, load, longDate, num, rand, randShort,
  type AuditOutcome, type CitizenEntity, type Loaded, type PublicTarget, type Strings,
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

type T = (key: string, ...args: (string | number)[]) => string;
type Go = (to: string) => void;

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
    const hash = to.indexOf('#');
    history.pushState(null, '', to);
    setPath(location.pathname);
    setLang(new URLSearchParams(location.search).get('lang'));
    if (hash < 0) window.scrollTo(0, 0);
  }, []);

  const [strings, retryStrings] = useLoad(() => load.strings(lang), 'strings:' + (lang ?? ''), true);
  const route = routeOf(path);

  const s = strings.status === 'ready' ? strings.value.data : null;
  const t = useCallback<T>((key, ...args) => fmt(s?.messages[key], ...args), [s]);
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
        <div className="c-wrap">
          <div className="c-state">
            <p>The records could not be loaded. Check your connection and try again.</p>
            <div className="c-row">
              <button type="button" className="c-btn" onClick={retryStrings}>Try again</button>
              <a className="c-btn ghost" href={href(path, { view: 'lite' })}>Light version, uses less data</a>
            </div>
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame skip={t('common.skip')} header={<Masthead strings={s} t={t} path={path} go={go} />}>
      {route.kind === 'index' ? (
        <IndexScreen t={t} go={go} lang={activeLang} />
      ) : route.kind === 'entity' ? (
        <EntityScreen id={route.id} t={t} go={go} lang={activeLang} />
      ) : (
        <main id="main" className="c-wrap"><div className="c-state"><p>{t('citizen.notfound')}</p></div></main>
      )}
      <Footer strings={s} t={t} path={path} />
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* sectors                                                             */
/* ------------------------------------------------------------------ */

type Group = 'sport' | 'arts' | 'culture';
const GROUPS: Group[] = ['sport', 'arts', 'culture'];

/**
 * The portal's three groups over the register's six sectors. Heritage, libraries and language
 * are the Department's culture branch; OTHER is placed there rather than given a group of its own.
 */
function groupOf(sector: string): Group {
  const s = sector.toLowerCase();
  if (s === 'sport') return 'sport';
  if (s === 'arts') return 'arts';
  return 'culture';
}

type Photo = { card: string; wide: string | null; logo?: boolean };

const shot = (k: string): Photo => ({ card: '/img/citizen/' + k + '-card.jpg', wide: '/img/citizen/' + k + '-wide.jpg' });

/** Keyed by name, not id, because ids differ between databases and the names are the register's. */
const OWN_PHOTO: Record<string, Photo> = {
  'boxing south africa': shot('boxing'),
  'freedom park': shot('freedom-park'),
  'national heritage council of south africa': { card: '/img/citizen/nhc-logo.png', wide: null, logo: true },
};

const SECTOR_PHOTOS: Record<Group, Photo[]> = {
  sport: [shot('football'), { card: '/img/citizen/sport-gear-card.jpg', wide: '/img/citizen-sport.jpg' }],
  arts: [shot('theatre-hall'), shot('theatre-rehearsal')],
  culture: [shot('museum')],
};

/** A body's own picture where the design has one, else one of its sector's, the same one every visit. */
function photoOf(e: CitizenEntity): Photo {
  const own = OWN_PHOTO[e.name.trim().toLowerCase()];
  if (own) return own;
  const list = SECTOR_PHOTOS[groupOf(e.sector)];
  let h = 0;
  for (const c of e.entityId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

function sectorLabel(t: T, sector: string): string {
  return t('citizen.sector.' + sector.toLowerCase()) || sector;
}

/* ------------------------------------------------------------------ */
/* index                                                               */
/* ------------------------------------------------------------------ */

const PER_GROUP = 3;

function IndexScreen({ t, go, lang }: { t: T; go: Go; lang: string }) {
  const [state, retry] = useLoad(() => load.entities(), 'entities');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<Group | null>(null);
  const [open, setOpen] = useState<Record<Group, boolean>>({ sport: false, arts: false, culture: false });
  const listRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = t('page.index.title');
  }, [t]);

  const all = state.status === 'ready' ? state.value.data : [];
  const sorted = useMemo(() => [...all].sort((a, b) => a.name.localeCompare(b.name)), [all]);
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => sorted.filter((e) => (group ? groupOf(e.sector) === group : true))
      .filter((e) => (q ? e.name.toLowerCase().includes(q) : true)),
    [sorted, group, q],
  );
  const counts = useMemo(() => {
    const c: Record<Group, number> = { sport: 0, arts: 0, culture: 0 };
    for (const e of all) c[groupOf(e.sector)]++;
    return c;
  }, [all]);

  const totals = useMemo(
    () => ({
      money: all.reduce((n, e) => n + (e.totalAllocation ?? 0), 0),
      committed: all.reduce((n, e) => n + e.targetsCommitted, 0),
      achieved: all.reduce((n, e) => n + e.targetsAchieved, 0),
    }),
    [all],
  );

  const examples = sorted.slice(0, 3).map((e) => e.name).join(', ');

  const toList = () => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    toList();
  };
  const pick = (g: Group) => {
    setGroup(group === g ? null : g);
    toList();
  };

  return (
    <main id="main">
      <section className="c-hero">
        <div className="c-hero-inner">
          <h1>{t('citizen.hero.title')}</h1>
          <p className="c-lede">{t('citizen.hero.lede')}</p>
          <form className="c-searchbox" role="search" onSubmit={onSearch}>
            <div className="c-searchrow">
              <label className="c-search">
                <span className="c-vh">{t('citizen.search.placeholder')}</span>
                <Icon name="search" />
                <input
                  type="search"
                  value={query}
                  placeholder={t('citizen.search.placeholder')}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button type="submit" className="c-btn navy">{t('citizen.search.go')}</button>
            </div>
            {examples ? <p className="c-example">{t('citizen.search.example', examples)}</p> : null}
          </form>
        </div>
      </section>

      <div className="c-wrap">
        <div className="c-tiles" role="group" aria-label={t('citizen.sector.all')}>
          {GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              className={'c-tile ' + g + (group === g ? ' on' : '')}
              aria-pressed={group === g}
              onClick={() => pick(g)}
            >
              <span className={'c-tile-icon ' + g}><Icon name={g} /></span>
              <span className="c-tile-name">{t('citizen.group.' + g)}</span>
              {state.status === 'ready' ? <span className="c-tile-count">{counts[g]}</span> : null}
              <Icon name="arrow" />
            </button>
          ))}
        </div>

        {state.status === 'ready' && state.value.savedAt ? <SavedNote t={t} at={state.value.savedAt} lang={lang} /> : null}

        <section className="c-published" ref={listRef} aria-labelledby="published-h">
          <h2 id="published-h">{t('citizen.published.title')}</h2>
          <p className="c-sub">{t('citizen.published.lede')}</p>

          {state.status === 'loading' ? (
            <div className="c-grid" aria-busy="true" aria-label={t('citizen.loading')}>
              {[0, 1, 2].map((i) => <div key={i} className="c-card c-skeleton" />)}
            </div>
          ) : state.status !== 'ready' ? (
            <Failed t={t} onRetry={retry} />
          ) : all.length === 0 ? (
            <div className="c-state"><p>{t('page.index.empty')}</p></div>
          ) : (
            <>
              <p className="c-totals">
                {t('citizen.published.totals', all.length, randShort(totals.money, lang), totals.achieved, totals.committed)}
              </p>

              {matches.length === 0 ? (
                <div className="c-state"><p>{t('citizen.noresults')}</p></div>
              ) : q ? (
                <>
                  <p className="c-results" role="status">{t('citizen.results', query.trim())}</p>
                  <Cards list={matches} t={t} go={go} lang={lang} />
                </>
              ) : (
                GROUPS.map((g) => {
                  const inGroup = matches.filter((e) => groupOf(e.sector) === g);
                  if (inGroup.length === 0) return null;
                  const expanded = open[g] || group === g;
                  const shown = expanded ? inGroup : inGroup.slice(0, PER_GROUP);
                  return (
                    <section key={g} className="c-group" aria-labelledby={'g-' + g}>
                      <div className={'c-group-head ' + g}>
                        <h3 id={'g-' + g} className={'c-pill ' + g}>{t('citizen.group.' + g)}</h3>
                        <span className="c-group-rule" aria-hidden="true" />
                        {inGroup.length > PER_GROUP && group !== g ? (
                          <button
                            type="button"
                            className="c-more"
                            aria-expanded={expanded}
                            onClick={() => setOpen({ ...open, [g]: !open[g] })}
                          >
                            {expanded ? t('citizen.showfewer') : t('citizen.viewall', inGroup.length)}
                            <Icon name="arrow" />
                          </button>
                        ) : null}
                      </div>
                      <Cards list={shown} t={t} go={go} lang={lang} />
                    </section>
                  );
                })
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Cards({ list, t, go, lang }: { list: CitizenEntity[]; t: T; go: Go; lang: string }) {
  return (
    <ul className="c-grid" role="list">
      {list.map((e) => (
        <li key={e.entityId}>
          <EntityCard e={e} t={t} go={go} lang={lang} />
        </li>
      ))}
    </ul>
  );
}

function EntityCard({ e, t, go, lang }: { e: CitizenEntity; t: T; go: Go; lang: string }) {
  const to = href('/public/entity/' + e.entityId, {});
  const g = groupOf(e.sector);
  const photo = photoOf(e);
  return (
    <a className="c-card c-ecard" href={to} onClick={intercept(go, to)}>
      <img
        className={'c-art ' + g + (photo.logo ? ' logo' : '')}
        src={photo.card}
        alt=""
        width={104}
        height={120}
        loading="lazy"
        decoding="async"
      />
      <span className="c-ecard-body">
        <span className="c-name">{e.name}</span>
        <span className={'c-sectorline ' + g}>{sectorLabel(t, e.sector)}</span>
        <span className="c-label">{t('citizen.card.allocation', e.financialYearLabel)}</span>
        <span className="c-amount" title={rand(e.totalAllocation ?? 0)}>{randShort(e.totalAllocation ?? 0, lang)}</span>
        <span className="c-meta">
          <Icon name="calendar" />
          {e.lastReportedPeriod
            ? t('citizen.card.lastreported', e.lastReportedPeriod)
            : t('citizen.card.neverreported')}
        </span>
        {e.targetsCommitted > 0 ? (
          <span className="c-meta">
            <Icon name="target" />
            {t('page.index.targets', e.targetsAchieved, e.targetsCommitted)}
          </span>
        ) : null}
        <span className="c-open">
          {t('citizen.card.open')} <Icon name="arrow" />
        </span>
      </span>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* entity                                                              */
/* ------------------------------------------------------------------ */

function EntityScreen({ id, t, go, lang }: { id: string; t: T; go: Go; lang: string }) {
  const [state, retry] = useLoad(() => load.entity(id), 'entity:' + id);
  const e = state.status === 'ready' ? state.value.data : null;

  useEffect(() => {
    document.title = e ? t('page.entity.title', e.name) : t('page.index.title');
  }, [e, t]);

  const back = href('/public', {});
  const backLink = (
    <a className="c-back" href={back} onClick={intercept(go, back)}>
      <Icon name="back" /> {t('citizen.back')}
    </a>
  );

  if (state.status === 'loading') {
    return (
      <main id="main" className="c-wrap">
        {backLink}
        <div className="c-card c-skeleton tall" aria-busy="true" aria-label={t('citizen.loading')} />
      </main>
    );
  }
  if (state.status === 'notfound') {
    return <main id="main" className="c-wrap">{backLink}<div className="c-state"><p>{t('citizen.notfound')}</p></div></main>;
  }
  if (state.status === 'error' || !e) {
    return <main id="main" className="c-wrap">{backLink}<Failed t={t} onRetry={retry} /></main>;
  }

  const g = groupOf(e.sector);
  const photo = photoOf(e);
  const reviewed = Boolean(e.lastReportedAt);
  const targets = e.targets ?? [];
  const audits = e.audits ?? [];
  const programmes = e.programmes ?? [];

  return (
    <main id="main">
      <section
        className={'c-ehero ' + g + (photo.wide ? ' photo' : '')}
        style={photo.wide ? ({ '--c-photo': "url('" + photo.wide + "')" } as CSSProperties) : undefined}
      >
        <div className="c-ehero-inner">
          <div className="c-ehero-text">
            {backLink}
            <p><span className={'c-pill ' + g}>{t('citizen.group.' + g)}</span></p>
            <h1>{e.name}</h1>
            <p className="c-ehero-sector">{sectorLabel(t, e.sector)}</p>
            {e.mandate ? <p className="c-lede">{e.mandate}</p> : null}
            <dl className="c-ehero-meta">
              <div>
                <Icon name="calendar" />
                <span>
                  <dt>{t('citizen.entity.allocation', e.financialYearLabel)}</dt>
                  <dd>{randShort(e.totalAllocation ?? 0, lang)}</dd>
                </span>
              </div>
              <div>
                <Icon name="calendar" />
                <span>
                  <dt>{t('citizen.entity.lastreported')}</dt>
                  <dd>{e.lastReportedPeriod ?? t('citizen.card.neverreported')}</dd>
                </span>
              </div>
            </dl>
          </div>
          {photo.wide ? null : (
            <div className={'c-ehero-art' + (photo.logo ? ' logo' : ' ' + g)} aria-hidden="true">
              {photo.logo ? <img src={photo.card} alt="" /> : <Icon name={g} />}
            </div>
          )}
        </div>
      </section>

      <div className="c-wrap">
        {state.value.savedAt ? <SavedNote t={t} at={state.value.savedAt} lang={lang} /> : null}

        <section className="c-chain" aria-labelledby="chain-h">
          <h2 id="chain-h">{t('citizen.chain.title')}</h2>
          <p className="c-sub">{t('citizen.chain.lede')}</p>
          <ol className="c-chain-steps">
            <ChainStep
              n={1} tone="received" icon="coins" label={t('citizen.chain.received')}
              value={e.allocationSource ? randShort(e.totalAllocation ?? 0, lang) : t('citizen.chain.none')}
              note={t('citizen.chain.received.note')}
              source={e.allocationSource ? t('citizen.chain.source', e.allocationSource) : null}
            />
            <ChainStep
              n={2} tone="promised" icon="target" label={t('citizen.chain.promised')}
              value={e.targetsCommitted > 0 ? t('citizen.chain.promised.value', e.targetsCommitted) : t('citizen.chain.none')}
              note={t('citizen.chain.promised.note')}
              source={e.targetsSource ? t('citizen.chain.source', e.targetsSource) : null}
            />
            <ChainStep
              n={3} tone="delivered" icon="chart" label={t('citizen.chain.delivered')}
              value={e.targetsCommitted > 0
                ? t('citizen.chain.delivered.value', e.targetsReported ?? 0, e.targetsCommitted)
                : t('citizen.chain.none')}
              note={t('citizen.chain.delivered.note')}
              source={e.lastReportedPeriod ? t('citizen.chain.source', e.lastReportedPeriod) : null}
            />
            <ChainStep
              n={4} tone="reviewed" icon="shield" label={t('citizen.chain.reviewed')}
              value={reviewed ? t('citizen.chain.reviewed.yes') : t('citizen.chain.reviewed.no')}
              note={t('citizen.chain.reviewed.note')}
              source={e.lastReportedAt ? t('citizen.status.updated', longDate(e.lastReportedAt, lang)) : null}
            />
          </ol>
        </section>

        <nav className="c-tabs" aria-label={t('citizen.nav.label')}>
          <a href="#targets">{t('citizen.nav.targets')}</a>
          <a href="#funding">{t('citizen.nav.funding')}</a>
          <a href="#history">{t('citizen.nav.history')}</a>
        </nav>

        <div className="c-layout">
          <div className="c-main">
            <section id="targets" className="c-card c-panel" aria-labelledby="targets-h">
              <h2 id="targets-h">{t('citizen.targets.title')}</h2>
              <p className="c-sub">{t('citizen.targets.lede', e.financialYearLabel)}</p>
              {targets.length === 0 ? (
                <p className="c-muted">{t('citizen.targets.none')}</p>
              ) : (
                <TargetTable targets={targets} t={t} lang={lang} />
              )}
              {e.targetsSource ? <p className="c-source">{t('citizen.chain.source', e.targetsSource)}</p> : null}
            </section>

            <section className="c-card c-panel" aria-labelledby="delivered-h">
              <h2 id="delivered-h">{t('citizen.delivered.title')}</h2>
              <p className="c-sub">{t('citizen.delivered.lede')}</p>
              {e.targetsCommitted === 0 ? (
                <p className="c-muted">{t('citizen.targets.none')}</p>
              ) : (
                <div className="c-outcomes-body">
                  <Donut e={e} />
                  <Outcomes e={e} t={t} />
                </div>
              )}
            </section>
          </div>

          <aside className="c-side">
            <section className="c-card c-sidecard" aria-labelledby="status-h">
              <span className={'c-sideicon ' + (reviewed ? 'ok' : 'none')}><Icon name={reviewed ? 'check' : 'clock'} /></span>
              <div>
                <h2 id="status-h">{t('citizen.status.title')}</h2>
                <p><span className={'c-badge ' + (reviewed ? 'ok' : 'none')}>
                  {reviewed ? t('citizen.status.reviewed') : t('citizen.status.none')}
                </span></p>
                {e.lastReportedAt ? <p className="c-small">{t('citizen.status.updated', longDate(e.lastReportedAt, lang))}</p> : null}
                {e.lastReportedPeriod ? <p className="c-small">{t('citizen.status.period', e.lastReportedPeriod)}</p> : null}
                <p className="c-small c-muted">{t('page.entity.disclaimer')}</p>
              </div>
            </section>

            <section id="funding" className="c-card c-sidecard" aria-labelledby="funding-h">
              <span className="c-sideicon navy"><Icon name="coins" /></span>
              <div>
                <h2 id="funding-h">{t('citizen.funding.title')}</h2>
                <dl className="c-kv">
                  <dt>{t('citizen.funding.allocation')}</dt>
                  <dd>{rand(e.totalAllocation ?? 0)}</dd>
                  {programmes.length > 0 ? (
                    <>
                      <dt>{t('citizen.funding.programme')}</dt>
                      <dd>{programmes.join(', ')}</dd>
                    </>
                  ) : null}
                  <dt>{t('citizen.funding.year')}</dt>
                  <dd>{e.financialYearLabel}</dd>
                </dl>
                {e.allocationSource ? <p className="c-source">{t('citizen.chain.source', e.allocationSource)}</p> : null}
              </div>
            </section>

            {/* The way out of this page. Vuka answers one question about a funded body and raises
                three it cannot: what is on, how to visit, who runs it. Without this the reader's
                next step was a search engine. Absent entirely where no address is on record,
                because a wrong link under a government masthead is worse than no link. */}
            {e.website ? (
              <section className="c-card c-sidecard" aria-labelledby="links-h">
                <span className="c-sideicon navy"><Icon name="link" /></span>
                <div>
                  <h2 id="links-h">{t('citizen.links.title')}</h2>
                  <a href={e.website} target="_blank" rel="noopener noreferrer external" className="c-textlink">
                    {t('page.entity.website', e.name)} <span aria-hidden="true">&#8599;</span>
                  </a>
                  <p className="c-small c-muted">{t('page.entity.website.note')}</p>
                </div>
              </section>
            ) : null}

            <section className="c-card c-sidecard c-info" aria-labelledby="sources-h">
              <span className="c-sideicon navy"><Icon name="info" /></span>
              <div>
                <h2 id="sources-h">{t('citizen.sources.title')}</h2>
                <p className="c-small">{t('citizen.sources.body')}</p>
              </div>
            </section>
          </aside>
        </div>

        <section id="history" className="c-card c-panel" aria-labelledby="history-h">
          <h2 id="history-h">{t('citizen.history.title')}</h2>
          <p className="c-sub">{t('citizen.history.lede')}</p>
          {audits.length === 0 ? (
            <p className="c-muted">{t('citizen.history.none')}</p>
          ) : (
            <table className="c-rtable c-history">
              <caption className="c-vh">{t('citizen.history.title')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('citizen.history.col.year')}</th>
                  <th scope="col">{t('citizen.history.col.outcome')}</th>
                  <th scope="col">{t('citizen.history.col.source')}</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.financialYear}>
                    <th scope="row" data-label={t('citizen.history.col.year')}>{a.financialYear}</th>
                    <td data-label={t('citizen.history.col.outcome')}>
                      <span className={'c-outcome ' + auditTone(a.outcome)}>
                        <Icon name={auditTone(a.outcome) === 'ok' ? 'check' : 'alert'} />
                        {t('citizen.audit.' + a.outcome)}
                      </span>
                    </td>
                    <td data-label={t('citizen.history.col.source')} className="c-small c-muted">{a.source ?? t('citizen.chain.none')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="c-disclaimer">{t('page.entity.disclaimer')}</p>
      </div>
    </main>
  );
}

function auditTone(o: AuditOutcome): 'ok' | 'warn' | 'bad' {
  if (o === 'UNQUALIFIED') return 'ok';
  if (o === 'UNQUALIFIED_WITH_FINDINGS') return 'warn';
  return 'bad';
}

function ChainStep({ n, tone, icon, label, value, note, source }: {
  n: number; tone: string; icon: IconName; label: string; value: string; note: string; source: string | null;
}) {
  return (
    <li className="c-step">
      <span className={'c-step-icon ' + tone} aria-hidden="true"><Icon name={icon} /></span>
      <div>
        <p className="c-step-label">
          <span aria-hidden="true">{String(n).padStart(2, '0')}. </span>{label}
        </p>
        <p className="c-step-value">{value}</p>
        <p className="c-small c-muted">{note}</p>
        {source ? <p className="c-source">{source}</p> : null}
      </div>
    </li>
  );
}

/**
 * One row per committed target. On a phone each row becomes a small card, and the column name
 * rides along beside each value, so the table stays a table for a screen reader at every width.
 */
function TargetTable({ targets, t, lang }: { targets: PublicTarget[]; t: T; lang: string }) {
  return (
    <table className="c-rtable c-targets">
      <caption className="c-vh">{t('citizen.targets.title')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('citizen.targets.col.commitment')}</th>
          <th scope="col" className="n">{t('citizen.targets.col.target')}</th>
          <th scope="col" className="n">{t('citizen.targets.col.reported')}</th>
          <th scope="col">{t('citizen.targets.col.pct')}</th>
        </tr>
      </thead>
      <tbody>
        {targets.map((x, i) => {
          const pct = x.reported !== null && x.annualTarget ? (x.reported / x.annualTarget) * 100 : null;
          return (
            <tr key={(x.indicatorRef ?? '') + i}>
              <th scope="row" data-label={t('citizen.targets.col.commitment')}>
                {x.indicator ?? x.indicatorRef}
              </th>
              <td className="n" data-label={t('citizen.targets.col.target')}>
                {x.annualTarget !== null ? num(x.annualTarget, lang) : t('citizen.chain.none')}
              </td>
              <td className="n" data-label={t('citizen.targets.col.reported')}>
                {x.reported !== null ? num(x.reported, lang) : <span className="c-muted">{t('citizen.targets.notreported')}</span>}
              </td>
              <td data-label={t('citizen.targets.col.pct')}>
                {pct !== null ? (
                  <span className="c-pct">
                    <span className="c-pct-num">{num(Math.round(pct * 10) / 10, lang)}%</span>
                    <span className="c-pct-bar" aria-hidden="true">
                      <i className={x.status === 'MISSED' ? 'missed' : ''} style={{ width: Math.min(100, pct) + '%' }} />
                    </span>
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/* shared                                                              */
/* ------------------------------------------------------------------ */

const PARTS = [
  { key: 'targetsAchieved', label: 'page.entity.achieved', cls: 'ok' },
  { key: 'targetsInProgress', label: 'page.entity.inprogress', cls: 'progress' },
  { key: 'targetsMissed', label: 'page.entity.missed', cls: 'missed' },
  { key: 'targetsNotStarted', label: 'page.entity.notstarted', cls: 'none' },
] as const;

/**
 * The four outcomes as words with numbers. The donut beside it is hidden from screen readers
 * because this table says the same thing exactly, and a colour is never the only carrier.
 */
function Outcomes({ e, t }: { e: CitizenEntity; t: T }) {
  return (
    <table className="c-table">
      <caption className="c-vh">{t('page.entity.summary')}</caption>
      <tbody>
        <tr>
          <th scope="row">{t('page.entity.committed')}</th>
          <td>{e.targetsCommitted}</td>
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

/**
 * The language choice as a list of links in a disclosure rather than a select. Choosing from a
 * select that navigates on change moves a keyboard user off the page while they are still
 * arrowing through the options; a link does nothing until it is chosen.
 */
function Masthead({ strings, t, path, go }: { strings: Strings; t: T; path: string; go: Go }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const current = strings.languages.find((l) => l.tag === strings.lang)?.name ?? strings.lang;

  useEffect(() => {
    const close = (ev: Event) => {
      const d = ref.current;
      if (d?.open && !d.contains(ev.target as Node)) d.open = false;
    };
    const esc = (ev: KeyboardEvent) => {
      const d = ref.current;
      if (ev.key === 'Escape' && d?.open) {
        d.open = false;
        d.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  const home = href('/public', {});
  return (
    <header className="c-top">
      <div className="c-top-inner">
        <a className="c-logo" href={home} onClick={intercept(go, home)}>
          <Mark />
          <span className="c-word">VUKA</span>
          <span className="c-portal">{t('citizen.portal')}</span>
        </a>
        <div className="c-top-actions">
          <details className="c-lang" ref={ref}>
            <summary>
              <Icon name="globe" />
              <span className="c-vh">{t('common.language')}: </span>
              <span className="c-lang-current">{current}</span>
              <Icon name="chevron" />
            </summary>
            <ul role="list">
              {strings.languages.map((l) => {
                const to = href(path, { lang: l.tag });
                return (
                  <li key={l.tag}>
                    <a
                      href={to}
                      lang={l.tag}
                      aria-current={strings.lang === l.tag ? 'true' : undefined}
                      onClick={(ev) => {
                        if (ref.current) ref.current.open = false;
                        intercept(go, to)(ev);
                      }}
                    >
                      {l.name}
                    </a>
                  </li>
                );
              })}
            </ul>
          </details>
          <a className="c-about-link" href="#about">{t('citizen.about')}</a>
        </div>
      </div>
    </header>
  );
}

function Footer({ strings, t, path }: { strings: Strings; t: T; path: string }) {
  return (
    <footer className="c-footer" id="about">
      <div className="c-footer-inner">
        <ul className="c-values" role="list">
          <li>
            <Icon name="shield" />
            <div><p className="c-value-title">{t('citizen.about.transparency')}</p><p>{t('citizen.about.transparency.body')}</p></div>
          </li>
          <li>
            <Icon name="doc" />
            <div><p className="c-value-title">{t('citizen.about.traceable')}</p><p>{t('citizen.about.traceable.body')}</p></div>
          </li>
          <li>
            <Icon name="people" />
            <div><p className="c-value-title">{t('citizen.about.stronger')}</p><p>{t('citizen.about.stronger.body')}</p></div>
          </li>
          <li className="c-dept">
            <img src="/img/arms-96.png" width="38" height="48" alt="" loading="lazy" />
            <div>
              <p className="c-value-title">{t('citizen.about.dsac')}</p>
              <p>{t('citizen.group.sport')} &middot; {t('citizen.group.arts')} &middot; {t('citizen.group.culture')}</p>
            </div>
          </li>
        </ul>
        <div className="c-footer-base">
          <p className="c-about-body">
            <strong>{t('citizen.about')}. </strong>{t('citizen.about.body')}
          </p>
          {/* A full page load on purpose: the light view is a different page from the server. */}
          <a className="c-lite" href={href(path, { view: 'lite', lang: strings.lang })}>{t('common.view.lite')}</a>
        </div>
      </div>
    </footer>
  );
}

function Frame({ children, skip = 'Skip to the main content', header }: { children: ReactNode; skip?: string; header?: ReactNode }) {
  return (
    <div className="c-page">
      <a className="c-skip" href="#main">{skip}</a>
      {header ?? (
        <header className="c-top">
          <div className="c-top-inner">
            <span className="c-logo"><Mark /><span className="c-word">VUKA</span></span>
          </div>
        </header>
      )}
      {children}
    </div>
  );
}

function Boot() {
  return (
    <Frame>
      <div className="c-wrap">
        <div className="c-grid" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="c-card c-skeleton" />)}
        </div>
      </div>
    </Frame>
  );
}

/** A normal link that the page handles itself, unless the reader asked for a new tab. */
function intercept(go: Go, to: string) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(to);
  };
}

/* ------------------------------------------------------------------ */
/* marks and icons                                                     */
/* ------------------------------------------------------------------ */

/** The Vuka V. Decorative: the word VUKA follows it. */
function Mark() {
  return <img className="c-mark" src="/img/vuka-mark.png" width="37" height="30" alt="" />;
}

type IconName =
  | Group | 'search' | 'arrow' | 'back' | 'calendar' | 'target' | 'coins' | 'chart' | 'shield'
  | 'check' | 'clock' | 'alert' | 'link' | 'info' | 'globe' | 'chevron' | 'doc' | 'people';

/** Simple line icons, drawn here so the page carries no icon font and no second request. */
function Icon({ name }: { name: IconName }) {
  const p = {
    fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  const paths: Record<IconName, ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" {...p} /><path d="M20 20l-4-4" {...p} /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" {...p} />,
    back: <path d="M19 12H5M11 6l-6 6 6 6" {...p} />,
    chevron: <path d="M6 9l6 6 6-6" {...p} />,
    calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" {...p} /><path d="M3.5 10h17M8 3v4M16 3v4" {...p} /></>,
    target: <><circle cx="12" cy="12" r="8.5" {...p} /><circle cx="12" cy="12" r="4.5" {...p} /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
    coins: <><ellipse cx="10" cy="7" rx="6" ry="2.8" {...p} /><path d="M4 7v5c0 1.5 2.7 2.8 6 2.8M16 7v2" {...p} /><ellipse cx="15" cy="14" rx="5.5" ry="2.6" {...p} /><path d="M9.5 14v3.4c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V14" {...p} /></>,
    chart: <path d="M5 20V11M10 20V5M15 20v-7M20 20V8" {...p} />,
    shield: <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" {...p} /><path d="M8.5 12l2.5 2.5 4.5-5" {...p} /></>,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" {...p} />,
    clock: <><circle cx="12" cy="12" r="8.5" {...p} /><path d="M12 7.5V12l3 2" {...p} /></>,
    alert: <><path d="M12 4l9 16H3z" {...p} /><path d="M12 10v4M12 17.2v.1" {...p} /></>,
    link: <><path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1" {...p} /><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1" {...p} /></>,
    info: <><circle cx="12" cy="12" r="8.5" {...p} /><path d="M12 11v5.5M12 7.8v.1" {...p} /></>,
    globe: <><circle cx="12" cy="12" r="8.5" {...p} /><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5z" {...p} /></>,
    doc: <><path d="M6 3h8l4 4v14H6z" {...p} /><path d="M14 3v4h4M9 12h6M9 16h6" {...p} /></>,
    people: <><circle cx="9" cy="8" r="3" {...p} /><circle cx="17" cy="9" r="2.4" {...p} /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14.5 14.6c.8-.4 1.6-.6 2.5-.6 2.2 0 3.8 1.5 4.3 4" {...p} /></>,
    sport: <><circle cx="14.5" cy="4.5" r="2" fill="currentColor" /><path d="M8 21l3-6 3 2.5V21M6.5 11l3.5-3 4 1 2.5 3.5 3 .5M10 8l1 4.5-4 2.5" {...p} /></>,
    arts: <><path d="M3.5 5.5c2.7-1.3 5.3-1.3 8 0v6c0 3-1.8 5-4 5s-4-2-4-5z" {...p} /><path d="M12.5 9c2.7-1.3 5.3-1.3 8 0v6c0 3-1.8 5-4 5s-4-2-4-5" {...p} /><path d="M5.8 9h.1M9.2 9h.1M6 13c1 .8 2 .8 3 0M14.8 12.5h.1M18.2 12.5h.1M15 17c1-.8 2-.8 3 0" {...p} /></>,
    culture: <><path d="M3 9.5L12 4l9 5.5z" {...p} /><path d="M5 20.5h14M4 9.5h16M6.5 10v8M10 10v8M14 10v8M17.5 10v8M4 18h16" {...p} /></>,
  };
  return (
    <svg className="c-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
