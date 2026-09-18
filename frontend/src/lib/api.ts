/*
 * The API client.
 *
 * One rule encoded here and nowhere else: a 403 and a 404 are both reported as "not
 * found". Section 10 of the frontend design is explicit that denied is never an error,
 * because telling a caller that a record exists but is not theirs is itself a disclosure
 * about another entity. ExportController already behaves this way on the backend and the
 * frontend has to match it rather than helpfully explaining.
 */
import type {
  ChainView, CommentView, EntityDetail, ExtractionView, IndicatorRowView, MeView,
  ParseReport, PeerComparison, PeriodView, PortfolioRow, SubmissionDetail, SubmissionRow,
  UnitCostView,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** True where the caller may not see this record, or it does not exist. Same thing. */
    readonly notFound = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type TokenSource = () => Promise<string | null>;

let getToken: TokenSource = async () => null;

/** Wired once at startup by the auth provider. */
export function setTokenSource(source: TokenSource) {
  getToken = source;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', 'Bearer ' + token);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    // A network failure is not a permission problem and must not read like one.
    throw new ApiError(0, 'Could not reach the server. Check that the backend is running.');
  }

  if (res.status === 401) {
    throw new ApiError(401, 'Your session has expired. Sign in again.');
  }
  if (res.status === 403 || res.status === 404) {
    throw new ApiError(res.status, 'Not found.', true);
  }
  if (!res.ok) throw new ApiError(res.status, await failureMessage(res));
  if (res.status === 204) return undefined as T;

  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return (await res.text()) as unknown as T;
  return (await res.json()) as T;
}

/**
 * A sentence a person can act on. The backend answers a refused action with a JSON message
 * written for the screen, so that is shown as it is. Anything else, a server fault in
 * particular, is never shown raw: a stack trace or a JSON body on screen reads as a broken
 * product and tells the user nothing about what to do next.
 */
async function failureMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const body = JSON.parse(text) as { message?: unknown };
    if (res.status < 500 && typeof body.message === 'string' && body.message.trim() !== '') {
      return body.message;
    }
  } catch {
    // Not JSON. Fall through to the plain sentence.
  }
  return res.status >= 500
    ? 'Something went wrong on the server and nothing was changed by this request. Try again, and if it keeps happening tell the Department.'
    : 'The request was refused (' + res.status + ').';
}

/**
 * The click handler for a link to a stored file. The link keeps a real href so it still reads
 * and behaves as a link to assistive technology, but the click fetches with the token.
 */
export function openFile(e: { preventDefault: () => void }, url: string, name: string) {
  e.preventDefault();
  api.download(url, name).catch((err: unknown) => {
    window.alert(err instanceof Error ? err.message : 'The file could not be opened.');
  });
}

/** One answer to the comment poll: either nothing moved, or here is the whole list again. */
export type LivePoll =
  | { changed: false }
  | { changed: true; etag: string | null; comments: CommentView[] };

function qs(params: Record<string, string | number | undefined | null>) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') out.set(k, String(v));
  }
  const s = out.toString();
  return s ? '?' + s : '';
}

