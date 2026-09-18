/*
 * The translated labels for the codes the API returns.
 *
 * format.ts turns numbers and dates into strings and has no opinion about language beyond the
 * South African locale. This file turns enum codes into words, and words have a language, so it
 * sits here instead: CRITICAL becomes a band word, PFMA_65_2_BACKSTOP becomes a sentence about
 * the six month backstop, PRESENTATION becomes one of the Auditor-General's seven tests.
 *
 * It is a hook rather than a set of functions taking a dictionary, because every caller is a
 * component that already has to be inside the provider anyway, and threading `t` through fifteen
 * call sites is how half of them end up still in English.
 *
 * <h2>The unknown code</h2>
 *
 * Every lookup falls through to the code itself, tidied up. That is deliberate. If the backend
 * adds an outcome or a signal type before this file learns about it, the screen shows
 * "Revision churn" rather than a blank cell or the word "Unknown", and the gap is visible to
 * whoever is looking at it rather than hidden behind a plausible default.
 */
import { useI18n } from './i18n';
import type { Key } from './i18n';
import type { RiskBand } from './types';

const BAND_KEYS: Record<string, Key> = {
  CRITICAL: 'band.critical',
  HIGH: 'band.high',
  MEDIUM: 'band.medium',
  LOW: 'band.low',
  NOT_SCORED: 'band.notScored',
};

const SIGNAL_KEYS: Record<string, Key> = {
  SUBMISSION_LATENESS: 'signal.lateness',
  EVIDENCE_GAP: 'signal.evidenceGap',
  SPEND_DELIVERY_DIVERGENCE: 'signal.spendDelivery',
  PRIOR_AUDIT_FINDING: 'signal.auditFinding',
  REVISION_CHURN: 'signal.revisionChurn',
};

const STATUS_KEYS: Record<string, Key> = {
  DRAFT: 'status.draft',
  SUBMITTED: 'status.submitted',
  UNDER_REVIEW: 'status.underReview',
  RETURNED: 'status.returned',
  APPROVED: 'status.approved',
  NOT_STARTED: 'status.notStarted',
  IN_PROGRESS: 'status.inProgress',
  ACHIEVED: 'status.achieved',
  MISSED: 'status.missed',
};

const OUTCOME_KEYS: Record<string, Key> = {
  UNQUALIFIED: 'outcome.clean',
  UNQUALIFIED_WITH_FINDINGS: 'outcome.unqualifiedFindings',
  QUALIFIED: 'outcome.qualified',
  ADVERSE: 'outcome.adverse',
  DISCLAIMER: 'outcome.disclaimer',
  OUTSTANDING: 'outcome.outstanding',
};

const SECTOR_KEYS: Record<string, Key> = {
  ARTS: 'sector.arts',
  HERITAGE: 'sector.heritage',
  SPORT: 'sector.sport',
  LIBRARIES: 'sector.libraries',
  LANGUAGE: 'sector.language',
  OTHER: 'sector.other',
};

const CRITERION_KEYS: Record<string, Key> = {
  PRESENTATION: 'criterion.presentation',
  CONSISTENCY: 'criterion.consistency',
  MEASURABILITY: 'criterion.measurability',
  RELEVANCE: 'criterion.relevance',
  VALIDITY: 'criterion.validity',
  ACCURACY: 'criterion.accuracy',
  COMPLETENESS: 'criterion.completeness',
};

const BASIS_KEYS: Record<string, Key> = {
  TR_26_1_1_QUARTERLY_FINANCIAL: 'basis.tr2611',
  TR_30_2_1_QUARTERLY_PERFORMANCE: 'basis.tr3021',
  PFMA_55_1_C_STATEMENTS_TO_AUDITOR: 'basis.pfma551c',
  PFMA_55_1_D_ANNUAL_REPORT: 'basis.pfma551d',
  PFMA_65_1_A_TABLING: 'basis.pfma651a',
  PFMA_65_2_BACKSTOP: 'basis.pfma652',
  DEPARTMENTAL_INSTRUCTION: 'basis.departmental',
};

export interface Labels {
  band: (band: RiskBand | string | null | undefined) => string;
  signal: (type: string | null | undefined) => string;
  status: (status: string | null | undefined) => string;
  outcome: (outcome: string | null | undefined) => string;
  sector: (sector: string | null | undefined) => string;
  criterion: (c: string) => string;
  /** The deadline basis in plain words, and whether it is law or an instruction. */
  basis: (basis: string | null | undefined) => string;
  /** "14 days left", "due today", "3 days late". Never a bare negative number. */
  daysRemaining: (days: number | null | undefined) => string | null;
}

export function useLabels(): Labels {
  const { t } = useI18n();

  return {
    band: (band) => (band && BAND_KEYS[band] ? t(BAND_KEYS[band]) : t('band.notScored')),
    signal: (type) => (type ? (SIGNAL_KEYS[type] ? t(SIGNAL_KEYS[type]) : sentence(type)) : t('signal.generic')),
    status: (status) =>
      status ? (STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : sentence(status)) : t('status.unknown'),
    outcome: (outcome) =>
      outcome ? (OUTCOME_KEYS[outcome] ? t(OUTCOME_KEYS[outcome]) : sentence(outcome)) : t('outcome.none'),
    sector: (sector) =>
      sector ? (SECTOR_KEYS[sector] ? t(SECTOR_KEYS[sector]) : sentence(sector)) : t('sector.unassigned'),
    criterion: (c) => (CRITERION_KEYS[c] ? t(CRITERION_KEYS[c]) : c.toLowerCase()),
    basis: (basis) => (basis && BASIS_KEYS[basis] ? t(BASIS_KEYS[basis]) : t('basis.unrecorded')),
    daysRemaining: (days) => {
      if (days === null || days === undefined) return null;
      if (days > 1) return t('deadline.daysLeft', days);
      if (days === 1) return t('deadline.oneDayLeft');
      if (days === 0) return t('deadline.dueToday');
      if (days === -1) return t('deadline.oneDayLate');
      return t('deadline.daysLate', Math.abs(days));
    },
  };
}

/** ACHIEVED becomes Achieved. Used only where there is no curated label. */
function sentence(value: string): string {
  const s = value.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
