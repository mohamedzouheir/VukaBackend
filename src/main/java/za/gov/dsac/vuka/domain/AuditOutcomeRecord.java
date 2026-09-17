package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.util.UUID;

/**
 * What an entity's year actually came to: the audit opinion, and how many of its annual targets
 * it achieved.
 *
 * <h2>Why this is not part of {@link AuditFinding}</h2>
 *
 * An entity has one audit outcome per financial year. It may have any number of findings, or
 * none. Storing the outcome on each finding row means an entity with no findings has no outcome,
 * which is precisely backwards for the two cases that matter most: a clean audit, and an audit
 * that was never completed. Separating them lets the model say "clean, zero findings" and
 * "outstanding, no findings because there was no audit" without either one masquerading as the
 * other.
 *
 * <h2>Why targets achieved lives here</h2>
 *
 * "18 of 19 annual targets achieved" is the single most defensible number an entity publishes.
 * It is in Part B of every annual report, the Auditor-General tests it, and a parliamentary
 * committee quotes it back. It is also how anyone checks that our risk scoring agrees with
 * reality: if the engine ranks an entity badly that achieved everything it promised, the weights
 * are wrong and this column is what proves it.
 *
 * <h2>Nullability is meaningful here</h2>
 *
 * {@code findingsTotal} and {@code findingsRepeat} are boxed and nullable on purpose. Annual
 * reports rarely carry a numeric count of findings; that count lives in the Auditor-General's
 * management reports, which are not published. Null means not published. Zero means published
 * as zero. A system that collapses those two has quietly invented a clean audit.
 */
@Entity
@Table(name = "audit_outcome_record",
       uniqueConstraints = @UniqueConstraint(columnNames = {"entity_id", "financial_year_id"}))
public class AuditOutcomeRecord {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id")
    private PublicEntity entity;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "financial_year_id")
    private FinancialYear financialYear;

    /** The Auditor-General's opinion, in the AG's own vocabulary. OUTSTANDING means no opinion. */
    @Enumerated(EnumType.STRING)
    @Column(name = "outcome", length = 40)
    private Enums.AuditOutcome outcome;

    /** Findings in the year. Null means not published, which is not the same as none. */
    @Column(name = "findings_total")
    private Integer findingsTotal;

    /** How many of those repeat a prior year. Null means not published. */
    @Column(name = "findings_repeat")
    private Integer findingsRepeat;

    /** Annual targets achieved, as reported in Part B of the annual report. */
    @Column(name = "targets_achieved")
    private Integer targetsAchieved;

    /** Annual targets set for the year. */
    @Column(name = "targets_total")
    private Integer targetsTotal;

    /** What the report said, in the report's own words where possible. */
    @Column(name = "note", length = 2000)
    private String note;

    /** Where this came from, so a reviewer can go and read it. */
    @Column(name = "source_reference", length = 500)
    private String sourceReference;

    /** True where the audit was not completed and the entity was excluded from portfolio outcomes. */
    public boolean isOutstanding() {
        return outcome == Enums.AuditOutcome.OUTSTANDING;
    }

    /**
     * Share of annual targets achieved, or null where either figure is unpublished. Deliberately
     * returns null rather than zero, for the same reason the counts are boxed.
     */
    public Double achievementRate() {
        if (targetsAchieved == null || targetsTotal == null || targetsTotal == 0) return null;
        return (double) targetsAchieved / targetsTotal;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PublicEntity getEntity() { return entity; }
    public void setEntity(PublicEntity entity) { this.entity = entity; }

    public FinancialYear getFinancialYear() { return financialYear; }
    public void setFinancialYear(FinancialYear financialYear) { this.financialYear = financialYear; }

    public Enums.AuditOutcome getOutcome() { return outcome; }
    public void setOutcome(Enums.AuditOutcome outcome) { this.outcome = outcome; }

    public Integer getFindingsTotal() { return findingsTotal; }
    public void setFindingsTotal(Integer findingsTotal) { this.findingsTotal = findingsTotal; }

    public Integer getFindingsRepeat() { return findingsRepeat; }
    public void setFindingsRepeat(Integer findingsRepeat) { this.findingsRepeat = findingsRepeat; }

    public Integer getTargetsAchieved() { return targetsAchieved; }
    public void setTargetsAchieved(Integer targetsAchieved) { this.targetsAchieved = targetsAchieved; }

    public Integer getTargetsTotal() { return targetsTotal; }
    public void setTargetsTotal(Integer targetsTotal) { this.targetsTotal = targetsTotal; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public String getSourceReference() { return sourceReference; }
    public void setSourceReference(String sourceReference) { this.sourceReference = sourceReference; }
}
