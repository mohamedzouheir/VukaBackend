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
  AuditPage, UnitCostView, WorkspaceDocument, WorkspaceTask, TaskPerson, NewTask, AdminEntityRow,
  IssuedReporter, AnalyticsView,
} from './types';
import { copyOf, enqueue, keep, reachable, registerSender, type Queued } from './offline';

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
  const read = (init.method ?? 'GET') === 'GET';
  try {
    const value = await network<T>(path, init);
    if (read) void keep(path, value);
    return value;
  } catch (e) {
    // No answer at all, as distinct from an answer that said no. Only then is a kept copy
    // offered, and only this person's: see offline.ts.
    if (read && e instanceof ApiError && e.status === 0) {
      const copy = await copyOf<T>(path);
      if (copy !== null) return copy;
    }
    throw e;
  }
}

/**
 * A change that is safe to send late. Sent now where the network answers; kept in the outbox
 * where it does not, which resolves as Queued rather than throwing, so a sequence of changes (a
 * reviewer's disputes and then the return) is kept whole and in order rather than cut off after
 * the first. The outbox bar says what is waiting. See offline.ts for which changes qualify.
 */
async function change<T>(description: string, path: string, init: RequestInit & { body?: string }): Promise<T | Queued> {
  try {
    return await request<T>(path, init);
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) {
      return enqueue(path, init.method ?? 'POST', init.body ?? null, description);
    }
    throw e;
  }
}

async function network<T>(path: string, init: RequestInit): Promise<T> {
  let token: string | null = null;
  try {
    token = await getToken();
  } catch {
    // Firebase refreshes an expiring token over the network. With no network the request goes
    // without one and fails to connect, which is the answer the caller should get.
  }
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
    reachable(false);
    throw new ApiError(0, 'Could not reach the server. Check your connection.');
  }
  reachable(true);

  if (res.status === 401) {
    throw new ApiError(401, 'Your session has expired. Sign in again.');
  }
  if (res.status === 403 || res.status === 404) {
    throw new ApiError(res.status, 'Not found.', true);
  }
  if (!res.ok) throw new ApiError(res.status, await failureMessage(res));
  if (res.status === 204) return undefined as T;

  // A JSON client that hands back HTML is broken, whatever put the HTML there. This used to
  // return the body as a string, so a dev server proxying /api to the single page shell produced
  // a 200 full of markup, every caller got a string where it expected a list, and the first
  // .filter threw "filter is not a function" from inside a component. The cause was three layers
  // away from the message. Fail here instead, and say what actually arrived.
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    const body = await res.text().catch(() => '');
    const looksLikeShell = body.trimStart().startsWith('<!doctype') || body.trimStart().startsWith('<html');
    throw new ApiError(
      res.status,
      looksLikeShell
        ? 'The API returned the application shell instead of data, which means the request never reached the backend. '
          + 'In development that is the Vite proxy: check the backend is running on 8080 and restart the dev server.'
        : 'Expected JSON from ' + path + ' but the response was ' + (type || 'an unknown type') + '.',
    );
  }
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

/** Files a browser can show itself. Anything else, a workbook in particular, is saved instead. */
const VIEWABLE = /\.(pdf|png|jpe?g|gif|webp|txt)$/i;

/**
 * The click handler for a link to a stored file. The link keeps a real href so it still reads
 * and behaves as a link to assistive technology, but the click fetches with the token. A plain
 * link, or one opened in a new tab, carries no token and lands on a 401.
 *
 * A PDF or an image opens in a new tab, because a reviewer checking evidence wants to read it,
 * not to find it in a downloads folder. The tab is opened inside the click and pointed at the
 * file once it arrives: a window opened after the fetch resolves is no longer a user gesture, and
 * the popup blocker would swallow it.
 */
