/*
 * The full citizen view's data layer: the same PublicationService projection the light view
 * renders, and the same translation files, read as JSON from /public/api.
 *
 * savedAt is set only when the service worker answered from its saved copy, because it stamps
 * the copies it keeps and never the answers it passes through. So a figure on screen either came
 * from the server just now or carries the date it was saved on, and there is no third case.
 */

export interface CitizenEntity {
  entityId: string;
  name: string;
  sector: string;
  mandate: string | null;
  /** The entity's own public website, or null where none is on record. */
  website: string | null;
  financialYearLabel: string;
  totalAllocation: number;
  targetsCommitted: number;
  targetsAchieved: number;
  targetsInProgress: number;
  targetsMissed: number;
  targetsNotStarted: number;
  lastReportedAt: string | null;
}

export interface Strings {
  lang: string;
  languages: { tag: string; name: string }[];
  messages: Record<string, string>;
}

export interface Loaded<T> {
  data: T;
  savedAt: string | null;
}

export class NotFound extends Error {}

async function getJson<T>(url: string): Promise<Loaded<T>> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) throw new NotFound();
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return { data: (await res.json()) as T, savedAt: res.headers.get('X-Vuka-Saved-At') };
}

function withLang(url: string, lang: string | null) {
  return lang ? url + '?lang=' + encodeURIComponent(lang) : url;
}

export const load = {
  strings: (lang: string | null) => getJson<Strings>(withLang('/public/api/messages', lang)),
  entities: () => getJson<CitizenEntity[]>('/public/api/entities'),
  entity: (id: string) => getJson<CitizenEntity>('/public/api/entities/' + encodeURIComponent(id)),
};

/**
 * Fills a message pattern the way java.text.MessageFormat would for these strings: {0} and on,
 * with a doubled apostrophe standing for one wherever arguments are given. Afrikaans needs the
 * second rule, because 'n is a word.
 */
export function fmt(pattern: string | undefined, ...args: (string | number)[]): string {
  if (pattern === undefined) return '';
  if (args.length === 0) return pattern;
  return pattern
    .replace(/\{(\d+)\}/g, (m, i: string) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m))
    .replace(/''/g, "'");
}

const money = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });

export function rand(n: number): string {
  return 'R ' + money.format(n);
}

/** South African English rather than the browser's default English, so dates read 2 August 2026 as the light view does. */
function locale(lang: string) {
  return lang === 'en' ? 'en-ZA' : lang;
}

export function longDate(iso: string, lang: string): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function dateTime(iso: string, lang: string): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat(locale(lang), { dateStyle: 'long', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}
