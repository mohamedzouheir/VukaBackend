package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A performance commitment from an entity's Annual Performance Plan. Second link in the chain.
 *
 * <h2>Why this is versioned and not editable</h2>
 *
 * Section 4.4.4 of the 2019 Revised Framework for Strategic Plans and Annual Performance Plans
 * allows an Annual Performance Plan to be revised in exactly two situations: the Strategic Plan
 * was revised, or targets changed through the in-year budget adjustment process. In both cases
 * the executive authority approves and the change takes effect by <em>re-tabling the APP in the
 * legislature</em>, aligned to the adjustments budget.
 *
 * Being about to miss a target is not on that list. So a target here is never edited. A change
 * closes the current version with a {@link #supersededOn} date and opens a new one carrying the
 * trigger and the re-tabling reference. National Treasury's Annual Report Guide then requires
 * the entity to disclose performance up to the date of re-tabling separately from performance
 * after it, and a versioned row is the only shape that can answer that.
 *
 * A system that lets a number be quietly edited has made performance unfalsifiable, which is
 * itself the thing the revision churn signal is trying to detect.
 */
@Entity
@Table(name = "target")
public class Target {

    @Id
    @GeneratedValue
    private UUID id;

    /** The entity that committed. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id")
    private PublicEntity entity;

    /** Year of the commitment. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "financial_year_id")
    private FinancialYear financialYear;

    /** Allocation funding this target. Needed for unit cost. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "allocation_id")
    private Allocation allocation;

    /** Match key used by the template parser, for example 1.1.1. */
    @Column(length = 50)
    private String indicatorRef;

    /** Outcome this contributes to. */
    @Column(length = 1000)
    private String outcomeStatement;

    /** Output committed to. */
    @Column(length = 1000)
    private String outputStatement;

    /** Indicator as worded in the APP. */
    @Column(length = 1000)
    private String indicator;

    /** What is being counted. */
    @Column(length = 200)
    private String unitOfMeasure;

    /** Prior year actual, from the APP. */
    @Column(precision = 18, scale = 2)
    private BigDecimal baseline;

    /** Full year target. */
    @Column(precision = 18, scale = 2)
    private BigDecimal annualTarget;

    /** Q1 target. */
    @Column(precision = 18, scale = 2)
    private BigDecimal q1Target;

    /** Q2 target. */
    @Column(precision = 18, scale = 2)
    private BigDecimal q2Target;

    /** Q3 target. */
    @Column(precision = 18, scale = 2)
    private BigDecimal q3Target;

    /** Q4 target. */
    @Column(precision = 18, scale = 2)
    private BigDecimal q4Target;

    /** Allocation divided by annual target. The denominator of the planned versus actual comparison. */
    @Column(precision = 18, scale = 2)
    private BigDecimal plannedUnitCost;

    /** Times restated mid-year. Feeds the churn signal. Derived from the version chain. */
    @Column(nullable = false)
    private int revisionCount;

    // ------------------------------------------------------------------
    // Versioning. See the class comment for why none of this is optional.
    // ------------------------------------------------------------------

    /** 1 for the target as originally tabled. Incremented on each re-tabling. */
    @Column(name = "version", nullable = false)
    private int version = 1;

    /** The version this one replaced. Null for version 1. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "supersedes_id")
    private Target supersedes;

    /** From when this version is the commitment of record. The APP tabling or re-tabling date. */
    @Column(name = "effective_from")
    private LocalDate effectiveFrom;

    /** When this version stopped being current. Null means it is the version in force. */
    @Column(name = "superseded_on")
    private LocalDate supersededOn;

    /**
     * Which of the two lawful triggers produced this version. Null on version 1, which was not
     * a revision. A version 2 or later with no trigger is a data error, and it is the kind of
     * data error the Auditor-General asks about.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "revision_trigger", length = 40)
    private Enums.RevisionTrigger revisionTrigger;

    /** Reference to the re-tabled APP, so the change can be traced to a document in Parliament. */
    @Column(name = "retabling_reference", length = 300)
    private String retablingReference;

    /** True where this is the version currently in force. */
    public boolean isCurrent() {
        return supersededOn == null;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PublicEntity getEntity() { return entity; }
    public void setEntity(PublicEntity entity) { this.entity = entity; }

    public FinancialYear getFinancialYear() { return financialYear; }
    public void setFinancialYear(FinancialYear financialYear) { this.financialYear = financialYear; }

    public Allocation getAllocation() { return allocation; }
    public void setAllocation(Allocation allocation) { this.allocation = allocation; }

    public String getIndicatorRef() { return indicatorRef; }
    public void setIndicatorRef(String indicatorRef) { this.indicatorRef = indicatorRef; }

    public String getOutcomeStatement() { return outcomeStatement; }
    public void setOutcomeStatement(String outcomeStatement) { this.outcomeStatement = outcomeStatement; }

    public String getOutputStatement() { return outputStatement; }
    public void setOutputStatement(String outputStatement) { this.outputStatement = outputStatement; }

    public String getIndicator() { return indicator; }
    public void setIndicator(String indicator) { this.indicator = indicator; }

    public String getUnitOfMeasure() { return unitOfMeasure; }
    public void setUnitOfMeasure(String unitOfMeasure) { this.unitOfMeasure = unitOfMeasure; }

    public BigDecimal getBaseline() { return baseline; }
    public void setBaseline(BigDecimal baseline) { this.baseline = baseline; }

    public BigDecimal getAnnualTarget() { return annualTarget; }
    public void setAnnualTarget(BigDecimal annualTarget) { this.annualTarget = annualTarget; }

    public BigDecimal getQ1Target() { return q1Target; }
    public void setQ1Target(BigDecimal q1Target) { this.q1Target = q1Target; }

    public BigDecimal getQ2Target() { return q2Target; }
    public void setQ2Target(BigDecimal q2Target) { this.q2Target = q2Target; }

    public BigDecimal getQ3Target() { return q3Target; }
    public void setQ3Target(BigDecimal q3Target) { this.q3Target = q3Target; }

    public BigDecimal getQ4Target() { return q4Target; }
    public void setQ4Target(BigDecimal q4Target) { this.q4Target = q4Target; }

    public BigDecimal getPlannedUnitCost() { return plannedUnitCost; }
    public void setPlannedUnitCost(BigDecimal plannedUnitCost) { this.plannedUnitCost = plannedUnitCost; }

    public int getRevisionCount() { return revisionCount; }
    public void setRevisionCount(int revisionCount) { this.revisionCount = revisionCount; }

    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }

    public Target getSupersedes() { return supersedes; }
    public void setSupersedes(Target supersedes) { this.supersedes = supersedes; }

    public LocalDate getEffectiveFrom() { return effectiveFrom; }
    public void setEffectiveFrom(LocalDate effectiveFrom) { this.effectiveFrom = effectiveFrom; }

    public LocalDate getSupersededOn() { return supersededOn; }
    public void setSupersededOn(LocalDate supersededOn) { this.supersededOn = supersededOn; }

    public Enums.RevisionTrigger getRevisionTrigger() { return revisionTrigger; }
    public void setRevisionTrigger(Enums.RevisionTrigger revisionTrigger) { this.revisionTrigger = revisionTrigger; }

    public String getRetablingReference() { return retablingReference; }
    public void setRetablingReference(String retablingReference) { this.retablingReference = retablingReference; }
}
