/*
 * Formatting.
 *
 * The rule that matters here is the one in section 10: empty is never zero. A target with
 * no result reported renders as "no result reported", not as 0. The difference between not
 * done and not reported is the entire subject of this product, and a formatter that turns
 * null into 0 destroys it at the last inch. So every function in this file takes null
 * seriously and none of them fall back to a zero.
 */
import type { RiskBand } from './types';

const ZA = 'en-ZA';

/** R19 369 000. Rands, no cents: allocations are published to the rand. */
export function rands(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return 'R' + new Intl.NumberFormat(ZA, { maximumFractionDigits: 0 }).format(value);
}

/** R2.258bn, for the portfolio tiles where the full figure would not be read. */
export function randsShort(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return 'R' + (value / 1_000_000_000).toFixed(3) + 'bn';
  if (abs >= 1_000_000) return 'R' + (value / 1_000_000).toFixed(1) + 'm';
  if (abs >= 1_000) return 'R' + (value / 1_000).toFixed(1) + 'k';
  return 'R' + value.toFixed(0);
}

/** 2 140. Thousands separated, because these are read aloud in committee meetings. */
export function num(
  value: number | null | undefined,
  opts: { decimals?: number } = {},
): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return new Intl.NumberFormat(ZA, {
    minimumFractionDigits: opts.decimals ?? 0,
    maximumFractionDigits: opts.decimals ?? 0,
  }).format(value);
}

/** Always signed, because the sign is the information. */
export function signedPercent(value: number | null | undefined, decimals = 0): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const sign = value > 0 ? '+' : '';
  return sign + value.toFixed(decimals) + '%';
}

export function percent(value: number | null | undefined, decimals = 0): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return value.toFixed(decimals) + '%';
}

