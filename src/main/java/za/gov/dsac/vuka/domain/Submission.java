package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * One entity's report for one reporting period.
 */
@Entity
@Table(name = "submission")
public class Submission {

    @Id
    @GeneratedValue
    private UUID id;

    /** The submitting entity. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id")
    private PublicEntity entity;

    /** Period reported on. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reporting_period_id")
    private ReportingPeriod reportingPeriod;

    /** Lifecycle state. */
    @Enumerated(EnumType.STRING)
    private Enums.SubmissionStatus status;

    /** How it reached the system. */
    @Enumerated(EnumType.STRING)
    private Enums.SubmissionChannel channel;

    /** When the entity submitted. */
    private Instant submittedAt;

    /** Firebase uid of the submitter. */
    @Column(length = 128)
    private String submittedByUid;

    /** Display name of the submitter. */
    @Column(length = 200)
    private String submittedByName;

    /** Reviewer uid. */
    @Column(length = 128)
    private String reviewedByUid;

    /** When reviewed. */
    private Instant reviewedAt;

    /** Why it was returned, if it was. */
    @Column(length = 2000)
    private String returnReason;

    /** Row creation time. */
    @Column(nullable = false)
    private Instant createdAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PublicEntity getEntity() { return entity; }
    public void setEntity(PublicEntity entity) { this.entity = entity; }

    public ReportingPeriod getReportingPeriod() { return reportingPeriod; }
    public void setReportingPeriod(ReportingPeriod reportingPeriod) { this.reportingPeriod = reportingPeriod; }

    public Enums.SubmissionStatus getStatus() { return status; }
    public void setStatus(Enums.SubmissionStatus status) { this.status = status; }

    public Enums.SubmissionChannel getChannel() { return channel; }
    public void setChannel(Enums.SubmissionChannel channel) { this.channel = channel; }

    public Instant getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(Instant submittedAt) { this.submittedAt = submittedAt; }

    public String getSubmittedByUid() { return submittedByUid; }
    public void setSubmittedByUid(String submittedByUid) { this.submittedByUid = submittedByUid; }

    public String getSubmittedByName() { return submittedByName; }
    public void setSubmittedByName(String submittedByName) { this.submittedByName = submittedByName; }

    public String getReviewedByUid() { return reviewedByUid; }
    public void setReviewedByUid(String reviewedByUid) { this.reviewedByUid = reviewedByUid; }

    public Instant getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(Instant reviewedAt) { this.reviewedAt = reviewedAt; }

    public String getReturnReason() { return returnReason; }
    public void setReturnReason(String returnReason) { this.returnReason = returnReason; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
