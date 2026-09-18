package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import za.gov.dsac.vuka.domain.*;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface DocumentRecordRepository extends JpaRepository<DocumentRecord, UUID> {

    List<DocumentRecord> findByEntityIdOrderByUploadedAtDesc(UUID entityId);
    List<DocumentRecord> findByEntityIdAndDocumentType(UUID entityId, Enums.DocumentType documentType);

    /** Everything attached to one filing, which is what an export has to account for. */
    List<DocumentRecord> findBySubmissionId(UUID submissionId);

    /** Evidence attached to one indicator, which is the unit the review screens work in. */
    List<DocumentRecord> findByTargetIdOrderByUploadedAtAsc(UUID targetId);

    /**
     * Evidence attached to one indicator within one filing.
     *
     * <p>Kept separate from the per target query because a target carries evidence across every
     * quarter it was reported in, and a reviewer looking at Q2 should not be shown Q1's documents
     * as though they supported this quarter's figure.
     */
    List<DocumentRecord> findBySubmissionIdAndTargetIdOrderByUploadedAtAsc(UUID submissionId, UUID targetId);

    /**
     * The version in force for one document, or empty where the key has never been seen.
     *
     * <p>A partial unique index on (entity_id, lower(document_key)) where superseded_on is null
     * makes "at most one" a fact about the database, so this returns an Optional rather than a
     * list. The comparison ignores case for the same reason the index does: SharePoint paths are
     * case-insensitive, and a fork in the version chain over capitalisation would be invisible.
     */
    Optional<DocumentRecord> findByEntityIdAndDocumentKeyIgnoreCaseAndSupersededOnIsNull(UUID entityId, String documentKey);

    /** The whole chain for one document, newest first. This is the version history a reviewer reads. */
    List<DocumentRecord> findByEntityIdAndDocumentKeyIgnoreCaseOrderByVersionDesc(UUID entityId, String documentKey);

    /** Current versions only: the workspace file list. */
    List<DocumentRecord> findByEntityIdAndSupersededOnIsNullOrderByUploadedAtDesc(UUID entityId);

    /** Reverse lookup from a Microsoft drive item to the version we already hold for it. */
    Optional<DocumentRecord> findByGraphItemIdAndSupersededOnIsNull(String graphItemId);

    /** Versions waiting to be pushed to Microsoft 365, oldest first so a backlog drains in order. */
    List<DocumentRecord> findByGraphSyncStateInOrderByUploadedAtAsc(
            Collection<Enums.GraphSyncState> states);

    /** Awaiting a departmental decision. The DSAC reviewer's queue. */
    List<DocumentRecord> findByApprovalStatusAndSupersededOnIsNull(Enums.ApprovalStatus status);
}