/** 31 Oct 2026. */
export function date(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(ZA, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/** 28 Oct 2026 11:14. Confirmations and approvals carry a time, not just a day. */
export function dateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (
    new Intl.DateTimeFormat(ZA, { day: 'numeric', month: 'short', year: 'numeric' }).format(d) +
    ' ' +
    new Intl.DateTimeFormat(ZA, { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  );
}

export function fileSize(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined) return null;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/* ---------- vocabulary ---------- */

const BAND_WORDS: Record<RiskBand, string> = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  NOT_SCORED: 'NOT SCORED',
};

export function bandWord(band: RiskBand | string | null | undefined): string {
  if (!band) return 'NOT SCORED';
  return BAND_WORDS[band as RiskBand] ?? String(band).replace(/_/g, ' ');
}

export function bandColour(band: RiskBand | string | null | undefined): string {
  switch (band) {
    case 'CRITICAL':
      return 'var(--band-critical)';
    case 'HIGH':
      return 'var(--band-high)';
    case 'MEDIUM':
      return 'var(--band-medium)';
    case 'LOW':
      return 'var(--band-low)';
    default:
      return 'var(--band-none)';
  }
}

export const BAND_ORDER: RiskBand[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NOT_SCORED'];

/** Signal names in the words the risk panel and the briefing note both use. */
const SIGNAL_LABELS: Record<string, string> = {
  SUBMISSION_LATENESS: 'Submission lateness',
  EVIDENCE_GAP: 'Evidence gap',
  SPEND_DELIVERY_DIVERGENCE: 'Spend to delivery divergence',
  PRIOR_AUDIT_FINDING: 'Prior audit findings',
  REVISION_CHURN: 'Revision churn',
};

export function signalLabel(type: string | null | undefined): string {
  if (!type) return 'Signal';
  return SIGNAL_LABELS[type] ?? sentence(type);
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  RETURNED: 'Returned',
  APPROVED: 'Approved',
  NOT_STARTED: 'No result reported',
  IN_PROGRESS: 'In progress',
  ACHIEVED: 'Achieved',
  MISSED: 'Missed',
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return STATUS_LABELS[status] ?? sentence(status);
}

const OUTCOME_LABELS: Record<string, string> = {
  UNQUALIFIED: 'Clean audit',
  UNQUALIFIED_WITH_FINDINGS: 'Unqualified with findings',
  QUALIFIED: 'Qualified',
  ADVERSE: 'Adverse',
  DISCLAIMER: 'Disclaimer',
  OUTSTANDING: 'Audit outstanding',
};

export function auditOutcomeLabel(outcome: string | null | undefined): string {
  if (!outcome) return 'No published outcome';
  return OUTCOME_LABELS[outcome] ?? sentence(outcome);
}

const SECTOR_LABELS: Record<string, string> = {
  ARTS: 'Arts',
  HERITAGE: 'Heritage',
  SPORT: 'Sport',
  LIBRARIES: 'Libraries',
  LANGUAGE: 'Language',
  OTHER: 'Other',
};

export function sectorLabel(sector: string | null | undefined): string {
  if (!sector) return 'Unassigned';
  return SECTOR_LABELS[sector] ?? sentence(sector);
}

const CRITERION_LABELS: Record<string, string> = {
  PRESENTATION: 'presentation',
  CONSISTENCY: 'consistency',
  MEASURABILITY: 'measurability',
  RELEVANCE: 'relevance',
  VALIDITY: 'validity',
  ACCURACY: 'accuracy',
  COMPLETENESS: 'completeness',
};

/** The Auditor-General's own test names, used as published. */
export function criterionLabel(c: string): string {
  return CRITERION_LABELS[c] ?? c.toLowerCase();
}

/** The deadline basis in plain words, and whether it is law or an instruction. */
export function deadlineBasisText(basis: string | null | undefined): string {
  switch (basis) {
    case 'TR_26_1_1_QUARTERLY_FINANCIAL':
      return 'Treasury Regulation 26.1.1, thirty days after quarter end. Financial data only.';
    case 'TR_30_2_1_QUARTERLY_PERFORMANCE':
      return 'Treasury Regulation 30.2.1, quarterly performance to the executive authority. The regulation sets no day count, so this date is a National Treasury guideline.';
    case 'PFMA_55_1_C_STATEMENTS_TO_AUDITOR':
      return 'PFMA section 55(1)(c), statements to the auditors within two months of year end. Statutory.';
    case 'PFMA_55_1_D_ANNUAL_REPORT':
      return 'PFMA section 55(1)(d), annual report within five months of year end. Statutory.';
    case 'PFMA_65_1_A_TABLING':
      return 'PFMA section 65(1)(a), tabling within one month of receiving the audit report. Statutory.';
    case 'PFMA_65_2_BACKSTOP':
      return 'PFMA section 65(2), the six month backstop after which the executive authority must explain. Statutory.';
    case 'DEPARTMENTAL_INSTRUCTION':
      return 'A date the Department set. Enforceable as an instruction rather than as law.';
    default:
      return 'The basis for this date is not recorded.';
  }
}

/** ACHIEVED becomes Achieved. Used only where there is no curated label. */
function sentence(value: string): string {
  const s = value.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "14 days left", "due today", "3 days late". Never a bare negative number. */
export function daysRemainingText(days: number | null | undefined): string | null {
  if (days === null || days === undefined) return null;
  if (days > 1) return days + ' days left';
  if (days === 1) return '1 day left';
  if (days === 0) return 'due today';
  if (days === -1) return '1 day late';
  return Math.abs(days) + ' days late';
}

/** Quarterly Report!H14 splits into a sheet and a cell for display. */
export function splitSourceCell(location: string | null | undefined): { sheet: string | null; cell: string } | null {
  if (!location) return null;
  const i = location.lastIndexOf('!');
  if (i < 0) return { sheet: null, cell: location };
  return { sheet: location.slice(0, i), cell: location.slice(i + 1) };
}

/**
 * The period the Department's screens open on: the most recent one whose due date has passed,
 * or the open one before the first due date of the year. The reporter's screens open on the
 * open period instead. In September a reviewer is working on Q1 and a reporter on Q2, and one
 * default would be wrong for one of them. Mirrors ReportingViewService.reviewPeriodId.
 */
export function reviewPeriod<P extends { open: boolean; daysRemaining: number | null }>(
  periods: P[] | null | undefined,
): P | null {
  const list = periods ?? [];
  return (
    list.filter((p) => p.daysRemaining !== null && p.daysRemaining < 0).at(-1) ??
    list.filter((p) => p.open).at(-1) ??
    null
  );
}
