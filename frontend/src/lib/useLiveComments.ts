/*
 * Live comments for one submission.
 *
 * Requirement (d) asks for comments "visible on screen in real time". This asks the server every
 * five seconds whether anything was said, sending back the validator from the last answer, and
 * the server says 304 with no body until something was. At that cadence the difference from a
 * socket is not visible to a person, and a socket is the part of a demo that fails on conference
 * wifi.
 *
 * Two details that matter more than they look:
 *
 *   A hidden tab does not poll. A reviewer with thirty submissions open in thirty tabs would
 *   otherwise be thirty pollers, and the one they return to catches up at once.
 *
 *   The announcement is a sentence, not the list. A live region round the list would make a
 *   screen reader read every comment again each time one arrived.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { CommentView } from './types';

export const POLL_MS = 5000;

export interface LiveComments {
  /** Null until the first answer arrives. Newest first, as the server sends them. */
  comments: CommentView[] | null;
  /** Open disputes by target id, newest first wins. The same rule as the backend. */
  disputes: Map<string, string>;
  /** One sentence for a status region, or empty. */
  announcement: string;
  /** Poll now rather than in up to five seconds, for use straight after posting. */
  refresh: () => void;
}

/**
 * Mirrors ReportingViewService.isOpenDispute. Change both.
 *
 * A dispute opened a thread on a target, was written by a DSAC role, and is still open. A
 * reporter's reply saying "corrected" is not a dispute, and a closed one is history.
 */
export function isOpenDispute(c: CommentView): boolean {
  return (
    c.anchorType === 'TARGET' &&
    c.anchorId !== null &&
    c.parentId === null &&
    !c.resolved &&
    c.authorRole !== null &&
    c.authorRole !== 'ENTITY_REPORTER'
  );
}

export function useLiveComments(submissionId: string | undefined): LiveComments {
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const etag = useRef<string | null>(null);
  const seen = useRef<number | null>(null);
  const stopped = useRef(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!submissionId) return;
    etag.current = null;
    seen.current = null;
    stopped.current = false;
    let cancelled = false;

    async function poll() {
      if (cancelled || stopped.current) return;
      if (document.visibilityState === 'hidden') return;
      try {
        const answer = await api.commentsSince(submissionId!, etag.current);
        if (cancelled || !answer.changed) return;
        etag.current = answer.etag;
        const count = answer.comments.length;
        if (seen.current !== null) {
          const added = count - seen.current;
          setAnnouncement(
            added > 1 ? added + ' new comments.' : added === 1 ? 'One new comment.' : 'Comments updated.',
          );
        }
        seen.current = count;
        setComments(answer.comments);
      } catch (e) {
        // Signed out or no longer theirs: polling again cannot help. Anything else is a
        // dropped connection, and the comments on screen are still the last good answer.
        if (e instanceof ApiError && (e.status === 401 || e.notFound)) stopped.current = true;
      }
    }

    poll();
    const timer = window.setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [submissionId, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const disputes = useMemo(() => {
    const out = new Map<string, string>();
    for (const c of comments ?? []) {
      if (isOpenDispute(c) && !out.has(c.anchorId!)) out.set(c.anchorId!, c.body);
    }
    return out;
  }, [comments]);

  return { comments, disputes, announcement, refresh };
}
