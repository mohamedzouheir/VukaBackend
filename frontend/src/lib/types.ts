/*
 * The API surface, typed against the Java records rather than against what the screens
 * happen to want. Where a field is nullable in the backend it is nullable here, because
 * the whole subject of this product is the difference between a zero and an absence.
 */

export type Role = 'ENTITY_REPORTER' | 'DSAC_REVIEWER' | 'DSAC_EXECUTIVE' | 'ADMIN';

export type RiskBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'NOT_SCORED';

export type Sector = 'ARTS' | 'HERITAGE' | 'SPORT' | 'LIBRARIES' | 'LANGUAGE' | 'OTHER';

export type SubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'RETURNED' | 'APPROVED';

export type SignalType =
  | 'SUBMISSION_LATENESS'
  | 'EVIDENCE_GAP'
  | 'SPEND_DELIVERY_DIVERGENCE'
  | 'PRIOR_AUDIT_FINDING'
  | 'REVISION_CHURN';

/** DashboardController.SignalView */
export interface SignalView {
  type: SignalType | string;
  description: string | null;
  contribution: number | null;
  weight: number | null;
  value: number | null;
}

/** DashboardController.PortfolioRow */
export interface PortfolioRow {
  entityId: string;
  name: string;
  shortName: string | null;
  sector: Sector | string;
  entityType: string;
  score: number | null;
  band: RiskBand;
  previousScore: number | null;
  movement: number | null;
  signals: SignalView[];
  /**
   * The entity's allocation for the current financial year, in rands.
   *
   * On the row rather than fetched per entity because of one sentence in section 8 of the
   * frontend design: "R358.6 million sits with entities in the critical band" is the line a
   * Director-General takes into a committee meeting, and pulling it from twenty eight
   * separate requests to render one tile is not a trade worth making.
   */
  totalAllocation: number | null;
}

/** DashboardController.TargetView */
export interface TargetView {
  targetId: string;
  indicatorRef: string;
  indicator: string;
  unitOfMeasure: string | null;
  annualTarget: number | null;
  delivered: number | null;
  status: string;
  plannedUnitCost: number | null;
  actualUnitCost: number | null;
  unitCostVariancePercent: number | null;
  verdict: string;
}

/** DashboardController.FindingView */
export interface FindingView {
  financialYear: string;
  outcome: string;
  description: string | null;
  repeatFinding: boolean;
  resolutionStatus: string;
}

/** DashboardController.EntityDetail */
export interface EntityDetail {
  entityId: string;
  name: string;
  sector: Sector | string;
  mandate: string | null;
  totalAllocation: number | null;
  risk: PortfolioRow | null;
  targets: TargetView[];
  auditFindings: FindingView[];
}

/** DashboardController.PeerComparison */
export interface PeerComparison {
  sector: string;
  entityMedianUnitCost: number | null;
  peerMedianUnitCost: number | null;
  peerCount: number;
  note: string;
}

/** SubmissionController.ExtractionView */
export interface ExtractionView {
  id: string;
  targetId: string | null;
  indicatorRef: string | null;
  fieldName: string | null;
  extractedValue: string | null;
  sourceLocation: string | null;
  confidence: number | null;
  needsManualMatch: boolean;
  targetIndicator: string | null;
}

/** SubmissionService.ParseReport */
export interface ParseReport {
  documentId: string;
  rowsRead: number;
  matched: number;
  unmatched: number;
  messages?: string[];
  [k: string]: unknown;
}

/** ReportingController.MeView */
export interface MeView {
  uid: string;
  email: string | null;
  name: string | null;
  role: Role;
  entityId: string | null;
  entityName: string | null;
  /** What this person may do. The server's Capability enum, which every endpoint checks. */
  capabilities: Capability[];
}

/** config.Capability. The one list of what a role may do; see its Javadoc for the table. */
export type Capability =
  | 'READ_OWN_REPORTING'
  | 'SUBMIT_REPORTING'
  | 'PARTICIPATE'
  | 'DOWNLOAD_TEMPLATE'
  | 'VIEW_PORTFOLIO'
  | 'REVIEW_SUBMISSIONS'
  | 'ADMINISTER';

/** ReportingController.PeriodView */
export interface PeriodView {
  periodId: string;
  financialYear: string;
  quarter: number | null;
  label: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  deadlineBasis: string | null;
  /** True where the basis is a PFMA section rather than a departmental instruction. */
  statutory: boolean;
  daysRemaining: number | null;
  open: boolean;
}

/** ReportingController.SubmissionRow */
export interface SubmissionRow {
  submissionId: string;
  entityId: string;
  entityName: string;
  periodId: string;
  periodLabel: string;
  status: SubmissionStatus;
  channel: string;
  createdAt: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  returnReason: string | null;
  daysLate: number | null;
  targetCount: number;
  confirmedCount: number;
  evidenceCount: number;
}

