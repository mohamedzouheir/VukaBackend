/*
 * Ask Vuka. The question box for somebody who is in a meeting.
 *
 * <h2>What this is, and what it is deliberately not</h2>
 *
 * It is not a language model and it does not pretend to be one. There is no model behind it, no
 * key, no request leaving the building and nothing to go wrong on conference wifi. It matches a
 * typed question against a fixed set of questions this product can answer, and then answers it by
 * reading the same figures the screens behind it are drawn from. Where it cannot match, it says so
 * and offers the questions it can take, rather than producing a fluent sentence nobody can check.
 *
 * That restraint is the point rather than a limitation of the prototype. An executive quoting a
 * number in a portfolio committee is accountable for it. A number that came from a model that
 * might have inferred it is a number they cannot defend, and the first time one is wrong in that
 * room the product is finished. Every answer here carries where it came from and a link to the
 * screen that shows the working, so the answer can be checked in the same minute it is given.
 *
 * <h2>Why it exists at all</h2>
 *
 * The analytics screen answers about forty questions and a meeting asks one. Finding that one on a
 * page of tables takes longer than the moment allows, and the alternative in the room is the
 * executive guessing. This is the index into the screens, in the words somebody would actually use.
 *
 * <h2>Matching, in five languages</h2>
 *
 * Each question carries its trigger words per language, because matching English stems against a
 * question typed in Sesotho would quietly answer the wrong thing, which is the one failure this
 * component cannot afford. English words stay in every language's trigger list: a bilingual user
 * types whichever comes first, and a false match costs nothing here because the wrong answer is
 * still a labelled, sourced answer to a visible question.
 */
import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import type { AnalyticsView, PortfolioRow, SubmissionRow } from '../lib/types';
import { num, percent, randsShort, reviewPeriod } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { I18n, Key } from '../lib/i18n';
import { useLabels } from '../lib/labels';
import type { Labels } from '../lib/labels';
import { IconChevronRight, IconCitation, IconHelp, IconSend, IconSpinner, IconX } from '../icons';
import './AskVuka.css';

interface Facts {
  analytics: AnalyticsView | null;
  portfolio: PortfolioRow[] | null;
  submissions: SubmissionRow[] | null;
  periodId: string | null;
  periodLabel: string | null;
  t: I18n['t'];
  L: Labels;
}

interface Answer {
  /** The sentence that gets quoted. Kept to one or two. */
  headline: ReactNode;
  /** Optional supporting lines, each already a complete statement. */
  detail?: ReactNode;
  /** Where the figure came from. Never optional: an answer without a source is a rumour. */
  source: string;
  /** The screen that shows the working. */
  link?: { to: string; label: string };
}

