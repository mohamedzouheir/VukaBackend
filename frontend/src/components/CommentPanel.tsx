/*
 * CommentPanel. The conversation about a submission's figures, live.
 *
 * A tenth component beside the nine in section 10 of the frontend design. It exists because the
 * dispute note on a row says what DSAC objected to and nothing else: the entity's answer, and
 * anything said after it, had nowhere to appear on this surface.
 *
 * Threads are grouped by the figure they are about, never shown as one stream. That is the point
 * of anchoring, and a chronological stream would throw it away on screen after the schema kept it.
 */
import { useMemo, useState } from 'react';
import type { CommentView } from '../lib/types';
import { dateTime } from '../lib/format';
import { IconComment } from '../icons';
import './components.css';

interface Props {
  comments: CommentView[] | null;
  /** The figures on this screen, in screen order. Threads about anything else are not shown here. */
  targets: { targetId: string; indicatorRef: string; indicator: string }[];
  announcement: string;
  onReply: (targetId: string, parentId: string, body: string) => Promise<boolean>;
}

function roleWord(role: string | null): string {
  switch (role) {
    case 'ENTITY_REPORTER': return 'entity';
    case 'DSAC_REVIEWER': return 'DSAC review';
    case 'DSAC_EXECUTIVE': return 'DSAC';
    case 'ADMIN': return 'administrator';
    default: return '';
  }
}

export function CommentPanel({ comments, targets, announcement, onReply }: Props) {
  const threads = useMemo(() => {
    const onScreen = new Set(targets.map((t) => t.targetId));
    // The server sends newest first. A conversation reads oldest first.
    const ordered = [...(comments ?? [])]
      .filter((c) => c.anchorType === 'TARGET' && c.anchorId !== null && onScreen.has(c.anchorId))
      .reverse();
    const byTarget = new Map<string, { root: CommentView; replies: CommentView[] }[]>();
    const rootOf = new Map<string, { root: CommentView; replies: CommentView[] }>();
    for (const c of ordered) {
      if (c.parentId === null) {
        const t = { root: c, replies: [] as CommentView[] };
        rootOf.set(c.commentId, t);
        byTarget.set(c.anchorId!, [...(byTarget.get(c.anchorId!) ?? []), t]);
      }
    }
    for (const c of ordered) {
      if (c.parentId !== null) rootOf.get(c.parentId)?.replies.push(c);
    }
    return targets
      .filter((t) => byTarget.has(t.targetId))
      .map((t) => ({ target: t, threads: byTarget.get(t.targetId)! }));
  }, [comments, targets]);

  return (
    <div className="card cp">
      <h2>
        <IconComment size={16} /> Comments on these figures
      </h2>
      <p className="cp-live small muted" role="status">{announcement}</p>

      {comments === null ? (
        <p className="small muted">Loading the conversation.</p>
      ) : threads.length === 0 ? (
        <p className="small muted">
          Nothing has been said about these figures. A dispute raised by the Department appears
          here, and against the figure itself, without reloading the page.
        </p>
      ) : (
        threads.map(({ target, threads: ts }) => (
          <section key={target.targetId} className="cp-target">
            <h3>
              <span className="mono">{target.indicatorRef}</span> {target.indicator}
            </h3>
            {ts.map(({ root, replies }) => (
              <Thread key={root.commentId} root={root} replies={replies}
                      onReply={(body) => onReply(target.targetId, root.commentId, body)} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function Line({ c, reply }: { c: CommentView; reply?: boolean }) {
  return (
    <li className={'cp-line' + (reply ? ' cp-reply' : '')}>
      <p className="cp-who small">
        <strong>{c.authorName ?? 'Unknown'}</strong>
        {roleWord(c.authorRole) ? <span className="muted"> · {roleWord(c.authorRole)}</span> : null}
        <span className="muted"> · {dateTime(c.createdAt)}</span>
      </p>
      <p className="cp-body">{c.body}</p>
    </li>
  );
}

function Thread({ root, replies, onReply }: {
  root: CommentView;
  replies: CommentView[];
  onReply: (body: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const id = 'reply-' + root.commentId;

  return (
    <div className={'cp-thread' + (root.resolved ? ' cp-closed' : '')}>
      <ul>
        <Line c={root} />
        {replies.map((r) => <Line key={r.commentId} c={r} reply />)}
      </ul>
      {root.resolved ? (
        <p className="small muted">Closed.</p>
      ) : (
        <form
          className="cp-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (draft.trim() === '') return;
            setSending(true);
            const ok = await onReply(draft.trim());
            setSending(false);
            if (ok) setDraft('');
          }}
        >
          <label htmlFor={id} className="small">Reply</label>
          <textarea id={id} rows={2} maxLength={4000} value={draft}
                    onChange={(e) => setDraft(e.target.value)} disabled={sending} />
          <button type="submit" disabled={sending || draft.trim() === ''}>
            {sending ? 'Sending' : 'Send reply'}
          </button>
        </form>
      )}
    </div>
  );
}
