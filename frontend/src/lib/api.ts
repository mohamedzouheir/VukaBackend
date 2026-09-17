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
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ApiError(res.status, detail.slice(0, 300) || 'Request failed with ' + res.status + '.');
  }
  if (res.status === 204) return undefined as T;

  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return (await res.text()) as unknown as T;
  return (await res.json()) as T;
}

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
  documentUrl: (documentId: string) => '/api/documents/' + documentId,

  /* ---------- comments, the per target dispute trail ---------- */

  comments: (submissionId: string) =>
    request<CommentView[]>('/api/submissions/' + submissionId + '/comments'),

  addComment: (submissionId: string, body: string, targetId?: string) =>
    request<CommentView>('/api/submissions/' + submissionId + '/comments', {
      method: 'POST',
      body: JSON.stringify({ body, targetId: targetId ?? null }),
    }),

  /* ---------- export ---------- */

  exportUrl: (submissionId: string, shape: 'full.csv' | 'eqprs.csv' | 'json') =>
    '/api/export/submission/' + submissionId + '/' + shape,

  /** Exports go through fetch so the bearer token travels with them. */
  download: async (url: string, fallbackName: string) => {
    const token = await getToken();
    const res = await fetch(url, {
      headers: token ? { Authorization: 'Bearer ' + token } : undefined,
    });
    if (!res.ok) throw new ApiError(res.status, 'The export could not be generated.');
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = match ? match[1] : fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
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
