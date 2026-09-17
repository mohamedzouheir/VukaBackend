package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A South African government financial year, April to March.
 */
@Entity
@Table(name = "financial_year")
public class FinancialYear {

    @Id
    @GeneratedValue
    private UUID id;

    /** Display label, for example 2026/27. */
    @Column(nullable = false, length = 20)
    private String label;

    /** First day of the year. */
    private LocalDate startDate;

    /** Last day of the year. */
    private LocalDate endDate;

    /** Whether this is the active reporting year. */
    @Column(name = "is_current", nullable = false)
    private boolean current;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }

    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }

    public boolean isCurrent() { return current; }
    public void setCurrent(boolean current) { this.current = current; }
}
