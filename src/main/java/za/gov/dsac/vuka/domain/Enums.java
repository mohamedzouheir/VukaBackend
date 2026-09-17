package za.gov.dsac.vuka.domain;

/** Reference data for the Vuka domain. Kept together so the vocabulary is readable in one place. */
public final class Enums {

    private Enums() {}

    public enum EntityType { PUBLIC_ENTITY, NPO }

    public enum Sector { ARTS, HERITAGE, SPORT, LIBRARIES, LANGUAGE, OTHER }

    /**
     * Where the body sits in the Public Finance Management Act schedules.
     *
     * <p>This is not filing metadata, it decides who the entity reports performance to and
     * under what instrument. A Schedule 3A entity reports quarterly performance to its
     * <em>executive authority</em> under Treasury Regulation 30.2.1, which prescribes no day
     * count and names no system. A Schedule 3B entity is inside National Treasury's quarterly
     * non-financial reporting guideline. Every DSAC body is 3A except the Pan South African
     * Language Board, which is a Schedule 1 constitutional institution.
     *
     * <p>The unserved 3A gap is the reason this system exists rather than being a second copy
     * of DPME's eQPRS, which is built around departments.
     */
    public enum PfmaSchedule {
        SCHEDULE_1, SCHEDULE_2, SCHEDULE_3A, SCHEDULE_3B, SCHEDULE_3C, SCHEDULE_3D
    }

    public enum SizeBand { SMALL, MEDIUM, LARGE }

    /** Carried as a Firebase custom claim and mapped to a Spring Security authority. */
    public enum Role { ENTITY_REPORTER, DSAC_REVIEWER, DSAC_EXECUTIVE, ADMIN }

    public enum SubmissionStatus { DRAFT, SUBMITTED, UNDER_REVIEW, RETURNED, APPROVED }

    public enum SubmissionChannel { WEB, MOBILE, WHATSAPP, EMAIL }

    public enum TargetStatus { NOT_STARTED, IN_PROGRESS, ACHIEVED, MISSED }

    public enum DocumentType {
        STRATEGIC_PLAN, ANNUAL_PERFORMANCE_PLAN, OPERATIONAL_PLAN,
        ANNUAL_REPORT, QUARTERLY_REPORT, FINANCIALS, REPORTING_TEMPLATE
    }

    public enum ApprovalStatus { PENDING, APPROVED, REJECTED }

    public enum RiskBand { LOW, MEDIUM, HIGH, CRITICAL }

    /** The five contributing factors behind a risk score. Always shown with the score. */
    public enum RiskSignalType {
        SUBMISSION_LATENESS,
        EVIDENCE_GAP,
        SPEND_DELIVERY_DIVERGENCE,
        PRIOR_AUDIT_FINDING,
        REVISION_CHURN
    }

    /**
     * The Auditor-General's vocabulary, used exactly as published.
     *
     * <p>{@code UNQUALIFIED} is what the reports call a clean audit: unqualified with no
     * material findings. {@code OUTSTANDING} is not a bad opinion, it is the absence of one,
     * and it is worse than any of them. An auditee whose statements arrive after the statutory
     * date can have its audit left incomplete and be excluded from the portfolio outcomes
     * altogether, which is what happened to one DSAC entity in 2024/25. A system that models
     * only the five opinions cannot represent the single worst outcome in the portfolio.
     */
    public enum AuditOutcome {
        UNQUALIFIED, UNQUALIFIED_WITH_FINDINGS, QUALIFIED, ADVERSE, DISCLAIMER, OUTSTANDING
    }

    /**
     * What a deadline is actually founded on. Stored beside every due date, because a date with
     * no instrument behind it is a departmental instruction and the interface should not dress
     * it up as law.
     *
     * <p>The distinction is load bearing. Treasury Regulation 26.1.1 gives 30 days after each
     * quarter, and it covers actual and projected <em>revenue and expenditure</em> only. TR
     * 30.2.1 requires quarterly reporting of progress against targets to the executive
     * authority and sets <em>no day count at all</em>. The 30 day figure everyone quotes for
     * performance reporting comes from National Treasury's guideline, not from a regulation.
     * The annual dates in PFMA sections 55 and 65 are statutory and are the only hard ones.
     */
    public enum DeadlineBasis {
        /** TR 26.1.1. Thirty days after quarter end. Financial data only. */
        TR_26_1_1_QUARTERLY_FINANCIAL,
        /** TR 30.2.1. Quarterly performance to the executive authority. No day count in the regulation. */
        TR_30_2_1_QUARTERLY_PERFORMANCE,
        /** PFMA s55(1)(c). Annual financial statements to the auditors within two months of year end. */
        PFMA_55_1_C_STATEMENTS_TO_AUDITOR,
        /** PFMA s55(1)(d). Annual report and audited statements within five months of year end. */
        PFMA_55_1_D_ANNUAL_REPORT,
        /** PFMA s65(1)(a). Tabling within one month of receiving the audit report. */
        PFMA_65_1_A_TABLING,
        /** PFMA s65(2). The six month backstop, after which the executive authority must explain. */
        PFMA_65_2_BACKSTOP,
        /** A date the department set. Enforceable as an instruction, not as law. Say so. */
        DEPARTMENTAL_INSTRUCTION
    }

    /**
     * The only lawful reasons an in-year target may change, under section 4.4.4 of the 2019
     * Revised Framework for Strategic Plans and Annual Performance Plans.
     *
     * <p>Note what is absent. Being about to miss a target is not on this list. A target may
     * move because the budget moved or because the strategic plan was revised, the executive
     * authority approves it, and it takes effect by re-tabling the Annual Performance Plan in
     * the legislature. That is why {@link Target} is versioned rather than mutable: a system
     * that lets a number be edited quietly has made performance unfalsifiable.
     */
    public enum RevisionTrigger {
        /** Targets changed through the in-year budget adjustment process and a re-tabled APP. */
        BUDGET_ADJUSTMENT_RETABLED,
        /** The Strategic Plan was revised, requiring outcome or output changes. */
        STRATEGIC_PLAN_REVISED
    }

    /**
     * The Auditor-General's tests on reported performance information, from the audit of
     * predetermined objectives under section 20(2) of the Public Audit Act.
     *
     * <p>Two top level criteria. <b>Usefulness</b> asks whether the information is presented in
     * the prescribed manner and is consistent with planned objectives. <b>Reliability</b> asks
     * whether it can be traced back to source data and whether it is valid, accurate and
     * complete.
     *
     * <p>Evidence in this system is tagged with the test it satisfies, so "attach a document"
     * becomes "satisfy the completeness test on this indicator". That is the whole difference
     * between a document repository and an audit readiness tool.
     */
    public enum AgsaCriterion {
        // Usefulness
        PRESENTATION, CONSISTENCY, MEASURABILITY, RELEVANCE,
        // Reliability
        VALIDITY, ACCURACY, COMPLETENESS
    }

    public enum ResolutionStatus { OPEN, IN_PROGRESS, RESOLVED }

    public enum TaskStatus { OPEN, IN_PROGRESS, DONE }

    public enum AnchorType { TARGET, RESULT, DOCUMENT }

    /** When a countdown notification fires relative to the regulatory deadline. */
    public enum NotificationOffset { THIRTY_DAYS, FIFTEEN_DAYS, HOURLY }
}
