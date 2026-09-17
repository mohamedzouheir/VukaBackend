package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A value read out of an uploaded template, awaiting human confirmation. Deliberately a separate table from TargetResult: that separation is what makes human-in-the-loop structural rather than procedural.
 */
@Entity
@Table(name = "extraction_result")
public class ExtractionResult {

    @Id
    @GeneratedValue
    private UUID id;

    /** Submission being parsed. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "submission_id")
    private Submission submission;

    /** Document parsed. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_record_id")
    private DocumentRecord documentRecord;

    /** Matched target, or null when matching failed. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_id")
    private Target target;

    /** Indicator reference as it appeared in the file. */
    @Column(length = 50)
    private String indicatorRef;

    /** Which field was read, for example actualValue. */
    @Column(length = 100)
    private String fieldName;

    /** Raw value as read. */
    @Column(length = 2000)
    private String extractedValue;

    /** Sheet and cell, for example 'Quarterly Report!H14'. */
    @Column(length = 200)
    private String sourceLocation;

    /** Parser confidence, 0 to 1. */
    @Column(precision = 5, scale = 4)
    private BigDecimal confidence;

    /** False until a human confirms. */
    @Column(name = "is_confirmed", nullable = false)
    private boolean confirmed;

    /** True when no registered target matched this row. */
    @Column(nullable = false)
    private boolean needsManualMatch;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public Submission getSubmission() { return submission; }
    public void setSubmission(Submission submission) { this.submission = submission; }

    public DocumentRecord getDocumentRecord() { return documentRecord; }
    public void setDocumentRecord(DocumentRecord documentRecord) { this.documentRecord = documentRecord; }

    public Target getTarget() { return target; }
    public void setTarget(Target target) { this.target = target; }

    public String getIndicatorRef() { return indicatorRef; }
    public void setIndicatorRef(String indicatorRef) { this.indicatorRef = indicatorRef; }

    public String getFieldName() { return fieldName; }
    public void setFieldName(String fieldName) { this.fieldName = fieldName; }

    public String getExtractedValue() { return extractedValue; }
    public void setExtractedValue(String extractedValue) { this.extractedValue = extractedValue; }

    public String getSourceLocation() { return sourceLocation; }
    public void setSourceLocation(String sourceLocation) { this.sourceLocation = sourceLocation; }

    public BigDecimal getConfidence() { return confidence; }
    public void setConfidence(BigDecimal confidence) { this.confidence = confidence; }

    public boolean isConfirmed() { return confirmed; }
    public void setConfirmed(boolean confirmed) { this.confirmed = confirmed; }

    public boolean isNeedsManualMatch() { return needsManualMatch; }
    public void setNeedsManualMatch(boolean needsManualMatch) { this.needsManualMatch = needsManualMatch; }
}