/** One indicator inside a submission, with its provenance. ReportingController.IndicatorRowView */
export interface IndicatorRowView {
  targetId: string;
  indicatorRef: string;
  indicator: string;
  unitOfMeasure: string | null;
  annualTarget: number | null;
  quarterTarget: number | null;
  /** Null means no result reported. It is never rendered as a zero. */
  actual: number | null;
  variance: number | null;
  variancePercent: number | null;
  varianceExplanation: string | null;
  status: string;
  /** The cell the figure was read from, "Quarterly Report!H14" shape. Null if hand entered. */
  sourceLocation: string | null;
  extractionId: string | null;
  extractedValue: string | null;
  needsManualMatch: boolean;
  confirmed: boolean;
  confirmedByName: string | null;
  confirmedAt: string | null;
  noResultReason: string | null;
  evidence: EvidenceView[];
  /** The AGSA criteria the attached evidence satisfies. Empty means unverifiable. */
  agsaCriteria: string[];
  traceable: boolean;
  targetVersion: number | null;
  revisionTrigger: string | null;
  retablingReference: string | null;
  disputed: boolean;
  disputeComment: string | null;
}

/** ReportingController.EvidenceView */
export interface EvidenceView {
  documentId: string;
  fileName: string | null;
  documentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
  uploadedByName: string | null;
  agsaCriteria: string[];
}

/** ReportingController.SubmissionDetail */
export interface SubmissionDetail {
  submission: SubmissionRow;
  period: PeriodView;
  entity: {
    entityId: string;
    name: string;
    shortName: string | null;
    sector: string;
    pfmaSchedule: string | null;
    reportingLine: string | null;
    publiclyVisible: boolean;
  };
  risk: PortfolioRow | null;
  rows: IndicatorRowView[];
  unmatched: ExtractionView[];
  sourceDocument: { documentId: string; fileName: string | null } | null;
}

/** ReportingController.CommentView */
export interface CommentView {
  commentId: string;
  body: string;
  authorName: string | null;
  authorRole: string | null;
  createdAt: string | null;
  anchorType: string | null;
  anchorId: string | null;
  indicatorRef: string | null;
  /** The comment this answers. Null where it opened a thread. */
  parentId: string | null;
  /** Closed. A closed dispute is history and no longer marks the figure as disputed. */
  resolved: boolean;
}

/** ReportingController.AllocationView */
export interface AllocationView {
  financialYear: string;
  amount: number | null;
  basis: string | null;
  source: string | null;
}

/** ReportingController.ChainView, the four boxes at the top of the drilldown. */
export interface ChainView {
  allocated: number | null;
  allocatedCitation: string | null;
  promisedTargetCount: number | null;
  promisedCitation: string | null;
  reportedCount: number | null;
  reportedOfCount: number | null;
  reportedCitation: string | null;
  verifiedCount: number | null;
  verifiedOfCount: number | null;
  verifiedCitation: string | null;
  allocations: AllocationView[];
  targetsWithNoResult: number | null;
  figuresWithNoEvidence: number | null;
}

/** ReportingController.UnitCostView */
export interface UnitCostView {
  indicatorRef: string;
  indicator: string;
  unitOfMeasure: string | null;
  plannedSpend: number | null;
  plannedVolume: number | null;
  plannedUnitCost: number | null;
  actualSpend: number | null;
  actualVolume: number | null;
  actualUnitCost: number | null;
  variancePercent: number | null;
  verdict: string;
  history: { financialYear: string; unitCost: number | null }[];
}

/* ------------------------------------------------------------------ */
/* Workspace, documents and tasks.                                     */
/*                                                                     */
/* Added by the accessibility-and-languages branch. Typed against      */
/* WorkspaceController's records, nullable wherever those are, because */
/* a document that has never been decided on has no decider and that   */
/* is different from having been rejected by nobody.                   */
/* ------------------------------------------------------------------ */

/** WorkspaceController.DocumentView */
export interface WorkspaceDocument {
  id: string;
  documentKey: string | null;
  fileName: string | null;
  documentType: string | null;
  version: number;
  current: boolean;
  sizeBytes: number;
  contentHash: string | null;
  source: string | null;
  uploadedBy: string | null;
  uploadedAt: string | null;
  /** Proof of receipt. Null until the department has acknowledged the file. */
  receiptNumber: string | null;
  receivedAt: string | null;
  approvalStatus: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  agsaCriterion: string | null;
  microsoftState: string | null;
  microsoftVersionLabel: string | null;
  microsoftWebUrl: string | null;
  microsoftError: string | null;
}