export const api = {
  /* ---------- identity ---------- */

  me: () => request<MeView>('/api/me'),

  /* ---------- periods ---------- */

  periods: () => request<PeriodView[]>('/api/periods'),

  /* ---------- oversight ---------- */

  portfolio: (periodId?: string) =>
    request<PortfolioRow[]>('/api/dashboard/portfolio' + qs({ periodId })),

  entity: (entityId: string, periodId?: string) =>
    request<EntityDetail>('/api/dashboard/entity/' + entityId + qs({ periodId })),

  peers: (entityId: string) =>
    request<PeerComparison>('/api/dashboard/entity/' + entityId + '/peers'),

  chain: (entityId: string, periodId?: string) =>
    request<ChainView>('/api/dashboard/entity/' + entityId + '/chain' + qs({ periodId })),

  unitCost: (entityId: string, targetId?: string) =>
    request<UnitCostView[]>('/api/dashboard/entity/' + entityId + '/unit-cost' + qs({ targetId })),

  recompute: (periodId?: string) =>
    request<{ computed: number }>('/api/dashboard/recompute' + qs({ periodId }), { method: 'POST' }),

  /* ---------- submissions ---------- */

  submissions: (params: { entityId?: string; periodId?: string; status?: string } = {}) =>
    request<SubmissionRow[]>('/api/submissions' + qs(params)),

  submission: (submissionId: string) =>
    request<SubmissionDetail>('/api/submissions/' + submissionId),

  openSubmission: (entityId: string, periodId: string, channel = 'WEB') =>
    request<{ submissionId: string; status: string }>('/api/submissions/open', {
      method: 'POST',
      body: JSON.stringify({ entityId, periodId, channel }),
    }),

  uploadTemplate: (submissionId: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<ParseReport>('/api/submissions/' + submissionId + '/upload', {
      method: 'POST',
      body,
    });
  },

  extractions: (submissionId: string) =>
    request<ExtractionView[]>('/api/submissions/' + submissionId + '/extractions'),

  rows: (submissionId: string) =>
    request<IndicatorRowView[]>('/api/submissions/' + submissionId + '/rows'),

  confirm: (
    submissionId: string,
    rows: {
      targetId: string;
      actualValue: number | null;
      spendToDate?: number | null;
      varianceExplanation?: string | null;
    }[],
  ) =>
    request<{ confirmed: number; by: string }>('/api/submissions/' + submissionId + '/confirm', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }),

  submit: (submissionId: string) =>
    request<unknown>('/api/submissions/' + submissionId + '/submit', { method: 'POST' }),

  review: (submissionId: string, approve: boolean, returnReason?: string) =>
    request<unknown>('/api/submissions/' + submissionId + '/review', {
      method: 'POST',
      body: JSON.stringify({ approve, returnReason: returnReason ?? null }),
    }),

  /* ---------- evidence ---------- */

  attachEvidence: (submissionId: string, targetId: string, file: File, criteria: string[]) => {
    const body = new FormData();
    body.append('file', file);
    body.append('targetId', targetId);
    for (const c of criteria) body.append('agsaCriteria', c);
    return request<{ documentId: string }>('/api/submissions/' + submissionId + '/evidence', {
      method: 'POST',
      body,
    });
  },

  /** Opens the stored source document. */
  /** The file itself. Takes a document id or an extraction id, and needs the token: open it with download. */
  documentUrl: (documentId: string) => '/api/documents/' + documentId + '/content',

  /* ---------- comments, the per target dispute trail ---------- */

  comments: (submissionId: string) =>
    request<CommentView[]>('/api/submissions/' + submissionId + '/comments'),

  /**
   * A comment against one figure. The backend refuses one with no target: a comment on the
   * whole filing tells the entity nothing it can correct.
   */
  addComment: (submissionId: string, body: string, targetId: string, parentId?: string) =>
    request<CommentView>('/api/submissions/' + submissionId + '/comments', {
      method: 'POST',
      body: JSON.stringify({ body, targetId, parentId: parentId ?? null }),
    }),

  /**
   * The poll behind live comments. Sends back the validator from the last answer, and the server
   * replies 304 with no body until something has been said, so a screen left open all afternoon
   * costs one set of headers every five seconds.
   *
   * Outside `request` because a 304 is the expected answer here rather than a failure, and
   * `request` treats anything that is not 2xx as an error.
   */
  commentsSince: async (submissionId: string, etag: string | null): Promise<LivePoll> => {
    const token = await getToken();
    const headers = new Headers();
    if (token) headers.set('Authorization', 'Bearer ' + token);
    if (etag) headers.set('If-None-Match', etag);

    const res = await fetch('/api/submissions/' + submissionId + '/comments', { headers });
    if (res.status === 304) return { changed: false };
    if (res.status === 401) throw new ApiError(401, 'Your session has expired. Sign in again.');
    if (res.status === 403 || res.status === 404) throw new ApiError(res.status, 'Not found.', true);
    if (!res.ok) throw new ApiError(res.status, 'Comments could not be refreshed.');
    return {
      changed: true,
      etag: res.headers.get('ETag'),
      comments: (await res.json()) as CommentView[],
    };
  },

  /* ---------- export ---------- */

  exportUrl: (submissionId: string, shape: 'full.csv' | 'eqprs.csv' | 'json') =>
    '/api/export/submission/' + submissionId + '/' + shape,

  /**
   * Every file the office surface hands over goes through here, so the bearer token travels with
   * it. A plain link cannot carry the token, and one that tried landed the user on a JSON 401.
   */
  download: async (url: string, fallbackName: string) => {
    const token = await getToken();
    const res = await fetch(url, {
      headers: token ? { Authorization: 'Bearer ' + token } : undefined,
    });
    if (!res.ok) {
      throw new ApiError(res.status, res.status === 403 || res.status === 404
        ? 'That file could not be found.'
        : await failureMessage(res));
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = match ? match[1] : fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked a moment later rather than at once: some browsers read the URL after click returns.
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  /* ---------- template ---------- */

  templateUrl: (entityId: string, periodId: string) =>
    '/api/submissions/template' + qs({ entityId, periodId }),

  /* ---------- administration ---------- */

  setPublished: (entityId: string, publiclyVisible: boolean) =>
    request<{ entityId: string; publiclyVisible: boolean }>(
      '/api/admin/entities/' + entityId + '/publication',
      { method: 'POST', body: JSON.stringify({ publiclyVisible }) },
    ),

  adminEntities: () =>
    request<
      { entityId: string; name: string; sector: string; publiclyVisible: boolean; targetCount: number }[]
    >('/api/admin/entities'),
};
