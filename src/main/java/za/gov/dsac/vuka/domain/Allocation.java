package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Money committed to a funded body for a financial year. First link in the accountability chain.
 */
@Entity
@Table(name = "allocation")
public class Allocation {

    @Id
    @GeneratedValue
    private UUID id;

    /** The funded body. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id")
    private PublicEntity entity;

    /** Year of the allocation. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "financial_year_id")
    private FinancialYear financialYear;

    /** DSAC programme it sits under. */
    @Column(length = 500)
    private String programme;

    /** Amount in rand. */
    @Column(precision = 18, scale = 2)
    private BigDecimal amount;

    /** Date approved. */
    private LocalDate dateApproved;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PublicEntity getEntity() { return entity; }
    public void setEntity(PublicEntity entity) { this.entity = entity; }

    public FinancialYear getFinancialYear() { return financialYear; }
    public void setFinancialYear(FinancialYear financialYear) { this.financialYear = financialYear; }

    public String getProgramme() { return programme; }
    public void setProgramme(String programme) { this.programme = programme; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public LocalDate getDateApproved() { return dateApproved; }
    public void setDateApproved(LocalDate dateApproved) { this.dateApproved = dateApproved; }
}
