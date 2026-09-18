/*
 * Language, across the whole application.
 *
 * <h2>Scope</h2>
 *
 * Every screen: the landing page, the three auth screens, and the eighteen screens of the
 * dashboard behind them. An earlier version of this file covered only the front door and said
 * so, on the reasoning that translating dense regulatory vocabulary badly is worse than
 * translating four screens well. That reasoning was sound about quality and wrong about scope:
 * a reporting officer at a provincial museum is exactly the person most likely to want isiZulu,
 * and they live in the dashboard, not on the landing page.
 *
 * So the scope grew and the quality caveat stayed. It is stated below rather than quietly
 * dropped.
 *
 * The five languages match the ones the Thymeleaf citizen surface already serves, and the
 * choice made here travels to it: every link into /public or /m carries the language, so a
 * person who picked isiZulu on the way in does not land on an English page.
 *
 * <h2>The caveat, which belongs in the pitch too</h2>
 *
 * South Africa has twelve official languages and this is five. These strings have not been
 * reviewed by first-language speakers, exactly as SESSION-LOG.md already records for the
 * citizen surface. The honest claim is that the interface is fully externalised, so translation
 * is a content task rather than a rebuild, and that PanSALB, which is in the seeded portfolio,
 * is the obvious partner to review it. Claiming twelve reviewed languages and demonstrating
 * five machine-drafted ones would be worse than saying this.
 *
 * Four phrases carry legal or audit meaning and are called out in en.ts so a reviewer knows not
 * to smooth them over: unverifiable against unverified, statutory against departmental, "no
 * result reported" which is never "zero", and "arithmetic, not a prediction".
 *
 * <h2>Why no library</h2>
 *
 * Three hundred keys and five languages does not need i18next and its plural formatter. This is
 * a map, a lookup and a positional substitution, and it costs nothing against the page weight
 * budget. What it does need is type safety, which is why every dictionary is declared as
 * Record<Key, string> against en.ts: a missing key is a compile error rather than a word that
 * silently falls back on a screen nobody happened to open in isiXhosa.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { en } from './en';
import type { Key } from './en';

export type { Key } from './en';

export type Lang = 'en' | 'af' | 'zu' | 'xh' | 'st';

/** Each language named in itself, which is the only respectful way to list them. */
export const LANGUAGES: { code: Lang; label: string; english: string }[] = [
  { code: 'en', label: 'English', english: 'English' },
  { code: 'af', label: 'Afrikaans', english: 'Afrikaans' },
  { code: 'zu', label: 'isiZulu', english: 'isiZulu' },
  { code: 'xh', label: 'isiXhosa', english: 'isiXhosa' },
  { code: 'st', label: 'Sesotho', english: 'Sesotho' },
];

/**
 * The four other languages are fetched when one is chosen, not shipped with the page.
 *
 * Each dictionary is about sixty five kilobytes of text. Bundling all five put three hundred and
 * thirty kilobytes into every page load, most of it words the reader will never see: somebody
 * working in English was downloading the isiXhosa, isiZulu, Sesotho and Afrikaans copies too.
 * Section 11 of the frontend design sets a two hundred and fifty kilobyte budget for the
 * dashboard, and that is not an arbitrary number: it is a reporting officer on a provincial
 * museum's connection paying for every byte.
 *
 * English stays in the bundle because it is both the default and the fallback, so there is always
 * something to render while another language is in flight.
 */
const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<Record<Key, string>>> = {
  af: () => import('./af').then((m) => m.af),
  zu: () => import('./zu').then((m) => m.zu),
  xh: () => import('./xh').then((m) => m.xh),
  st: () => import('./st').then((m) => m.st),
};

const STORAGE = 'vuka.lang';

export interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  /**
   * Falls back to English rather than showing a key, which is never what a reader wants.
   * Positional arguments replace {0}, {1} and so on, in the order given.
   */
  t: (key: Key, ...args: (string | number)[]) => string;
  /** Appends the chosen language to a link into the Thymeleaf surfaces. */
  withLang: (path: string) => string;
}

const Ctx = createContext<I18n | null>(null);

function known(code: string | null | undefined): code is Lang {
  return code === 'en' || code === 'af' || code === 'zu' || code === 'xh' || code === 'st';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (known(saved)) return saved;
    } catch {
      // Storage throws in a private window. The default is English either way.
    }
    // The browser's own preference, where it happens to be one we serve.
    const nav = navigator.language?.slice(0, 2);
    return known(nav) ? nav : 'en';
  });

  /* What has actually arrived. English is here from the start; the others join as they load. */
  const [dicts, setDicts] = useState<Partial<Record<Lang, Record<Key, string>>>>({ en });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE, l);
    } catch {
      // A browser that refuses storage still switches, it just forgets on reload.
    }
  }, []);

  /* Fetch the chosen dictionary, once. Until it lands, every lookup falls through to English, so
     the page reads in English for a moment rather than flashing a screen of raw keys. A failed
     fetch, which is what a dropped connection looks like, leaves it in English permanently rather
     than leaving it broken: the reader is inconvenienced, not stranded. */
  useEffect(() => {
    if (lang === 'en' || dicts[lang]) return;
    let live = true;
    void LOADERS[lang]()
      .then((d) => {
        if (live) setDicts((prev) => ({ ...prev, [lang]: d }));
      })
      .catch(() => {
        // Left in English. Nothing to report to the reader that they can act on.
      });
    return () => {
      live = false;
    };
  }, [lang, dicts]);

  /* The document has to declare the language it is actually in, or a screen reader pronounces
     isiZulu with English phonics. Section 11 of the frontend design claims this and it has to
     stay true once the page can change language. It follows what has loaded rather than what was
     chosen, so the announcement never disagrees with the words on screen. */
  useEffect(() => {
    const showing = dicts[lang] ? lang : 'en';
    document.documentElement.lang = showing === 'en' ? 'en-ZA' : showing;
  }, [lang, dicts]);

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, ...args) => fill(dicts[lang]?.[key] ?? en[key] ?? String(key), args),
      withLang: (path) => {
        if (lang === 'en') return path;
        return path + (path.includes('?') ? '&' : '?') + 'lang=' + lang;
      },
    }),
    // dicts is in here on purpose: without it the whole tree keeps the English `t` after the
    // chosen dictionary arrives, and the language change appears to do nothing.
    [lang, setLang, dicts],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n used outside I18nProvider');
  return ctx;
}

/**
 * Positional substitution.
 *
 * Positional rather than named because word order is the whole point of translating: Afrikaans
 * and Sesotho put the count and the noun in different places, and a template that hard codes
 * "{n} days" forces every language to pretend it is English. A placeholder that can move is the
 * minimum a translator needs.
 *
 * An index with no argument is left as written rather than replaced with "undefined", so a
 * missing argument shows up as a visible {0} in review instead of a plausible looking word.
 */
function fill(template: string, args: (string | number)[]): string {
  if (args.length === 0) return template;
  return template.replace(/\{(\d+)\}/g, (whole, i: string) => {
    const arg = args[Number(i)];
    return arg === undefined ? whole : String(arg);
  });
}
