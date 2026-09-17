package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Actual delivery against one target for one period. Written only when a named human confirms it, and never updated afterwards.
 */
@Entity
@Table(name = "target_result")
public class TargetResult {

    @Id
    @GeneratedValue
    private UUID id;

    /** The target reported against. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_id")
    private Target target;

    /** Submission it arrived in. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "submission_id")
    private Submission submission;

    /** Denormalised for convenience in exports. */
    @Column(length = 50)
    private String indicatorRef;

    /** What was delivered. */
    @Column(precision = 18, scale = 2)
    private BigDecimal actualValue;

    /** Target for the period, captured at confirm time. */
    @Column(precision = 18, scale = 2)
    private BigDecimal quarterTarget;

    /** Actual minus quarter target. */
    @Column(precision = 18, scale = 2)
    private BigDecimal variance;

    /** Required where the target was missed. */
    @Column(length = 2000)
    private String varianceExplanation;

    /** Cumulative spend against this target. */
    @Column(precision = 18, scale = 2)
    private BigDecimal spendToDate;

    /** Spend divided by actual delivery. */
    @Column(precision = 18, scale = 2)
    private BigDecimal actualUnitCost;

    /** Delivery state for the period. */
    @Enumerated(EnumType.STRING)
    private Enums.TargetStatus status;

    /** Who confirmed it. Never a service account. */
    @Column(nullable = false, length = 128)
    private String confirmedByUid;

    /** Display name of the confirmer. */
    @Column(length = 200)
    private String confirmedByName;

    /** When it was confirmed. */
    @Column(nullable = false)
    private Instant confirmedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public Target getTarget() { return target; }
    public void setTarget(Target target) { this.target = target; }

    public Submission getSubmission() { return submission; }
    public void setSubmission(Submission submission) { this.submission = submission; }

    public String getIndicatorRef() { return indicatorRef; }
    public void setIndicatorRef(String indicatorRef) { this.indicatorRef = indicatorRef; }

    public BigDecimal getActualValue() { return actualValue; }
    public void setActualValue(BigDecimal actualValue) { this.actualValue = actualValue; }

    public BigDecimal getQuarterTarget() { return quarterTarget; }
    public void setQuarterTarget(BigDecimal quarterTarget) { this.quarterTarget = quarterTarget; }

    public BigDecimal getVariance() { return variance; }
    public void setVariance(BigDecimal variance) { this.variance = variance; }

    public String getVarianceExplanation() { return varianceExplanation; }
    public void setVarianceExplanation(String varianceExplanation) { this.varianceExplanation = varianceExplanation; }

    public BigDecimal getSpendToDate() { return spendToDate; }
    public void setSpendToDate(BigDecimal spendToDate) { this.spendToDate = spendToDate; }

    public BigDecimal getActualUnitCost() { return actualUnitCost; }
    public void setActualUnitCost(BigDecimal actualUnitCost) { this.actualUnitCost = actualUnitCost; }

    public Enums.TargetStatus getStatus() { return status; }
    public void setStatus(Enums.TargetStatus status) { this.status = status; }

    public String getConfirmedByUid() { return confirmedByUid; }
    public void setConfirmedByUid(String confirmedByUid) { this.confirmedByUid = confirmedByUid; }

    public String getConfirmedByName() { return confirmedByName; }
    public void setConfirmedByName(String confirmedByName) { this.confirmedByName = confirmedByName; }

    public Instant getConfirmedAt() { return confirmedAt; }
    public void setConfirmedAt(Instant confirmedAt) { this.confirmedAt = confirmedAt; }
}
