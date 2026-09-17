package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A quarter or annual reporting window, with the deadlines that drive the countdowns.
 */
@Entity
@Table(name = "reporting_period")
public class ReportingPeriod {

    @Id
    @GeneratedValue
    private UUID id;

    /** Year this period belongs to. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "financial_year_id")
    private FinancialYear financialYear;

    /** For example Q2 2026/27. */
    @Column(nullable = false, length = 50)
    private String label;

    /** 1 to 4, or null for the annual period. */
    private Integer quarter;

    /** First day reported on. */
    private LocalDate periodStart;

    /** Last day reported on. */
    private LocalDate periodEnd;

    /**
     * When the department expects the submission. Drives the 30 day, 15 day and hourly
     * countdowns. For quarterly performance reporting by a Schedule 3A entity this is a
     * departmental instruction, because no regulation sets a day count for it.
     */
    private LocalDate submissionDueDate;

    /**
     * The statutory date, where one exists. Null for quarterly performance periods, and the
     * nullability is the honest part. Treasury Regulation 30.2.1 requires quarterly reporting
     * of progress against targets to the executive authority and sets no deadline at all. The
     * thirty days people quote comes from TR 26.1.1, which governs revenue and expenditure.
     */
    private LocalDate regulatoryDeadline;

    /**
     * What the dates above rest on. Stored so the interface can say "statutory" or "the
     * department asked for this" rather than implying an Act that is not there. An entity
     * arguing about a due date is entitled to know which one it is.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "deadline_basis", length = 60)
    private Enums.DeadlineBasis deadlineBasis;

    /** The instrument and section, verbatim, for display beside the date. */
    @Column(name = "deadline_citation", length = 300)
    private String deadlineCitation;

    /** True where {@link #deadlineBasis} is one of the PFMA provisions rather than an instruction. */
    public boolean isStatutory() {
        return deadlineBasis != null
                && deadlineBasis != Enums.DeadlineBasis.DEPARTMENTAL_INSTRUCTION
                && deadlineBasis != Enums.DeadlineBasis.TR_30_2_1_QUARTERLY_PERFORMANCE;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public FinancialYear getFinancialYear() { return financialYear; }
    public void setFinancialYear(FinancialYear financialYear) { this.financialYear = financialYear; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public Integer getQuarter() { return quarter; }
    public void setQuarter(Integer quarter) { this.quarter = quarter; }

    public LocalDate getPeriodStart() { return periodStart; }
    public void setPeriodStart(LocalDate periodStart) { this.periodStart = periodStart; }

    public LocalDate getPeriodEnd() { return periodEnd; }
    public void setPeriodEnd(LocalDate periodEnd) { this.periodEnd = periodEnd; }

    public LocalDate getSubmissionDueDate() { return submissionDueDate; }
    public void setSubmissionDueDate(LocalDate submissionDueDate) { this.submissionDueDate = submissionDueDate; }

    public LocalDate getRegulatoryDeadline() { return regulatoryDeadline; }
    public void setRegulatoryDeadline(LocalDate regulatoryDeadline) { this.regulatoryDeadline = regulatoryDeadline; }

    public Enums.DeadlineBasis getDeadlineBasis() { return deadlineBasis; }
    public void setDeadlineBasis(Enums.DeadlineBasis deadlineBasis) { this.deadlineBasis = deadlineBasis; }

    public String getDeadlineCitation() { return deadlineCitation; }
    public void setDeadlineCitation(String deadlineCitation) { this.deadlineCitation = deadlineCitation; }
}
