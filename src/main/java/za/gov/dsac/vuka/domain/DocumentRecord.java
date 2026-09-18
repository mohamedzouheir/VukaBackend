package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * One version of one document in an entity's workspace.
 *
 * <h2>What a row is</h2>
 *
 * A row is a version, not a document. The document is the {@link #documentKey}: the file's path
 * inside the workspace, such as {@code ANNUAL_REPORT/annual-report-2025.pdf}. Every arrival of
 * that key writes a new row and stamps {@link #supersededOn} on the one before it, so the version
 * in force is the row never superseded and the ones before it stay readable exactly as they were.
 * Nothing here is updated in place and nothing is deleted, which is the same rule {@link Target}
 * follows and for the same reason: evidence that can be quietly replaced is not evidence.
 *
 * <h2>Receipt and approval are two different events</h2>
 *
 * {@link #receivedAt} with {@link #contentHash} is the receipt. It is automatic, it is issued the
 * moment the bytes land, and it says only that the department has the file. {@link #decidedAt}
 * with {@link #decidedByName} is a named DSAC officer accepting or rejecting it. The challenge
 * asks the solution to "indicate approval on receipt of upload"; an acknowledgement that reads as
 * a departmental decision would be the wrong answer to that, so both exist and the surfaces show
 * them apart.
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

    /**
     * Path of this document inside the entity workspace, and the identity of the version chain.
     *
     * <p>It is also the path used in the bound Microsoft drive, which is what lets a file saved
     * in SharePoint and a file uploaded through Vuka land on the same chain instead of becoming
     * two documents that happen to look alike.
     */
    @Column(name = "document_key", nullable = false, length = 500)
    private String documentKey;

    /** Original filename. */
    @Column(length = 500)
    private String fileName;

    /** Where the bytes live. */
    @Column(length = 1000)
    private String storagePath;

    /** Media type as received. Stored so a download can be served as what it is. */
    @Column(name = "content_type", length = 200)
    private String contentType;

    /** File size. */
    private long sizeBytes;

    /** Increments on each new version of this key. Version 1 is the first arrival. */
    @Column(nullable = false)
    private int version;

    /** The version this one replaced. Null for version 1. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "supersedes_id")
    private DocumentRecord supersedes;

    /** When a newer version arrived. Null means this is the version in force. */
    @Column(name = "superseded_on")
    private Instant supersededOn;

    /** Whether the bytes were uploaded to Vuka or picked up from a save in Microsoft 365. */
    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 40)
    private Enums.DocumentSource source;

    /** Uploader uid. */
    @Column(length = 128)
    private String uploadedByUid;

    /** Upload time. */
    private Instant uploadedAt;

    /** Reference the reporter can quote. Derived from the row, unique, and safe to read aloud. */
    @Column(name = "receipt_number", length = 60)
    private String receiptNumber;

    /** When Vuka took custody of the bytes. Automatic. Not a departmental decision. */
    @Column(name = "received_at")
    private Instant receivedAt;

    /** Whether DSAC accepted it. PENDING until a named officer looks at it. */
    @Enumerated(EnumType.STRING)
    private Enums.ApprovalStatus approvalStatus;

    /** The officer who approved or rejected this version. */
    @Column(name = "decided_by_uid", length = 128)
    private String decidedByUid;

    @Column(name = "decided_by_name", length = 200)
    private String decidedByName;

    @Column(name = "decided_at")
    private Instant decidedAt;

    /** Why, in their words. Required on a rejection, because "rejected" alone is not actionable. */
    @Column(name = "decision_note", length = 2000)
    private String decisionNote;

    // ---- Microsoft 365 provenance -------------------------------------------------------
    //
    // Recorded rather than assumed. A deployment with no tenant bound is an ordinary deployment,
    // and graphSyncState says NOT_CONFIGURED rather than leaving null to mean "unknown, pending,
    // failed or never attempted" all at once.

    @Column(name = "graph_drive_id", length = 200)
    private String graphDriveId;

    @Column(name = "graph_item_id", length = 255)
    private String graphItemId;

    /** SharePoint's own version label, such as 3.0, beside Vuka's integer version. */
    @Column(name = "graph_version_label", length = 50)
    private String graphVersionLabel;

    /** Where a reviewer with a Microsoft account can open the file in the browser. */
    @Column(name = "graph_web_url", length = 1000)
    private String graphWebUrl;

    @Column(name = "graph_synced_at")
    private Instant graphSyncedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "graph_sync_state", length = 30)
    private Enums.GraphSyncState graphSyncState;

    @Column(name = "graph_sync_error", length = 1000)
    private String graphSyncError;

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
     * The target this document is offered as evidence for.
     *
     * <p>Null where the document belongs to the filing as a whole rather than to one indicator,
     * which is the case for the uploaded reporting template itself. Before V3 this link was a
     * filename convention, and a filename convention is not a link: it fails the moment somebody
     * uploads "scan001.pdf", and it fails silently. The claim this product makes is that a
     * reported figure carries the document behind it, so the join that carries the claim is a
     * foreign key.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_id")
    private Target target;

    /**
     * Content hash of the stored bytes. A reviewer opening evidence six months after the fact
     * needs to know it is the file that was attached, not a file that replaced it.
     */
    @Column(name = "content_hash", length = 128)
    private String contentHash;

    /** True where this is the version currently in force. */
    public boolean isCurrent() {
        return supersededOn == null;
    }

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

    public Target getTarget() { return target; }
    public void setTarget(Target target) { this.target = target; }

    public String getContentHash() { return contentHash; }
    public void setContentHash(String contentHash) { this.contentHash = contentHash; }

    public String getDocumentKey() { return documentKey; }
    public void setDocumentKey(String documentKey) { this.documentKey = documentKey; }

    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }

    public DocumentRecord getSupersedes() { return supersedes; }
    public void setSupersedes(DocumentRecord supersedes) { this.supersedes = supersedes; }

    public Instant getSupersededOn() { return supersededOn; }
    public void setSupersededOn(Instant supersededOn) { this.supersededOn = supersededOn; }

    public Enums.DocumentSource getSource() { return source; }
    public void setSource(Enums.DocumentSource source) { this.source = source; }

    public String getReceiptNumber() { return receiptNumber; }
    public void setReceiptNumber(String receiptNumber) { this.receiptNumber = receiptNumber; }

    public Instant getReceivedAt() { return receivedAt; }
    public void setReceivedAt(Instant receivedAt) { this.receivedAt = receivedAt; }

    public String getDecidedByUid() { return decidedByUid; }
    public void setDecidedByUid(String decidedByUid) { this.decidedByUid = decidedByUid; }

    public String getDecidedByName() { return decidedByName; }
    public void setDecidedByName(String decidedByName) { this.decidedByName = decidedByName; }

    public Instant getDecidedAt() { return decidedAt; }
    public void setDecidedAt(Instant decidedAt) { this.decidedAt = decidedAt; }

    public String getDecisionNote() { return decisionNote; }
    public void setDecisionNote(String decisionNote) { this.decisionNote = decisionNote; }

    public String getGraphDriveId() { return graphDriveId; }
    public void setGraphDriveId(String graphDriveId) { this.graphDriveId = graphDriveId; }

    public String getGraphItemId() { return graphItemId; }
    public void setGraphItemId(String graphItemId) { this.graphItemId = graphItemId; }

    public String getGraphVersionLabel() { return graphVersionLabel; }
    public void setGraphVersionLabel(String graphVersionLabel) { this.graphVersionLabel = graphVersionLabel; }

    public String getGraphWebUrl() { return graphWebUrl; }
    public void setGraphWebUrl(String graphWebUrl) { this.graphWebUrl = graphWebUrl; }

    public Instant getGraphSyncedAt() { return graphSyncedAt; }
    public void setGraphSyncedAt(Instant graphSyncedAt) { this.graphSyncedAt = graphSyncedAt; }

    public Enums.GraphSyncState getGraphSyncState() { return graphSyncState; }
    public void setGraphSyncState(Enums.GraphSyncState graphSyncState) { this.graphSyncState = graphSyncState; }

    public String getGraphSyncError() { return graphSyncError; }
    public void setGraphSyncError(String graphSyncError) { this.graphSyncError = graphSyncError; }
}
