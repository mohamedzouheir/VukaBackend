package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import za.gov.dsac.vuka.domain.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SubmissionRepository extends JpaRepository<Submission, UUID> {

    /** With the period loaded: the phone home renders its label and deadline after the session closes. */
    @EntityGraph(attributePaths = {"reportingPeriod"})
    List<Submission> findByEntityIdOrderByCreatedAtDesc(UUID entityId);
    Optional<Submission> findByEntityIdAndReportingPeriodId(UUID entityId, UUID reportingPeriodId);
    List<Submission> findByStatus(Enums.SubmissionStatus status);

    /** Every filing for one period. The review queue reads this once rather than per entity. */
    List<Submission> findByReportingPeriodId(UUID reportingPeriodId);

    List<Submission> findAllByOrderByCreatedAtDesc();

    /**
     * One submission with its entity and period loaded. Controllers read both after the
     * repository call has closed its session, and open-in-view is off, so a lazy proxy there
     * throws rather than loading.
     */
    @EntityGraph(attributePaths = {"entity", "reportingPeriod", "reportingPeriod.financialYear"})
    Optional<Submission> findWithEntityAndPeriodById(UUID id);
}
