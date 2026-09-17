package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import za.gov.dsac.vuka.domain.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ExtractionResultRepository extends JpaRepository<ExtractionResult, UUID> {

    List<ExtractionResult> findBySubmissionId(UUID submissionId);
    List<ExtractionResult> findBySubmissionIdAndConfirmedFalse(UUID submissionId);
}
