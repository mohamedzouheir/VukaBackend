/*
 * Ask Karabo.
 *
 * Karabo is "answer" in Sesotho, which is the whole of the idea: a person asks a question in
 * ordinary words and gets the figure with its provenance attached, rather than learning where in
 * the interface that figure lives.
 *
 * <h2>What answers, and with whose access</h2>
 *
 * The panel posts to /api/chat and nothing else. The model, its key and its tools are all on the
 * server. There, a question from someone signed in runs with their own access, so a reporter
 * cannot learn about another entity by asking nicely, and a question from the landing page reaches
 * only what the Department has published. The panel does not decide any of that and could not:
 * it only shows what came back.
 *
 * <h2>Sources come from the server, not from the reply</h2>
 *
 * Under an answer the panel lists what the server actually read to produce it. Those are gathered
 * from the tools that ran, so a model cannot put a citation under an answer that it did not
 * read. An answer with no source listed is one the record did not support, and it reads that way.
 *
 * <h2>When it is not connected</h2>
 *
 * Where no model is configured the panel says so before anyone types, and the composer is off.
 * It never falls back to a canned figure. A product whose claim is that a number carries the cell
 * it came from cannot demonstrate itself with invented numbers.
 */
import { useEffect, useRef, useState } from 'react';
import { IconComment, IconSend, IconSpinner, IconX } from '../icons';
import { useI18n } from '../lib/i18n';
import type { Key } from '../lib/i18n';
import { api, KaraboError } from '../lib/api';
import type { KaraboFailure, KaraboSource, KaraboStatus, KaraboTurn } from '../lib/api';
import './AskKarabo.css';

interface Message {
  id: number;
  from: 'karabo' | 'you';
  /* Karabo's fixed lines are keys, so they follow the chosen language. What the reader typed and
     what the model answered are text: neither is ours to translate after the fact. */
  textKey?: Key;
  text?: string;
  sources?: KaraboSource[];
  /** A failure line, shown but never sent back to the model as part of the conversation. */
  error?: boolean;
}

/**
 * The same four questions for everyone, signed in or not. What each person gets back still
 * follows their own account: a visitor asking about a risk score is told it is for staff who
 * sign in, rather than being shown it. The questions are the same; the access is not.
 */
const QUESTIONS: Key[] = ['karabo.q1', 'karabo.q2', 'karabo.q3', 'karabo.q4'];

const FAILURE: Record<KaraboFailure, Key> = {
  NOT_CONFIGURED: 'karabo.errNotConfigured',
  SIGN_IN_REQUIRED: 'karabo.errSignIn',
  RATE_LIMITED: 'karabo.errRate',
  INVALID: 'karabo.errInvalid',
  FILTERED: 'karabo.errFiltered',
  TIMEOUT: 'karabo.errTimeout',
  PROVIDER: 'karabo.errProvider',
  OFFLINE: 'karabo.errOffline',
};

/** Earlier turns sent with each question, so "and last year?" can be understood. */
const HISTORY_TURNS = 8;

const OPEN_EVENT = 'vuka:karabo-open';

/**
 * Opens the docked panel from anywhere on the page, such as the ask button on Portfolio and
 * Analytics. There is one Karabo per page, mounted by the shell, so a screen asks it to open
 * rather than mounting a second one.
 */