export function openFile(e: { preventDefault: () => void }, url: string, name: string) {
  e.preventDefault();
  const tab = VIEWABLE.test(name) ? window.open('', '_blank') : null;
  const fail = (err: unknown) => {
    tab?.close();
    window.alert(err instanceof Error ? err.message : 'The file could not be opened.');
  };
  if (!tab) {
    api.download(url, name).catch(fail);
    return;
  }
  api.fetchFile(url)
    .then(({ blob }) => {
      const href = URL.createObjectURL(blob);
      tab.location.href = href;
      // Long enough for the viewer to have read the whole file.
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    })
    .catch(fail);
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

  analytics: () => request<AnalyticsView>('/api/dashboard/analytics'),

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
    change<{ confirmed: number; by: string }>(
      'Confirm ' + rows.length + (rows.length === 1 ? ' figure' : ' figures'),
      '/api/submissions/' + submissionId + '/confirm', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }),

  submit: (submissionId: string) =>
    change<unknown>('Submit the period to the Department', '/api/submissions/' + submissionId + '/submit', { method: 'POST' }),

  review: (submissionId: string, approve: boolean, returnReason?: string) =>
    change<unknown>(approve ? 'Approve a submission' : 'Return a submission to the entity', '/api/submissions/' + submissionId + '/review', {
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
    change<CommentView>(parentId ? 'Reply to a comment' : 'Comment on a figure', '/api/submissions/' + submissionId + '/comments', {
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

    const path = '/api/submissions/' + submissionId + '/comments';
    let res: Response;
    try {
      res = await fetch(path, { headers });
    } catch {
      reachable(false);
      // The first poll with no connection answers from this person's kept copy, once. The
      // placeholder validator makes every poll after it a failure until the server can answer,
      // and the server treats it as stale, so the first real answer replaces the copy whole.
      if (etag === null) {
        const copy = await copyOf<CommentView[]>(path);
        if (copy !== null) return { changed: true, etag: 'W/"offline-copy"', comments: copy };
      }
      throw new ApiError(0, 'Comments could not be refreshed.');
    }
    reachable(true);
    if (res.status === 304) return { changed: false };
    if (res.status === 401) throw new ApiError(401, 'Your session has expired. Sign in again.');
    if (res.status === 403 || res.status === 404) throw new ApiError(res.status, 'Not found.', true);
    if (!res.ok) throw new ApiError(res.status, 'Comments could not be refreshed.');
    const comments = (await res.json()) as CommentView[];
    void keep(path, comments);
    return { changed: true, etag: res.headers.get('ETag'), comments };
  },

  /* ---------- export ---------- */

  exportUrl: (submissionId: string, shape: 'full.csv' | 'eqprs.csv' | 'json') =>
    '/api/export/submission/' + submissionId + '/' + shape,

  /**
   * Every file the office surface hands over goes through here, so the bearer token travels with
   * it. A plain link cannot carry the token, and one that tried landed the user on a JSON 401.
   */
  fetchFile: async (url: string): Promise<{ blob: Blob; fileName: string | null }> => {
    const token = await getToken();
    const res = await fetch(url, {
      headers: token ? { Authorization: 'Bearer ' + token } : undefined,
    });
    if (!res.ok) {
      throw new ApiError(res.status, res.status === 403 || res.status === 404
        ? 'That file could not be found.'
        : await failureMessage(res));
    }
    const disposition = res.headers.get('content-disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    return { blob: await res.blob(), fileName: match ? match[1] : null };
  },

  download: async (url: string, fallbackName: string) => {
    const { blob, fileName } = await api.fetchFile(url);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName ?? fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked a moment later rather than at once: some browsers read the URL after click returns.
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  /* ---------- template ---------- */

  templateUrl: (entityId: string, periodId: string) =>
    '/api/submissions/template' + qs({ entityId, periodId }),

  /* ---------- workspace, documents and tasks ---------- */

  workspaceDocuments: (entityId: string) =>
    request<WorkspaceDocument[]>('/api/workspace/entity/' + entityId + '/documents'),

  documentHistory: (documentId: string) =>
    request<WorkspaceDocument[]>('/api/workspace/document/' + documentId + '/history'),

  documentContentUrl: (documentId: string) =>
    '/api/workspace/document/' + documentId + '/content',

  decideDocument: (documentId: string, approve: boolean, note: string) =>
    change<unknown>(approve ? 'Approve a document' : 'Return a document', '/api/workspace/document/' + documentId + '/decision', {
      method: 'POST',
      body: JSON.stringify({ approve, note }),
    }),

  /** Work assigned to the caller, open first. The rail badge counts the ones not done. */
  myTasks: () => request<WorkspaceTask[]>('/api/workspace/tasks/mine'),

  entityTasks: (entityId: string) =>
    request<WorkspaceTask[]>('/api/workspace/entity/' + entityId + '/tasks'),

  /** Who a task on this entity can go to: the Department, and this entity's own reporters. */
  taskPeople: (entityId: string) =>
    request<TaskPerson[]>('/api/workspace/entity/' + entityId + '/people'),

  createTask: (entityId: string, task: NewTask) =>
    request<WorkspaceTask>('/api/workspace/entity/' + entityId + '/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    }),

  setTaskStatus: (taskId: string, status: string) =>
    change<unknown>('Mark a task ' + status.toLowerCase().replace('_', ' '), '/api/workspace/task/' + taskId + '/status', {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  /** Whether a Microsoft tenant is actually bound, so the screen can say so rather than guess. */
  microsoftStatus: () => request<Record<string, unknown>>('/api/workspace/microsoft/status'),

  /* ---------- audit trail ---------- */

  auditTrail: (params: { from?: string; to?: string; type?: string; entityId?: string } = {}) =>
    request<AuditPage>('/api/audit' + qs(params)),

  /** The same filter as the screen, so the file matches what was on the page. */
  auditExportUrl: (params: { from?: string; to?: string; type?: string; entityId?: string } = {}) =>
    '/api/audit/export.csv' + qs(params),

  /* ---------- administration ---------- */

  setPublished: (entityId: string, publiclyVisible: boolean) =>
    request<{ entityId: string; publiclyVisible: boolean }>(
      '/api/admin/entities/' + entityId + '/publication',
      { method: 'POST', body: JSON.stringify({ publiclyVisible }) },
    ),

  adminEntities: () => request<AdminEntityRow[]>('/api/admin/entities'),

  /** Registers a funded body. No targets and no reporter yet, and unpublished. */
  createEntity: (body: {
    name: string;
    shortName: string;
    sector: string;
    pfmaSchedule: string;
    contactName: string;
    contactEmail: string;
  }) =>
    request<{ entityId: string; name: string }>('/api/admin/entities', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** The only way a reporter account comes to exist. There is no sign up. */
  issueReporter: (entityId: string, name: string, email: string) =>
    request<IssuedReporter>('/api/admin/entities/' + entityId + '/reporters', {
      method: 'POST',
      body: JSON.stringify({ name, email }),
    }),

  adminPeriods: () => request<PeriodView[]>('/api/admin/periods'),

  setDueDate: (periodId: string, dueDate: string) =>
    request<PeriodView>('/api/admin/periods/' + periodId + '/due-date', {
      method: 'POST',
      body: JSON.stringify({ dueDate }),
    }),
};

// Replay goes through the same client, with the same token and the same error rules.
registerSender(
  (path, method, body) => request<unknown>(path, { method, body: body ?? undefined }),
  (e) => ({
    status: e instanceof ApiError ? e.status : -1,
    message: e instanceof Error ? e.message : 'The change was not accepted.',
  }),
);
