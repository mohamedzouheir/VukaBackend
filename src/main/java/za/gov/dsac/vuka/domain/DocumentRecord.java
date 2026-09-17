package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A document in the repository, versioned on re-upload.
 */
@Entity
@Table(name = "document_record")
public class DocumentRecord {

    @Id
    @GeneratedValue
    private UUID id;

    /** Owning entity. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id")
    private PublicEntity entity;

    /** Submission it supports, where applicable. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "submission_id")
    private Submission submission;

    /** What kind of document. */
    @Enumerated(EnumType.STRING)
    private Enums.DocumentType documentType;

    /** Original filename. */
    @Column(length = 500)
    private String fileName;

    /** Where the bytes live. */
    @Column(length = 1000)
    private String storagePath;

    /** File size. */
    private long sizeBytes;

    /** Increments on re-upload of the same type. */
    @Column(nullable = false)
    private int version;

    /** Uploader uid. */
    @Column(length = 128)
    private String uploadedByUid;

    /** Upload time. */
    private Instant uploadedAt;

    /** Whether DSAC accepted it. */
    @Enumerated(EnumType.STRING)
    private Enums.ApprovalStatus approvalStatus;

    /**
     * Which of the Auditor-General's tests this document is offered against.
     *
     * <p>This one field is the difference between a document repository and an audit readiness
     * tool. Under section 20(2) of the Public Audit Act the AG forms an opinion on reported
     * performance, and the reliability test asks whether a figure can be traced back to source
     * data and whether it is valid, accurate and complete. An attendance register is offered
     * for {@code VALIDITY}. A reconciliation against a booking system is offered for
     * {@code COMPLETENESS}. A folder of PDFs answers neither question.
     *
     * <p>Null means the uploader did not say, which is itself worth surfacing to a reviewer.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "agsa_criterion", length = 30)
    private Enums.AgsaCriterion agsaCriterion;

    /**
     * Content hash of the stored bytes. A reviewer opening evidence six months after the fact
     * needs to know it is the file that was attached, not a file that replaced it.
     */
    @Column(name = "content_hash", length = 128)
    private String contentHash;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PublicEntity getEntity() { return entity; }
    public void setEntity(PublicEntity entity) { this.entity = entity; }

    public Submission getSubmission() { return submission; }
    public void setSubmission(Submission submission) { this.submission = submission; }

    public Enums.DocumentType getDocumentType() { return documentType; }
    public void setDocumentType(Enums.DocumentType documentType) { this.documentType = documentType; }

    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }

    public String getStoragePath() { return storagePath; }
    public void setStoragePath(String storagePath) { this.storagePath = storagePath; }

    public long getSizeBytes() { return sizeBytes; }
    public void setSizeBytes(long sizeBytes) { this.sizeBytes = sizeBytes; }

    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }

    public String getUploadedByUid() { return uploadedByUid; }
    public void setUploadedByUid(String uploadedByUid) { this.uploadedByUid = uploadedByUid; }

    public Instant getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(Instant uploadedAt) { this.uploadedAt = uploadedAt; }

    public Enums.ApprovalStatus getApprovalStatus() { return approvalStatus; }
    public void setApprovalStatus(Enums.ApprovalStatus approvalStatus) { this.approvalStatus = approvalStatus; }

    public Enums.AgsaCriterion getAgsaCriterion() { return agsaCriterion; }
    public void setAgsaCriterion(Enums.AgsaCriterion agsaCriterion) { this.agsaCriterion = agsaCriterion; }

    public String getContentHash() { return contentHash; }
    public void setContentHash(String contentHash) { this.contentHash = contentHash; }
}
