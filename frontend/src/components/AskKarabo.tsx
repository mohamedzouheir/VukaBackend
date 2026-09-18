/*
 * Ask Karabo. The assistant panel, design only.
 *
 * Karabo is "answer" in Sesotho, which is the whole of the idea: a person asks a question in
 * ordinary words and gets the figure with its provenance attached, rather than learning where in
 * the interface that figure lives.
 *
 * <h2>Nothing here is connected, and the panel says so</h2>
 *
 * There is no model, no endpoint and no retrieval. What this demonstrates is the shape: how the
 * panel opens, what a thread looks like, what the suggested questions are, and where a citation
 * sits in an answer.
 *
 * The part worth being careful about is the transcript. It would be easy, and it would demo
 * better, to seed this with answers full of plausible figures. Every one of them would be
 * invented, in a product whose whole claim is that a number carries the cell it came from. So
 * Karabo's opening message explains what it will do, the suggested questions are real questions
 * the data could answer, and anything sent gets an honest reply naming the endpoint that would
 * answer it once a model is wired. No figure appears in this component that is not labelled as
 * an example of a shape.
 *
 * <h2>What wiring it would take</h2>
 *
 * The answers this is designed for are all already served by the API: the portfolio and its
 * signals, an entity's chain, unit cost, the audit trail. A model would need retrieval over
 * those endpoints rather than over the database directly, so that a reply cannot say anything
 * the caller's own token would not have let them read. That is the part to get right, and it is
 * an access control question rather than a model question.
 */
import { useEffect, useRef, useState } from 'react';
import { IconComment, IconSend, IconSpinner, IconX } from '../icons';
import { useI18n } from '../lib/i18n';
import type { Key } from '../lib/i18n';
import './AskKarabo.css';

interface Message {
  id: number;
  from: 'karabo' | 'you';
  /* Karabo's own lines are keys, so the thread is rebuilt in the chosen language rather than
     frozen in the one the panel was opened in. A question the person typed is carried as text,
     because their own words are not ours to translate back at them. */
  textKey?: Key;
  text?: string;
  /** Where the answer would have come from. Shown as the citation line an answer must carry. */
  sourceKey?: Key;
}

const SUGGESTIONS: { q: Key; reply: Reply }[] = [
  { q: 'karabo.q1', reply: { text: 'karabo.aLate', source: 'karabo.sLate' } },
  { q: 'karabo.q2', reply: { text: 'karabo.aMoney', source: 'karabo.sMoney' } },
  { q: 'karabo.q3', reply: { text: 'karabo.aRisk', source: 'karabo.sRisk' } },
  { q: 'karabo.q4', reply: { text: 'karabo.aEvidence', source: 'karabo.sEvidence' } },
];

interface Reply {
  text: Key;
  source: Key;
}

/** The opening thread. It describes the idea rather than performing it. */
const OPENING: Message[] = [
  { id: 1, from: 'karabo', textKey: 'karabo.greeting' },
  { id: 2, from: 'karabo', textKey: 'karabo.disclaimer' },
];

export function AskKarabo() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(OPENING);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);

  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

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

  function send(text: string, known?: Reply) {
    const question = text.trim();
    if (question === '' || thinking) return;

    const asked: Message = { id: Date.now(), from: 'you', text: question };
    setMessages((m) => [...m, asked]);
    setDraft('');
    setThinking(true);

    // A pause, so the panel can be walked through as it would behave. No request is made.
    window.setTimeout(() => {
      const reply = known ?? answerFor(question);
      setThinking(false);
      setMessages((m) => [
        ...m,
        { id: Date.now() + 1, from: 'karabo', textKey: reply.text, sourceKey: reply.source },
      ]);
    }, 700);
  }

  return (
    <>
      <button
        type="button"
        ref={opener}
        className={'karabo-fab' + (open ? ' karabo-fab-open' : '')}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="karabo-panel"
      >
        <span className="karabo-fab-icon">
          {open ? <IconX size={22} /> : <IconComment size={22} />}
        </span>
        {/* The label is in the flow rather than a title attribute, so it is reachable by
            keyboard and readable by a screen reader instead of appearing only on hover. */}
        <span className="karabo-fab-label">{t('karabo.ask')}</span>
      </button>

      <div
        id="karabo-panel"
        className={'karabo' + (open ? ' karabo-open' : '')}
        role="dialog"
        aria-modal="false"
        aria-label={t('karabo.ask')}
        aria-hidden={!open}
        ref={panel}
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
          {messages.map((m) => (
            <div key={m.id} className={'karabo-msg karabo-msg-' + m.from}>
              <div className="karabo-bubble">
                {m.textKey ? t(m.textKey) : m.text}
                {m.sourceKey ? <span className="karabo-source">{t(m.sourceKey)}</span> : null}
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

        {messages.length <= OPENING.length ? (
          <div className="karabo-suggestions">
            <p>{t('karabo.trySome')}</p>
            {SUGGESTIONS.map((sug) => (
              <button
                key={sug.q}
                type="button"
                className="karabo-chip"
                onClick={() => send(t(sug.q), sug.reply)}
              >
                {t(sug.q)}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="karabo-composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
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
            placeholder={t('karabo.placeholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, shift and enter makes a new line, which is what people expect of a
              // chat box and not of a textarea.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
          />
          <button type="submit" className="primary karabo-send" disabled={draft.trim() === '' || thinking}>
            <IconSend size={16} />
            <span className="visually-hidden">{t('comment.send')}</span>
          </button>
        </form>

        <p className="karabo-foot">{t('karabo.notConnected')}</p>
      </div>
    </>
  );
}

/**
 * What Karabo says back.
 *
 * Deliberately not an answer. Each reply names the record that would answer the question, which
 * demonstrates the one thing that matters about this feature: an answer carries its source. A
 * canned figure would demonstrate the opposite.
 */
function answerFor(question: string): Reply {
  const q = question.toLowerCase();

  if (q.includes('late') || q.includes('deadline') || q.includes('overdue')) {
    return { text: 'karabo.aLate', source: 'karabo.sLate' };
  }
  if (q.includes('allocat') || q.includes('budget') || q.includes('rand') || q.includes('r ')) {
    return { text: 'karabo.aMoney', source: 'karabo.sMoney' };
  }
  if (q.includes('why') || q.includes('score') || q.includes('critical') || q.includes('risk')) {
    return { text: 'karabo.aRisk', source: 'karabo.sRisk' };
  }
  if (q.includes('evidence') || q.includes('unverifi') || q.includes('proof')) {
    return { text: 'karabo.aEvidence', source: 'karabo.sEvidence' };
  }

  return { text: 'karabo.aFallback', source: 'karabo.sFallback' };
}
