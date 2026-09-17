package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

/**
 * One contributing factor behind a risk score.
 *
 * Signals are stored, not derived on the fly, for one reason: the interface must
 * always be able to show <em>why</em> a score is what it is, including for a score
 * computed weeks ago. A stored signal with its weight and its contribution is an
 * auditable record of the reasoning. A recomputed one is not.
 */
@Entity
@Table(name = "risk_signal")
public class RiskSignal {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "risk_score_id")
    private RiskScore riskScore;

    @Enumerated(EnumType.STRING)
    private Enums.RiskSignalType type;

    /** Raw observed value, in the signal's own units: days late, percentage points, a count. */
    @Column(precision = 18, scale = 4)
    private BigDecimal value;

    /** The raw value mapped onto 0..1, so signals in different units can be summed. */
    @Column(precision = 18, scale = 4)
    private BigDecimal normalised;

    /** Fixed weight from RiskEngine. Stored so a historical score stays explainable if weights change. */
    @Column(precision = 18, scale = 4)
    private BigDecimal weight;

    /** normalised * weight * 100. What this signal added to the score. */
    @Column(precision = 18, scale = 4)
    private BigDecimal contribution;

    /** Plain language, written for a reviewer to read on screen. Never hidden behind a tooltip. */
    @Column(length = 500)
    private String description;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public RiskScore getRiskScore() { return riskScore; }
    public void setRiskScore(RiskScore riskScore) { this.riskScore = riskScore; }

    public Enums.RiskSignalType getType() { return type; }
    public void setType(Enums.RiskSignalType type) { this.type = type; }

    public BigDecimal getValue() { return value; }
    public void setValue(BigDecimal value) { this.value = value; }

    public BigDecimal getNormalised() { return normalised; }
    public void setNormalised(BigDecimal normalised) { this.normalised = normalised; }

    public BigDecimal getWeight() { return weight; }
    public void setWeight(BigDecimal weight) { this.weight = weight; }

    public BigDecimal getContribution() { return contribution; }
    public void setContribution(BigDecimal contribution) { this.contribution = contribution; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}