interface Handler {
  id: string;
  /** The suggestion chip, and the question echoed back when the chip is used. */
  ask: Key;
  /**
   * Trigger words per language, lower case and stem-like. A typed word matches when it starts
   * with a trigger or a trigger starts with it, so "filing" matches "file".
   */
  needs: Record<string, string[]>;
  answer: (f: Facts) => Answer | null;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function inBand(f: Facts, bands: string[]) {
  return (f.portfolio ?? []).filter((r) => bands.includes(r.band));
}

function money(rows: PortfolioRow[]): number | null {
  const withAllocation = rows.filter((r) => r.totalAllocation !== null);
  if (withAllocation.length === 0) return null;
  return withAllocation.reduce((n, r) => n + (r.totalAllocation ?? 0), 0);
}

function names(f: Facts, rows: PortfolioRow[], limit = 5): string {
  const shown = rows.slice(0, limit).map((r) => r.shortName ?? r.name);
  return rows.length > limit
    ? f.t('ask.namesAndMore', shown.join(', '), num(rows.length - limit) ?? '')
    : shown.join(', ');
}

function nothing(f: Facts): Answer {
  return { headline: f.t('ask.nothingComputed'), source: f.t('ask.nothingComputedSource') };
}

/* ------------------------------------------------------------------ */
/* the questions                                                       */
/* ------------------------------------------------------------------ */

const HANDLERS: Handler[] = [
  {
    id: 'risk',
    ask: 'ask.qRisk',
    needs: {
      en: ['critical', 'risk', 'worst', 'concern', 'high', 'danger'],
      af: ['kritiek', 'risiko', 'ergste', 'hoog', 'kommer'],
      zu: ['ubungozi', 'bucayi', 'phezulu', 'mbi'],
      xh: ['umngcipheko', 'nzima', 'phezulu', 'mbi'],
      st: ['kotsi', 'tshosang', 'holimo', 'mpe'],
    },
    answer: (f) => {
      if (!f.portfolio) return null;
      const critical = inBand(f, ['CRITICAL']);
      const high = inBand(f, ['HIGH']);
      const m = money(critical);
      return {
        headline: f.t(
          'ask.aRisk',
          num(critical.length) ?? '',
          num(high.length) ?? '',
          num(f.portfolio.length) ?? '',
        ),
        detail: (
          <>
            <p>
              {critical.length > 0
                ? f.t('ask.aRiskCritical', names(f, critical)) +
                  (m !== null ? ' ' + f.t('ask.aRiskMoney', randsShort(m) ?? '') : '')
                : f.t('ask.aRiskNoneCritical')}
            </p>
            {high.length > 0 ? <p>{f.t('ask.aRiskHigh', names(f, high))}</p> : null}
          </>
        ),
        source: f.t('ask.sRisk'),
        link: { to: '/risk', label: f.t('nav.risk') },
      };
    },
  },
  {
    id: 'money-at-risk',
    ask: 'ask.qMoney',
    needs: {
      en: ['money', 'rand', 'rands', 'much', 'value', 'budget', 'allocation', 'allocated', 'spend'],
      af: ['geld', 'rand', 'baie', 'waarde', 'begroting', 'toewysing', 'bestee'],
      zu: ['imali', 'irandi', 'ingakanani', 'isabelomali', 'abelwe'],
      xh: ['imali', 'irandi', 'ingakanani', 'uhlahlo', 'yabelwe'],
      st: ['chelete', 'rand', 'kae', 'tekanyetso', 'abetswe'],
    },
    answer: (f) => {
      if (!f.portfolio) return null;
      const all = money(f.portfolio);
      const risky = inBand(f, ['CRITICAL', 'HIGH']);
      return {
        headline: f.t(
          'ask.aMoney',
          randsShort(money(risky)) ?? f.t('ask.noAllocationOnRecord'),
          num(risky.length) ?? '',
        ),
        detail: (
          <p>
            {f.t(
              'ask.aMoneyTotal',
              randsShort(all) ?? f.t('ask.notOnRecord'),
              num(f.portfolio.length) ?? '',
            )}
          </p>
        ),
        source: f.t('ask.sMoney'),
        link: { to: '/portfolio', label: f.t('nav.portfolio') },
      };
    },
  },
  {
    id: 'filing',
    ask: 'ask.qFiling',
    needs: {
      en: ['file', 'filed', 'filing', 'late', 'time', 'submit', 'submitted', 'outstanding', 'overdue', 'missing'],
      af: ['ingedien', 'indien', 'laat', 'tyd', 'uitstaande', 'agterstallig', 'ontbreek'],
      zu: ['hambisa', 'thumela', 'ephuzile', 'isikhathi', 'salele', 'ntula'],
      xh: ['ngenisa', 'thumela', 'emva', 'ixesha', 'salela', 'nqongophala'],
      st: ['romela', 'tlisa', 'morao', 'nako', 'setseng', 'haeo'],
    },
    answer: (f) => {
      const q = f.analytics?.quarters.find((x) => x.periodId === f.analytics?.reviewPeriodId);
      if (!q) return nothing(f);
      const outstanding = (f.portfolio ?? []).filter((r) => {
        const s = (f.submissions ?? []).find((x) => x.entityId === r.entityId && x.periodId === q.periodId);
        return !s || s.status === 'DRAFT';
      });
      return {
        headline: f.t('ask.aFiling', num(q.onTime) ?? '', num(q.expected) ?? '', q.label),
        detail: (
          <>
            <p>
              {f.t('ask.aFilingSplit', num(q.late) ?? '', q.notFiled === null ? '0' : num(q.notFiled) ?? '')}
            </p>
            <p>
              {outstanding.length > 0
                ? f.t('ask.aFilingNothing', names(f, outstanding, 8))
                : f.t('ask.aFilingAllFiled')}
            </p>
          </>
        ),
        source: f.t('ask.sFiling'),
        link: { to: '/review', label: f.t('nav.reviewQueue') },
      };
    },
  },
  {
    id: 'waiting',
    ask: 'ask.qWaiting',
    needs: {
      en: ['waiting', 'queue', 'review', 'approve', 'approval', 'pending', 'awaiting'],
      af: ['wag', 'tou', 'hersien', 'keur', 'goedkeuring', 'hangende'],
      zu: ['lindile', 'ulayini', 'buyekeza', 'gunyaza', 'imvume'],
      xh: ['lindile', 'umgca', 'hlola', 'phumeza', 'imvume'],
      st: ['emetse', 'moleng', 'hlahloba', 'dumella', 'tumello'],
    },
    answer: (f) => {
      const q = f.analytics?.quarters.find((x) => x.periodId === f.analytics?.reviewPeriodId);
      if (!q) return nothing(f);
      return {
        headline: f.t('ask.aWaiting', num(q.awaitingReview) ?? '', q.label),
        detail: (
          <p>
            {f.t(
              'ask.aWaitingSplit',
              num(q.approved) ?? '',
              num(q.returned) ?? '',
              num(q.drafts) ?? '',
            )}
          </p>
        ),
        source: f.t('ask.sWaiting'),
        link: { to: '/review', label: f.t('nav.reviewQueue') },
      };
    },
  },
  {
    id: 'improved',
    ask: 'ask.qImproved',
    needs: {
      en: ['better', 'improv', 'worse', 'trend', 'year', 'progress', 'declin', 'getting'],
      af: ['beter', 'verbeter', 'slegter', 'tendens', 'jaar', 'vordering', 'daal'],
      zu: ['ngcono', 'thuthuka', 'binyelela', 'unyaka', 'inqubekela', 'ehla'],
      xh: ['ngcono', 'phucuka', 'mbi', 'unyaka', 'inkqubela', 'ehla'],
      st: ['betere', 'ntlafala', 'mpe', 'selemo', 'tswelopele', 'theoha'],
    },
    answer: (f) => {
      const c = f.analytics?.cohort;
      if (!c || c.entities === 0) {
        return {
          headline: f.t('ask.aImprovedNone'),
          detail: <p>{f.t('ask.aImprovedNoneDetail')}</p>,
          source: f.t('ask.sAudit'),
          link: { to: '/analytics', label: f.t('nav.analytics') },
        };
      }
      return {
        headline: f.t(
          'ask.aImproved',
          num(c.entities) ?? '',
          percent(c.fromPercent) ?? '',
          c.fromYear,
          percent(c.toPercent) ?? '',
          c.toYear,
        ),
        detail: (
          <p>
            {f.t('ask.aImprovedSplit', num(c.improved) ?? '', num(c.declined) ?? '')}{' '}
            {f.t('ask.aImprovedCohortNote')}
          </p>
        ),
        source: f.t('ask.sAudit'),
        link: { to: '/analytics', label: f.t('nav.analytics') },
      };
    },
  },
  {
    id: 'movers',
    ask: 'ask.qMovers',
    needs: {
      en: ['fell', 'fall', 'drop', 'decline', 'biggest', 'most', 'moved', 'mover', 'slid'],
      af: ['geval', 'val', 'daal', 'grootste', 'meeste', 'beweeg'],
      zu: ['wile', 'wa', 'ehla', 'omkhulu', 'kakhulu', 'nyakaza'],
      xh: ['wile', 'wa', 'ehla', 'nkulu', 'kakhulu', 'shukuma'],
      st: ['wele', 'wa', 'theoha', 'moholo', 'haholo', 'sisinyeha'],
    },
    answer: (f) => {
      const c = f.analytics?.cohort;
      if (!c || c.rows.length === 0) return nothing(f);
      const worst = c.rows[0];
      const best = [...c.rows].sort((a, b) => b.changePoints - a.changePoints)[0];
      return {
        headline: f.t(
          'ask.aMovers',
          worst.name,
          String(Math.abs(Math.round(worst.changePoints))),
          percent(worst.fromPercent) ?? '',
          percent(worst.toPercent) ?? '',
        ),
        detail: (
          <p>
            {best.changePoints > 0
              ? f.t(
                  'ask.aMoversBest',
                  best.name,
                  String(Math.round(best.changePoints)),
                  percent(best.toPercent) ?? '',
                )
              : f.t('ask.aMoversNoneImproved')}
          </p>
        ),
        source: f.t('ask.sMovers'),
        link: { to: '/analytics', label: f.t('nav.analytics') },
      };
    },
  },
  {
    id: 'sector',
    ask: 'ask.qSector',
    needs: {
      en: ['sector', 'arts', 'heritage', 'sport', 'library', 'libraries', 'language', 'compare'],
      af: ['sektor', 'kuns', 'erfenis', 'sport', 'biblioteek', 'taal', 'vergelyk'],
      zu: ['umkhakha', 'ubuciko', 'amagugu', 'ezemidlalo', 'umtapo', 'ulimi', 'qhathanisa'],
      xh: ['icandelo', 'ubugcisa', 'ilifa', 'imidlalo', 'ithala', 'ulwimi', 'thelekisa'],
      st: ['lekala', 'bonono', 'lefa', 'dipapadi', 'laeborari', 'puo', 'bapisa'],
    },
    answer: (f) => {
      const sectors = (f.analytics?.sectors ?? []).filter((s) => s.metPercent !== null);
      if (sectors.length === 0) return nothing(f);
      const sorted = [...sectors].sort((a, b) => (b.metPercent ?? 0) - (a.metPercent ?? 0));
      const top = sorted[0];
      const bottom = sorted[sorted.length - 1];
      return {
        headline: f.t(
          'ask.aSector',
          f.L.sector(top.sector),
          percent(top.metPercent) ?? '',
          f.L.sector(bottom.sector),
          percent(bottom.metPercent) ?? '',
        ),
        detail: <p>{f.t('ask.aSectorNote')}</p>,
        source: f.t('ask.sSector', f.analytics?.reviewPeriodLabel ?? f.t('ask.theQuarter')),
        link: { to: '/analytics', label: f.t('nav.analytics') },
      };
    },
  },
  {
    id: 'audit',
    ask: 'ask.qAudit',
    needs: {
      en: ['audit', 'auditor', 'clean', 'unqualified', 'qualified', 'disclaimer', 'adverse', 'opinion'],
      af: ['oudit', 'ouditeur', 'skoon', 'ongekwalifiseer', 'gekwalifiseer', 'mening'],
      zu: ['ukucwaninga', 'umcwaningi', 'hlanzekile', 'umbono'],
      xh: ['uphicotho', 'umphicothi', 'coceke', 'uluvo'],
      st: ['tlhahlobo', 'mohlahlobi', 'hlwekileng', 'maikutlo'],
    },
    answer: (f) => {
      const years = (f.analytics?.years ?? []).filter((y) => Object.values(y.outcomes).some((n) => n > 0));
      const latest = years.length ? years[years.length - 1] : null;
      if (!latest) return nothing(f);
      const parts = Object.entries(latest.outcomes)
        .filter(([, n]) => n > 0)
        .map(([o, n]) => n + ' ' + f.L.outcome(o).toLowerCase());
      return {
        headline: f.t('ask.aAudit', latest.financialYear, parts.join(', ')),
        detail:
          latest.repeatFindings !== null ? (
            <p>{f.t('ask.aAuditRepeat', num(latest.repeatFindings) ?? '')}</p>
          ) : undefined,
        source: f.t('ask.sAuditBlank'),
        link: { to: '/analytics', label: f.t('nav.analytics') },
      };
    },
  },
  {
    id: 'no-targets',
    ask: 'ask.qNoTargets',
    needs: {
      en: ['target', 'targets', 'plan', 'registered', 'app'],
      af: ['teiken', 'teikens', 'plan', 'geregistreer'],
      zu: ['okuhlosiwe', 'izinhloso', 'uhlelo', 'bhalisiwe'],
      xh: ['ekujoliswe', 'usukelo', 'isicwangciso', 'bhalisiwe'],
      st: ['sepheo', 'dipheo', 'moralo', 'ngodisitswe'],
    },
    answer: (f) => {
      const n = f.analytics?.entitiesWithoutTargets ?? 0;
      return {
        headline: f.t(
          'ask.aNoTargets',
          num(n) ?? '',
          f.analytics?.currentYear ?? f.t('an.thisYear'),
        ),
        detail: <p>{f.t('ask.aNoTargetsNote')}</p>,
        source: f.t('ask.sNoTargets'),
        link: { to: '/entities', label: f.t('nav.entities') },
      };
    },
  },
  {
    id: 'total',
    ask: 'ask.qTotal',
    needs: {
      en: ['total', 'portfolio', 'overall', 'vote', 'transfers'],
      af: ['totaal', 'portefeulje', 'geheel', 'oordragte'],
      zu: ['isamba', 'iphothifoliyo', 'sekonke', 'ukudluliswa'],
      xh: ['isixa', 'iphotifoliyo', 'iyonke', 'udluliselo'],
      st: ['palo', 'photofoliyo', 'kakaretso', 'diphetiso'],
    },
    answer: (f) => {
      if (!f.portfolio) return null;
      const y = (f.analytics?.years ?? []).find((x) => x.current) ?? null;
      return {
        headline: f.t(
          'ask.aTotal',
          randsShort(y?.allocated ?? money(f.portfolio)) ?? f.t('ask.notOnRecord'),
          num(f.portfolio.length) ?? '',
          f.analytics?.currentYear ?? f.t('an.thisYear'),
        ),
        source: f.t('ask.sTotal'),
        link: { to: '/portfolio', label: f.t('nav.portfolio') },
      };
    },
  },
];

/* ------------------------------------------------------------------ */
/* matching                                                            */
/* ------------------------------------------------------------------ */

/**
 * Scores a typed question against each handler, and against every entity by name.
 *
 * Deliberately simple and deliberately visible: it counts matched words. A question that matches
 * nothing gets the list of questions this thing takes, rather than the nearest handler fired at a
 * low score. Answering the wrong question confidently is the failure mode that would cost the
 * product its credibility, so the bar is a match rather than a best guess.
 */
function match(question: string, f: Facts, lang: string): Answer | null {
  const q = question.toLowerCase();
  const words = q.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  if (words.length === 0) return null;

  // An entity asked about by name beats every general question, because somebody typing
  // "how is Iziko doing" wants that entity and nothing else.
  for (const row of f.portfolio ?? []) {
    const hay = (row.name + ' ' + (row.shortName ?? '')).toLowerCase();
    if (!words.some((w) => w.length > 3 && hay.includes(w))) continue;
    const sub = (f.submissions ?? []).find((s) => s.entityId === row.entityId && s.periodId === f.periodId);
    return {
      headline: f.t(
        'ask.aEntity',
        row.name,
        f.L.band(row.band).toLowerCase(),
        row.score !== null ? f.t('ask.aEntityScore', num(row.score) ?? '') : '',
        randsShort(row.totalAllocation) ?? f.t('ask.noAllocationOnRecord'),
      ),
      detail: (
        <>
          <p>
            {sub
              ? f.t(
                  'ask.aEntityPeriod',
                  f.periodLabel ?? f.t('ask.theQuarter'),
                  f.L.status(sub.status).toLowerCase(),
                  num(sub.confirmedCount) ?? '',
                  num(sub.targetCount) ?? '',
                )
              : f.t('ask.aEntityNothingFiled', f.periodLabel ?? f.t('ask.theQuarter'))}
          </p>
          {row.signals.length > 0 ? (
            <p>
              {f.t('ask.aEntitySignal', row.signals[0].description ?? f.L.signal(row.signals[0].type))}
            </p>
          ) : null}
        </>
      ),
      source: f.t('ask.sEntity'),
      link: { to: '/portfolio/entity/' + row.entityId, label: f.t('ask.openEntity', row.name) },
    };
  }

  let best: { handler: Handler; score: number } | null = null;
  for (const h of HANDLERS) {
    // The reader's language plus English, because a bilingual user types whichever comes first.
    const triggers = [...(h.needs[lang] ?? []), ...(lang === 'en' ? [] : h.needs.en)];
    const score = words.filter((w) => triggers.some((n) => w.startsWith(n) || n.startsWith(w))).length;
    if (score > 0 && (!best || score > best.score)) best = { handler: h, score };
  }
  return best ? best.handler.answer(f) : null;
}

/* ------------------------------------------------------------------ */
/* the panel                                                           */
/* ------------------------------------------------------------------ */

export function AskVuka({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const L = useLabels();

  const analytics = useAsync(() => api.analytics(), []);
  const portfolio = useAsync(() => api.portfolio(), []);
  const submissions = useAsync(() => api.submissions(), []);
  const periods = useAsync(() => api.periods(), []);

  const [draft, setDraft] = useState('');
  const [asked, setAsked] = useState<{ question: string; answer: Answer | null } | null>(null);
  const box = useRef<HTMLInputElement>(null);

  const period = useMemo(() => reviewPeriod(periods.data), [periods.data]);

  const facts: Facts = {
    analytics: analytics.data,
    portfolio: portfolio.data,
    submissions: submissions.data,
    periodId: period?.periodId ?? null,
    periodLabel: period?.label ?? null,
    t,
    L,
  };

  const loading = analytics.loading || portfolio.loading;

  function ask(question: string) {
    setDraft(question);
    setAsked({ question, answer: match(question, facts, lang) });
    box.current?.focus();
  }

  return (
    <div className="panel-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="panel panel-narrow ask" role="dialog" aria-modal="true" aria-labelledby="ask-title">
        <div className="panel-head">
          <h2 id="ask-title">
            <IconHelp size={18} /> {t('ask.open')}
          </h2>
          <span className="spacer" />
          <button type="button" className="panel-close" onClick={onClose}>
            <IconX size={18} />
            <span className="visually-hidden">{t('common.close')}</span>
          </button>
        </div>

        <div className="panel-body ask-body">
          <p className="small muted ask-what">{t('ask.what')}</p>

          <form
            className="ask-form"
            onSubmit={(e) => {
              e.preventDefault();
              const q = draft.trim();
              if (q !== '') setAsked({ question: q, answer: match(q, facts, lang) });
            }}
          >
            <label htmlFor="ask-box" className="visually-hidden">{t('ask.yourQuestion')}</label>
            <input
              id="ask-box"
              ref={box}
              type="text"
              autoComplete="off"
              placeholder={t('ask.qRisk')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="primary" disabled={loading || draft.trim() === ''}>
              {loading ? <IconSpinner size={16} className="spin" /> : <IconSend size={16} />}
              <span className="visually-hidden">{t('ask.submit')}</span>
            </button>
          </form>

          {loading ? (
            <p className="small muted">{t('ask.reading')}</p>
          ) : asked === null ? (
            <Suggestions onPick={ask} />
          ) : asked.answer === null ? (
            <>
              <div className="ask-answer ask-nomatch">
                <p>{t('ask.noMatch')}</p>
              </div>
              <Suggestions onPick={ask} />
            </>
          ) : (
            <>
              <div className="ask-answer">
                <p className="ask-headline">{asked.answer.headline}</p>
                {asked.answer.detail ? <div className="ask-detail">{asked.answer.detail}</div> : null}
                <p className="ask-source">
                  <IconCitation size={14} />
                  <span>{asked.answer.source}</span>
                </p>
                {asked.answer.link ? (
                  <Link className="btn" to={asked.answer.link.to} onClick={onClose}>
                    {asked.answer.link.label} <IconChevronRight size={16} />
                  </Link>
                ) : null}
              </div>
              <Suggestions onPick={ask} heading={t('ask.askSomethingElse')} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Suggestions({ onPick, heading }: { onPick: (q: string) => void; heading?: string }) {
  const { t } = useI18n();
  return (
    <div className="ask-suggest">
      <p className="small muted">{heading ?? t('ask.canTake')}</p>
      <ul>
        {HANDLERS.map((h) => (
          <li key={h.id}>
            <button type="button" onClick={() => onPick(t(h.ask))}>
              {t(h.ask)}
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => onPick(t('ask.qEntityExample'))}>
            {t('ask.orNameEntity')}
          </button>
        </li>
      </ul>
    </div>
  );
}
