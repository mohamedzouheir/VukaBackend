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
}
