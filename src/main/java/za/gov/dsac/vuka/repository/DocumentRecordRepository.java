package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import za.gov.dsac.vuka.domain.*;

import java.time.LocalDate;
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
}