/** WorkspaceService.Person */
export interface TaskPerson {
  uid: string;
  name: string;
  role: string;
  dsac: boolean;
}

/** WorkspaceController.TaskRequest */
export interface NewTask {
  title: string;
  description: string | null;
  assignedToUid: string;
  assignedToName: string | null;
  dueDate: string | null;
  documentId: string | null;
  submissionId: string | null;
}

/** WorkspaceController.TaskView */
export interface WorkspaceTask {
  id: string;
  title: string | null;
  description: string | null;
  assignedToName: string | null;
  createdByName: string | null;
  dueDate: string | null;
  status: string | null;
  external: boolean;
  documentId: string | null;
  createdAt: string | null;
}

/* ------------------------------------------------------------------ */
/* The audit trail.                                                    */
/*                                                                     */
/* Assembled from the records themselves rather than from an event     */
/* table, so a row here is a record and not a note about one.          */
/* ------------------------------------------------------------------ */

/** AuditController.AuditRow */
export interface AuditRow {
  /** Already formatted, South African Standard Time. */
  at: string;
  type: string;
  /** As recorded at the time, never resolved fresh. "Not recorded" where no name was stored. */
  actor: string;
  entity: string;
  summary: string;
  detail: string | null;
  entityId: string | null;
  recordId: string;
}

/** AuditController.AuditPage */
export interface AuditPage {
  events: AuditRow[];
  types: string[];
  /** True for a reporter, who sees their own entity and no other. */
  scopedToOwnEntity: boolean;
  note: string;
}
/** AdminController, the entity register as the administrator sees it. */
export interface AdminEntityRow {
  entityId: string;
  name: string;
  shortName: string | null;
  sector: string;
  publiclyVisible: boolean;
  targetCount: number;
  reporters: { name: string | null; email: string | null; credentialIssued: boolean }[];
}

/** ReporterAccountService.Issued */
export interface IssuedReporter {
  uid: string;
  email: string;
  displayName: string;
  credentialIssued: boolean;
  setPasswordLink: string | null;
  note: string;
}

/* ---------- analytics ---------- */

/** One financial year: ENE allocation, and the Auditor-General's published outcome where audited. */
export interface AnalyticsYear {
  financialYear: string;
  current: boolean;
  /** Null where no allocation row exists for the year. */
  allocated: number | null;
  entitiesFunded: number;
  /** Zero where the year has not been audited yet. */
  entitiesAudited: number;
  entitiesWithCounts: number;
  targetsAchieved: number | null;
  targetsTotal: number | null;
  achievedPercent: number | null;
  outcomes: Record<string, number>;
  repeatFindings: number | null;
}

export interface AnalyticsMovement {
  entityId: string;
  name: string;
  shortName: string | null;
  sector: string;
  fromAchieved: number;
  fromTotal: number;
  fromPercent: number;
  toAchieved: number;
  toTotal: number;
  toPercent: number;
  changePoints: number;
  fromOutcome: string | null;
  toOutcome: string | null;
}

export interface AnalyticsCohort {
  fromYear: string;
  toYear: string;
  entities: number;
  fromPercent: number | null;
  toPercent: number | null;
  improved: number;
  declined: number;
  unchanged: number;
  rows: AnalyticsMovement[];
}

export interface AnalyticsQuarter {
  periodId: string;
  label: string;
  quarter: number | null;
  dueDate: string | null;
  open: boolean;
  fallenDue: boolean;
  expected: number;
  filed: number;
  onTime: number;
  late: number;
  /** Null until the due date has passed. */
  notFiled: number | null;
  drafts: number;
  approved: number;
  returned: number;
  awaitingReview: number;
  channels: Record<string, number>;
  figuresReported: number;
  metTarget: number;
  belowTarget: number;
  noFigure: number;
  figuresVerified: number;
  metPercent: number | null;
  scored: number;
  highOrCritical: number;
}

export interface AnalyticsSector {
  sector: string;
  entities: number;
  allocated: number | null;
  allocatedEarliest: number | null;
  filed: number;
  expected: number;
  figuresReported: number;
  metTarget: number;
  metPercent: number | null;
  scored: number;
  highOrCritical: number;
}

export interface AnalyticsView {
  currentYear: string | null;
  earliestAllocationYear: string | null;
  /** Entities with no target registered for the current year. They still owe a report. */
  entitiesWithoutTargets: number;
  reviewPeriodId: string | null;
  reviewPeriodLabel: string | null;
  years: AnalyticsYear[];
  cohort: AnalyticsCohort | null;
  quarters: AnalyticsQuarter[];
  sectors: AnalyticsSector[];
}
