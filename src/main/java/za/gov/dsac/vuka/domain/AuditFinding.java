package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A historical Auditor-General outcome. Repeat findings are weighted heavily in the risk score.
 */
@Entity
@Table(name = "audit_finding")
public class AuditFinding {

    @Id
    @GeneratedValue
    private UUID id;

    /** Entity audited. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id")
    private PublicEntity entity;

    /** Year audited. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "financial_year_id")
    private FinancialYear financialYear;

    /** Overall outcome. */
    @Enumerated(EnumType.STRING)
    private Enums.AuditOutcome outcome;

    /** The finding. */
    @Column(length = 2000)
    private String description;

    /** Whether it repeats a prior year. */
    @Column(name = "is_repeat_finding", nullable = false)
    private boolean repeatFinding;

    /** Whether it has been dealt with. */
    @Enumerated(EnumType.STRING)
    private Enums.ResolutionStatus resolutionStatus;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PublicEntity getEntity() { return entity; }
    public void setEntity(PublicEntity entity) { this.entity = entity; }

    public FinancialYear getFinancialYear() { return financialYear; }
    public void setFinancialYear(FinancialYear financialYear) { this.financialYear = financialYear; }

    public Enums.AuditOutcome getOutcome() { return outcome; }
    public void setOutcome(Enums.AuditOutcome outcome) { this.outcome = outcome; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public boolean isRepeatFinding() { return repeatFinding; }
    public void setRepeatFinding(boolean repeatFinding) { this.repeatFinding = repeatFinding; }

    public Enums.ResolutionStatus getResolutionStatus() { return resolutionStatus; }
    public void setResolutionStatus(Enums.ResolutionStatus resolutionStatus) { this.resolutionStatus = resolutionStatus; }
}
