package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * An entity's risk score for a reporting period, with the signals that produced it.
 *
 * The score is never displayed alone. Every surface that shows a number shows the
 * signals beneath it, so a reviewer can disagree with any single input rather than
 * being asked to trust an aggregate.
 */
@Entity
@Table(name = "risk_score")
public class RiskScore {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id")
    private PublicEntity entity;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reporting_period_id")
    private ReportingPeriod reportingPeriod;

    /** 0 to 100. The weighted sum of contributions below. */
    @Column(precision = 18, scale = 4)
    private BigDecimal score;

    @Enumerated(EnumType.STRING)
    private Enums.RiskBand band;

    /** Score at the previous computation, so movement can be shown rather than just level. */
    @Column(precision = 18, scale = 4)
    private BigDecimal previousScore;

    @OneToMany(mappedBy = "riskScore", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<RiskSignal> signals = new ArrayList<>();

    @Column(nullable = false)
    private Instant computedAt;

    /** Keeps both sides of the relationship consistent. */
    public void addSignal(RiskSignal signal) {
        signal.setRiskScore(this);
        this.signals.add(signal);
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PublicEntity getEntity() { return entity; }
    public void setEntity(PublicEntity entity) { this.entity = entity; }

    public ReportingPeriod getReportingPeriod() { return reportingPeriod; }
    public void setReportingPeriod(ReportingPeriod reportingPeriod) { this.reportingPeriod = reportingPeriod; }

    public BigDecimal getScore() { return score; }
    public void setScore(BigDecimal score) { this.score = score; }

    public Enums.RiskBand getBand() { return band; }
    public void setBand(Enums.RiskBand band) { this.band = band; }

    public BigDecimal getPreviousScore() { return previousScore; }
    public void setPreviousScore(BigDecimal previousScore) { this.previousScore = previousScore; }

    public List<RiskSignal> getSignals() { return signals; }
    public void setSignals(List<RiskSignal> signals) { this.signals = signals; }

    public Instant getComputedAt() { return computedAt; }
    public void setComputedAt(Instant computedAt) { this.computedAt = computedAt; }
}