export function openKarabo() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function AskKarabo() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<KaraboStatus | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);

  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  // Asked once, on first opening, rather than on every page load: most readers never open the
  // panel, and they should not pay a request for it.
  useEffect(() => {
    if (!open || status !== null) return;
    api.karaboStatus()
      .then(setStatus)
      .catch(() => setStatus({ configured: false, available: false, signedIn: false }));
  }, [open, status]);

  // Escape closes, and focus goes back to the button that opened it rather than to the page top.
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        opener.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, thinking]);

  /* Karabo is docked, not floating: the page gives up a strip on the right for the tab, and the
     whole panel's width while it is open, so it never sits on top of a table or a button. The
     classes go on the root so the page's own layout does not have to know Karabo exists. */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('karabo-docked');
    return () => root.classList.remove('karabo-docked', 'karabo-dock-open');
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('karabo-dock-open', open);
  }, [open]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const ready = status?.available === true;
  const staff = status?.signedIn === true;

  const opening: Message[] = [
    { id: 1, from: 'karabo', textKey: 'karabo.greeting' },
    {
      id: 2,
      from: 'karabo',
      textKey: status === null
        ? 'karabo.checking'
        : !status.configured
          ? 'karabo.introOff'
          : !status.available
            ? 'karabo.errSignIn'
            : staff
              ? 'karabo.introStaff'
              : 'karabo.introPublic',
    },
  ];

  async function send(text: string) {
    const question = text.trim();
    if (question === '' || thinking || !ready) return;

    // The conversation so far, as the model saw it: questions and real answers, no failures and
    // none of the fixed lines above.
    const history: KaraboTurn[] = messages
      .filter((m) => !m.error && m.text !== undefined)
      .map((m): KaraboTurn => ({ role: m.from === 'you' ? 'user' : 'assistant', content: m.text as string }))
      .slice(-HISTORY_TURNS);

    setMessages((m) => [...m, { id: Date.now(), from: 'you', text: question }]);
    setDraft('');
    setThinking(true);

    try {
      const reply = await api.askKarabo(question, history, lang);
      setMessages((m) => [
        ...m,
        reply.reply.trim() === ''
          ? { id: Date.now() + 1, from: 'karabo', textKey: 'karabo.empty', error: true }
          : { id: Date.now() + 1, from: 'karabo', text: reply.reply, sources: reply.sources },
      ]);
    } catch (e) {
      const code: KaraboFailure = e instanceof KaraboError ? e.code : 'PROVIDER';
      setMessages((m) => [...m, { id: Date.now() + 1, from: 'karabo', textKey: FAILURE[code], error: true }]);
    } finally {
      setThinking(false);
      input.current?.focus();
    }
  }

  const thread = [...opening, ...messages];

  return (
    <>
      {/* The strip on the right edge. Always visible, always in its own space. */}
      <div className={'karabo-dock' + (open ? ' karabo-dock-hidden' : '')}>
        <button
          type="button"
          ref={opener}
          className="karabo-tab"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="karabo-panel"
          tabIndex={open ? -1 : 0}
        >
          <span className="karabo-tab-avatar" aria-hidden="true">K</span>
          <IconComment size={18} />
          <span className="karabo-tab-label">{t('karabo.ask')}</span>
        </button>
      </div>

      <div
        id="karabo-panel"
        className={'karabo' + (open ? ' karabo-open' : '')}
        role="dialog"
        aria-modal="false"
        aria-label={t('karabo.ask')}
        aria-hidden={!open}
      >
        <header className="karabo-head">
          <span className="karabo-avatar" aria-hidden="true">K</span>
          <div className="karabo-who">
            <strong>Karabo</strong>
            <span>{t('karabo.subtitle')}</span>
          </div>
          <button
            type="button"
            className="karabo-close"
            onClick={() => {
              setOpen(false);
              opener.current?.focus();
            }}
            aria-label={t('common.close')}
          >
            <IconX size={18} />
          </button>
        </header>

        <div className="karabo-thread" aria-live="polite">
          {thread.map((m) => (
            <div key={m.id} className={'karabo-msg karabo-msg-' + m.from}>
              <div className={'karabo-bubble' + (m.error ? ' karabo-bubble-error' : '') + (m.text && m.from === 'karabo' ? ' karabo-answer' : '')}>
                {m.textKey ? t(m.textKey) : m.text}
                {m.sources && m.sources.length > 0 ? (
                  <div className="karabo-source">
                    <span className="karabo-source-head">{t('karabo.sourcesLabel')}</span>
                    <ul>
                      {m.sources.map((s) => (
                        <li key={s.label + s.reference}>
                          <strong>{s.label}</strong>: {s.reference}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {thinking ? (
            <div className="karabo-msg karabo-msg-karabo">
              <div className="karabo-bubble karabo-thinking">
                <IconSpinner size={15} className="spin" />
                {t('karabo.thinking')}
              </div>
            </div>
          ) : null}

          <div ref={end} />
        </div>

        {ready && messages.length === 0 ? (
          <div className="karabo-suggestions">
            <p>{t('karabo.trySome')}</p>
            {QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                className="karabo-chip"
                disabled={thinking}
                onClick={() => void send(t(q))}
              >
                {t(q)}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="karabo-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <label className="visually-hidden" htmlFor="karabo-input">
            {t('karabo.ask')}
          </label>
          <textarea
            id="karabo-input"
            ref={input}
            rows={1}
            value={draft}
            maxLength={1000}
            disabled={!ready}
            placeholder={t('karabo.placeholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, shift and enter makes a new line, which is what people expect of a
              // chat box and not of a textarea.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
          />
          <button type="submit" className="primary karabo-send" disabled={!ready || draft.trim() === '' || thinking}>
            {thinking ? <IconSpinner size={16} className="spin" /> : <IconSend size={16} />}
            <span className="visually-hidden">{t('comment.send')}</span>
          </button>
        </form>

        <p className="karabo-foot">{status?.configured ? t('karabo.footLive') : t('karabo.footOff')}</p>
      </div>
    </>
  );
}
