package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Staff demographics and jobs created. Aggregate only; the system never holds individual records.
 */
@Entity
@Table(name = "workforce_stat")
public class WorkforceStat {

    @Id
    @GeneratedValue
    private UUID id;

    /** Entity reporting. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id")
    private PublicEntity entity;

    /** Period reported. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reporting_period_id")
    private ReportingPeriod reportingPeriod;

    /** Total permanent headcount. */
    // Every count below is boxed on purpose. A primitive int defaults to zero, and zero is a
    // claim: no women on the staff, nobody with a disability. For a named real public entity that
    // is not a harmless default, it is a false statement about people. Null means not captured,
    // and any surface reading these renders null as "not reported" rather than as a figure.
    private Integer headcount;

    /** Jobs created in the period. */
    private Integer jobsCreated;

    /** Aggregate identifying as female. */
    private Integer femaleCount;

    /** Aggregate identifying as male. */
    private Integer maleCount;

    /** Aggregate aged 35 or under. */
    private Integer youthCount;

    /** Aggregate declaring a disability. */
    private Integer disabilityCount;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PublicEntity getEntity() { return entity; }
    public void setEntity(PublicEntity entity) { this.entity = entity; }

    public ReportingPeriod getReportingPeriod() { return reportingPeriod; }
    public void setReportingPeriod(ReportingPeriod reportingPeriod) { this.reportingPeriod = reportingPeriod; }

    public Integer getHeadcount() { return headcount; }
    public void setHeadcount(Integer headcount) { this.headcount = headcount; }

    public Integer getJobsCreated() { return jobsCreated; }
    public void setJobsCreated(Integer jobsCreated) { this.jobsCreated = jobsCreated; }

    public Integer getFemaleCount() { return femaleCount; }
    public void setFemaleCount(Integer femaleCount) { this.femaleCount = femaleCount; }

    public Integer getMaleCount() { return maleCount; }
    public void setMaleCount(Integer maleCount) { this.maleCount = maleCount; }

    public Integer getYouthCount() { return youthCount; }
    public void setYouthCount(Integer youthCount) { this.youthCount = youthCount; }

    public Integer getDisabilityCount() { return disabilityCount; }
    public void setDisabilityCount(Integer disabilityCount) { this.disabilityCount = disabilityCount; }
}
